// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindPlayer, type Player } from '../auth/player';
import { createEmitter } from '../contracts/emitter';
import { gameEvents, type GameEventMap } from '../contracts/game-events';
import { DEFAULT_LOOK } from '../contracts/penguin';
import {
  createInMemoryProgressStore,
  createInMemoryProgressStoreWithControls,
} from './in-memory-progress-store';
import { wireBadgeToast } from '../ui/badge-toast';
import { createBadgePopup } from '../ui/badge-unlock-panel';
import {
  emptySlots,
  type BadgeCheckResult,
  type ProgressSnapshot,
  type ProgressStore,
} from './progress-store';
import {
  createActiveProgressStore,
  createProgressSession,
  PROGRESS_KEY,
  PROGRESS_STORE_KEY,
  type ProgressSessionRegistry,
} from './progress-session';

const PLAYER: Player = { id: 'player-1', displayName: 'Chilly Name', look: DEFAULT_LOOK };

function createFakeRegistry(): ProgressSessionRegistry & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
  };
}

function makeSnapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    look: DEFAULT_LOOK,
    profileCreatedAt: null,
    tokens: 100,
    badges: [],
    bests: {},
    ownedItems: [],
    slots: emptySlots(),
    catalog: [],
    badgeCatalog: [],
    ...overrides,
  };
}

/** A `ProgressStore` whose `loadAll` never resolves until `resolve()` is called. */
function deferredStore(): { store: ProgressStore; resolve: (snapshot: ProgressSnapshot) => void } {
  let resolveFn!: (snapshot: ProgressSnapshot) => void;
  const promise = new Promise<ProgressSnapshot>((resolve) => {
    resolveFn = resolve;
  });
  return {
    store: {
      loadAll: () => promise,
      saveLook: () => Promise.reject(new Error('unused in this test')),
      recordRound: () => Promise.reject(new Error('unused in this test')),
      purchase: () => Promise.reject(new Error('unused in this test')),
      setSlot: () => Promise.reject(new Error('unused in this test')),
      leaderboard: () => Promise.reject(new Error('unused in this test')),
      questProgress: () => Promise.reject(new Error('unused in this test')),
      markDevPitVisited: () => Promise.reject(new Error('unused in this test')),
      completeQuest: () => Promise.reject(new Error('unused in this test')),
      checkBadges: () => Promise.reject(new Error('unused in this test')),
    },
    resolve: resolveFn,
  };
}

/** A `ProgressStore` whose `loadAll` always rejects. */
function failingStore(): ProgressStore {
  return {
    loadAll: () => Promise.reject(new Error('no_player')),
    saveLook: () => Promise.reject(new Error('unused in this test')),
    recordRound: () => Promise.reject(new Error('unused in this test')),
    purchase: () => Promise.reject(new Error('unused in this test')),
    setSlot: () => Promise.reject(new Error('unused in this test')),
    leaderboard: () => Promise.reject(new Error('unused in this test')),
    questProgress: () => Promise.reject(new Error('unused in this test')),
    markDevPitVisited: () => Promise.reject(new Error('unused in this test')),
    completeQuest: () => Promise.reject(new Error('unused in this test')),
    checkBadges: () => Promise.reject(new Error('unused in this test')),
  };
}

describe('createProgressSession', () => {
  describe('start', () => {
    it('loads progress into the registry, rebinds player.look, and emits tokens:changed', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const balances: number[] = [];
      emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
      const session = createProgressSession({ registry, emitter });
      const store = createInMemoryProgressStore({ emitter });
      await store.saveLook({ ...DEFAULT_LOOK, name: 'Chilly' });

      const snapshot = await session.start(PLAYER, store);

      expect(snapshot?.look.name).toBe('Chilly');
      expect(registry.get(PROGRESS_KEY)).toEqual(snapshot);
      expect(registry.get(PROGRESS_STORE_KEY)).toBeDefined();
      expect((registry.get('player') as Player).look.name).toBe('Chilly');
      expect(balances).toEqual([snapshot?.tokens]);
    });

    it('returns null without rejecting when loadAll fails, leaving the store registered for a retry', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      let calls = 0;
      const store: ProgressStore = {
        ...failingStore(),
        loadAll: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(new Error('network down'))
            : Promise.resolve(makeSnapshot({ tokens: 42 }));
        },
      };

      const result = await session.start(PLAYER, store);

      expect(result).toBeNull();
      expect(registry.get(PROGRESS_KEY)).toBeUndefined();
      const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
      await expect(wrapped.loadAll()).resolves.toMatchObject({ tokens: 42 });
      expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).tokens).toBe(42);
    });

    it('registers the store at once, and a loadAll during the sign-in load shares it', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const deferred = deferredStore();
      let calls = 0;
      const store: ProgressStore = {
        ...deferred.store,
        loadAll: () => {
          calls += 1;
          return deferred.store.loadAll();
        },
      };

      const started = session.start(PLAYER, store);
      const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
      expect(wrapped).toBeDefined();
      const consumerLoad = wrapped.loadAll();
      deferred.resolve(makeSnapshot({ tokens: 7 }));

      await expect(consumerLoad).resolves.toMatchObject({ tokens: 7 });
      await expect(started).resolves.toMatchObject({ tokens: 7 });
      expect(calls).toBe(1);
    });

    it('drops a load that resolves after stop()', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const { store, resolve } = deferredStore();

      const pending = session.start(PLAYER, store);
      session.stop();
      resolve(makeSnapshot({ tokens: 999 }));

      const result = await pending;

      expect(result).toBeNull();
      expect(registry.get(PROGRESS_KEY)).toBeUndefined();
      expect(registry.get(PROGRESS_STORE_KEY)).toBeUndefined();
    });

    it('drops a load superseded by a newer start()', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const { store: staleStore, resolve: resolveStale } = deferredStore();
      const freshStore = createInMemoryProgressStore({ emitter });

      const stalePending = session.start(PLAYER, staleStore);
      const fresh = await session.start(PLAYER, freshStore);
      resolveStale(makeSnapshot({ tokens: 999 }));
      const stale = await stalePending;

      expect(stale).toBeNull();
      expect(fresh).not.toBeNull();
      expect(registry.get(PROGRESS_KEY)).toEqual(fresh);
      expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).tokens).not.toBe(999);
    });
  });

  describe('the tracking store wrapper', () => {
    async function setup() {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const store = createInMemoryProgressStore({ emitter });
      await session.start(PLAYER, store);
      const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
      return { registry, emitter, session, wrapped };
    }

    it('saveLook updates the snapshot look, sets profileCreatedAt once, and rebinds player.look', async () => {
      const { registry, wrapped } = await setup();
      const newLook = { ...DEFAULT_LOOK, name: 'Chilly' };

      await wrapped.saveLook(newLook);

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.look).toEqual(newLook);
      expect(snapshot.profileCreatedAt).not.toBeNull();
      expect((registry.get('player') as Player).look).toEqual(newLook);

      const createdAt = snapshot.profileCreatedAt;
      await wrapped.saveLook({ ...newLook, name: 'Still Chilly' });
      expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).profileCreatedAt).toBe(createdAt);
    });

    it('recordRound updates tokens, adds the badge, and records a new best', async () => {
      const { registry, wrapped } = await setup();

      const result = await wrapped.recordRound('bug-squash', 520, {
        score: 520,
        squashed: 520,
        bestCombo: 0,
        escaped: 0,
      });

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.tokens).toBe(result.balance);
      expect(snapshot.badges).toEqual(['exterminator']);
      expect(snapshot.bests['bug-squash']).toBe(520);
    });

    it('recordRound never adds the same badge twice', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      let balance = 100;
      const store: ProgressStore = {
        loadAll: () => Promise.resolve(makeSnapshot({ tokens: balance })),
        saveLook: () => Promise.reject(new Error('unused in this test')),
        recordRound: () => {
          balance += 10;
          return Promise.resolve({
            tokensAwarded: 10,
            balance,
            newBest: false,
            badgeEarned: true,
            badgesEarned: ['exterminator'],
          });
        },
        purchase: () => Promise.reject(new Error('unused in this test')),
        setSlot: () => Promise.reject(new Error('unused in this test')),
        leaderboard: () => Promise.reject(new Error('unused in this test')),
        questProgress: () => Promise.reject(new Error('unused in this test')),
        markDevPitVisited: () => Promise.reject(new Error('unused in this test')),
        completeQuest: () => Promise.reject(new Error('unused in this test')),
        checkBadges: () => Promise.reject(new Error('unused in this test')),
      };
      await session.start(PLAYER, store);
      const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;

      await wrapped.recordRound('bug-squash', 520, {
        score: 520,
        squashed: 520,
        bestCombo: 0,
        escaped: 0,
      });
      await wrapped.recordRound('bug-squash', 520, {
        score: 520,
        squashed: 520,
        bestCombo: 0,
        escaped: 0,
      });

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.badges).toEqual(['exterminator']);
      expect(snapshot.tokens).toBe(balance);
    });

    it('purchase updates tokens and appends the owned item', async () => {
      const { registry, wrapped } = await setup();
      await wrapped.recordRound('bug-squash', 520, {
        score: 520,
        squashed: 520,
        bestCombo: 0,
        escaped: 0,
      });

      const result = await wrapped.purchase('beanbag');

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.tokens).toBe(result.balance);
      expect(snapshot.ownedItems).toEqual(['beanbag']);
    });

    it('completeQuest keeps the snapshot balance current; questProgress and markDevPitVisited pass through', async () => {
      const { registry, wrapped } = await setup();
      await wrapped.saveLook({ ...DEFAULT_LOOK, name: 'Chilly' });
      await wrapped.markDevPitVisited();
      await wrapped.recordRound('bug-squash', 0, {
        score: 0,
        squashed: 0,
        bestCombo: 0,
        escaped: 0,
      });
      await wrapped.recordRound('pancake-flip', 0, {
        golden: 0,
        flipNow: 0,
        raw: 0,
        burnt: 0,
        stacked: 0,
        bestStreak: 0,
      });
      await wrapped.purchase('beanbag');

      expect(await wrapped.questProgress()).toEqual({
        devPitVisited: true,
        roundsFinished: ['bug-squash', 'pancake-flip'],
        completedQuests: [],
        matchWins: {},
      });
      const result = await wrapped.completeQuest('main');

      // #138: Ship It's +50 is in the balance and its id in badgesEarned.
      expect(result).toEqual({
        tokensAwarded: 150,
        balance: 250,
        alreadyCompleted: false,
        badgesEarned: ['ship-it'],
      });
      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.tokens).toBe(250);
      expect(snapshot.badges).toEqual(['ship-it']);
    });

    it('setSlot moves an item between slots and empties on null', async () => {
      const { registry, wrapped } = await setup();
      await wrapped.recordRound('bug-squash', 520, {
        score: 520,
        squashed: 520,
        bestCombo: 0,
        escaped: 0,
      });
      await wrapped.purchase('beanbag');

      await wrapped.setSlot(1, 'beanbag');
      expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).slots[1]).toBe('beanbag');

      await wrapped.setSlot(2, 'beanbag');
      const moved = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(moved.slots[1]).toBeNull();
      expect(moved.slots[2]).toBe('beanbag');

      await wrapped.setSlot(2, null);
      expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).slots[2]).toBeNull();
    });

    describe('announces each badge exactly once (#138 D10)', () => {
      // Midday Eastern, outside Night Owl's window, so only the Badge under
      // test can be newly awarded.
      const NOON_EASTERN = Date.parse('2026-09-27T16:00:00.000Z');
      const FLOOR_ITEMS = ['beanbag', 'desk', 'speakers', 'dual-monitors', 'arcade-cabinet'];

      // The wiring `main.ts` uses: the session emits on `gameEvents`, the
      // store is built with `session.storeEmitter`, and `wireBadgeToast`
      // routes every `badge:earned` to the real Badge popup (or, for a
      // Minigame Badge, the toast).
      const cleanups: Array<() => void> = [];
      beforeEach(() => {
        document.body.innerHTML = '';
      });
      afterEach(() => {
        while (cleanups.length > 0) cleanups.pop()!();
      });

      function wireAnnouncements() {
        const root = document.createElement('div');
        document.body.append(root);
        const popup = createBadgePopup(root);
        const unwire = wireBadgeToast({ popup });
        const toasts: string[] = [];
        const unToast = gameEvents.on('ui:toast', ({ message }) => toasts.push(message));
        cleanups.push(unToast, unwire, () => popup.destroy());
        /** Every Badge popup panel shown, in order, clicking each one closed. */
        function panels(): string[] {
          const shown: string[] = [];
          const panel = root.querySelector<HTMLElement>('.badge-popup')!;
          while (!panel.hidden) {
            shown.push(panel.querySelector('.minigame__done-badge-name')!.textContent ?? '');
            panel.click();
          }
          return shown;
        }
        return { panels, toasts };
      }

      async function announceSetup() {
        const registry = createFakeRegistry();
        const session = createProgressSession({ registry, emitter: gameEvents });
        const { panels, toasts } = wireAnnouncements();
        const controls = createInMemoryProgressStoreWithControls({
          emitter: session.storeEmitter,
          now: () => NOON_EASTERN,
        });
        await session.start(PLAYER, controls.store);
        cleanups.push(() => session.stop());
        const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
        return { registry, wrapped, controls, panels, toasts };
      }

      async function placeSixItems(
        wrapped: ProgressStore,
        grantTokens: (tokens: number) => void,
      ): Promise<void> {
        grantTokens(700);
        for (const itemId of [...FLOOR_ITEMS, 'rgb-light-strip']) {
          await wrapped.purchase(itemId);
        }
        for (const [index, itemId] of FLOOR_ITEMS.entries()) {
          await wrapped.setSlot((index + 1) as 1 | 2 | 3 | 4 | 5, itemId);
        }
        // #135: the RGB Light Strip is a wall item, so it hangs in wall slot 7.
        await wrapped.setSlot(7, 'rgb-light-strip');
      }

      it('Ship It through completeQuest, then a Session check', async () => {
        const { wrapped, panels, toasts } = await announceSetup();
        await wrapped.saveLook({ ...DEFAULT_LOOK, name: 'Shipper' });
        await wrapped.markDevPitVisited();
        await wrapped.recordRound('bug-squash', 0, {
          score: 0,
          squashed: 0,
          bestCombo: 0,
          escaped: 0,
        });
        await wrapped.recordRound('pancake-flip', 0, {
          golden: 0,
          flipNow: 0,
          raw: 0,
          burnt: 0,
          stacked: 0,
          bestStreak: 0,
        });
        await wrapped.purchase('beanbag');
        await wrapped.checkBadges(); // First Waddle, before the Quest.
        expect(panels()).toEqual(['Badge unlocked: First Waddle']);

        await wrapped.completeQuest('main');
        await wrapped.checkBadges();

        expect(panels()).toEqual(['Badge unlocked: Ship It']);
        expect(toasts).toEqual([]);
      });

      it('a Minigame Badge through recordRound, then a Session check', async () => {
        const { wrapped, panels, toasts } = await announceSetup();

        await wrapped.recordRound('bug-squash', 520, {
          score: 520,
          squashed: 520,
          bestCombo: 0,
          escaped: 0,
        });
        await wrapped.checkBadges();

        expect(toasts).toEqual(['Badge unlocked: Exterminator']);
        expect(panels()).toEqual([]);
      });

      it('Interior Penguin through the sixth setSlot, then a Session check', async () => {
        const { wrapped, controls, panels } = await announceSetup();

        await placeSixItems(wrapped, controls.grantTokens);
        await wrapped.checkBadges();

        expect(panels()).toEqual(['Badge unlocked: Interior Penguin']);
      });

      it('Interior Penguin with a loadAll right after the sixth setSlot, as the igloo editor refreshes', async () => {
        const { registry, wrapped, controls, panels } = await announceSetup();

        await placeSixItems(wrapped, controls.grantTokens);
        await wrapped.loadAll();
        await wrapped.checkBadges();

        expect(panels()).toEqual(['Badge unlocked: Interior Penguin']);
        expect((registry.get(PROGRESS_KEY) as ProgressSnapshot).badges).toContain(
          'interior-penguin',
        );
      });

      it('First Waddle through two Session checks', async () => {
        const { registry, wrapped, panels } = await announceSetup();
        await wrapped.saveLook({ ...DEFAULT_LOOK, name: 'Waddler' });

        const first = await wrapped.checkBadges();
        await wrapped.checkBadges();

        expect(panels()).toEqual(['Badge unlocked: First Waddle']);
        const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
        expect(snapshot.badges).toEqual(['first-waddle']);
        expect(snapshot.tokens).toBe(first.balance);
      });

      it('announces nothing, and changes nothing, with no snapshot loaded', async () => {
        const registry = createFakeRegistry();
        const session = createProgressSession({ registry, emitter: gameEvents });
        cleanups.push(() => session.stop());
        const { panels, toasts } = wireAnnouncements();
        const store = createInMemoryProgressStore({
          emitter: session.storeEmitter,
          now: () => NOON_EASTERN,
        });
        await store.saveLook({ ...DEFAULT_LOOK, name: 'Early' });
        const { store: failing, resolve } = deferredStore();
        const pending = session.start(PLAYER, { ...failing, checkBadges: store.checkBadges });
        const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;

        await wrapped.checkBadges();

        expect(panels()).toEqual([]);
        expect(toasts).toEqual([]);
        expect(registry.get(PROGRESS_KEY)).toBeUndefined();
        resolve(makeSnapshot());
        await pending;
      });

      describe('when a Session check races a direct award', () => {
        function gate<T>(): { promise: Promise<T>; release: (value: T) => void } {
          let release!: (value: T) => void;
          const promise = new Promise<T>((resolve) => {
            release = resolve;
          });
          return { promise, release };
        }

        /**
         * A store whose completeQuest, recordRound and checkBadges wait for
         * the test to release them. Released, completeQuest and recordRound
         * announce through the store emitter, as the Supabase store does.
         */
        async function racingSetup() {
          const registry = createFakeRegistry();
          const session = createProgressSession({ registry, emitter: gameEvents });
          cleanups.push(() => session.stop());
          const { panels, toasts } = wireAnnouncements();
          const balances: number[] = [];
          cleanups.push(gameEvents.on('tokens:changed', ({ balance }) => balances.push(balance)));
          const quest = gate<void>();
          const round = gate<void>();
          const checks: Array<{ release: (value: BadgeCheckResult) => void }> = [];
          const { store: base } = deferredStore();
          const store: ProgressStore = {
            ...base,
            loadAll: () => Promise.resolve(makeSnapshot({ tokens: 200 })),
            completeQuest: async () => {
              await quest.promise;
              session.storeEmitter.emit('tokens:changed', { balance: 400 });
              session.storeEmitter.emit('badge:earned', { badgeId: 'ship-it' });
              return {
                tokensAwarded: 150,
                balance: 400,
                alreadyCompleted: false,
                badgesEarned: ['ship-it'],
              };
            },
            recordRound: async () => {
              await round.promise;
              session.storeEmitter.emit('tokens:changed', { balance: 275 });
              session.storeEmitter.emit('badge:earned', { badgeId: 'exterminator' });
              return {
                tokensAwarded: 25,
                balance: 275,
                newBest: true,
                badgeEarned: true,
                badgesEarned: ['exterminator'],
              };
            },
            checkBadges: () => {
              const check = gate<BadgeCheckResult>();
              checks.push(check);
              return check.promise;
            },
          };
          await session.start(PLAYER, store);
          balances.length = 0;
          const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
          const tokens = () => (registry.get(PROGRESS_KEY) as ProgressSnapshot).tokens;
          return {
            session,
            store,
            wrapped,
            quest,
            round,
            checks,
            panels,
            toasts,
            balances,
            tokens,
          };
        }

        const BIG_ROUND = { score: 520, squashed: 520, bestCombo: 0, escaped: 0 };

        it('the check resolves first: Ship It shows once, and the check leaves the balance alone', async () => {
          const { wrapped, quest, checks, panels, balances, tokens } = await racingSetup();
          const completing = wrapped.completeQuest('main');
          const checking = wrapped.checkBadges();

          checks[0].release({ badges: ['ship-it'], balance: 400 });
          await checking;
          expect(tokens()).toBe(200);
          quest.release();
          await completing;

          expect(panels()).toEqual(['Badge unlocked: Ship It']);
          expect(tokens()).toBe(400);
          expect(balances).toEqual([400]);
        });

        it('the Quest resolves first: Ship It shows once, and a stale check balance never overwrites it', async () => {
          const { wrapped, quest, checks, panels, balances, tokens } = await racingSetup();
          // The check was sent before the Quest, so its balance predates the Quest's Tokens.
          const checking = wrapped.checkBadges();
          const completing = wrapped.completeQuest('main');

          quest.release();
          await completing;
          checks[0].release({ badges: ['ship-it'], balance: 200 });
          await checking;

          expect(panels()).toEqual(['Badge unlocked: Ship It']);
          expect(tokens()).toBe(400);
          expect(balances).toEqual([400]);
        });

        it('the check resolves before recordRound: the Minigame Badge is toasted once', async () => {
          const { wrapped, round, checks, toasts, panels, tokens } = await racingSetup();
          const recording = wrapped.recordRound('bug-squash', 520, BIG_ROUND);
          const checking = wrapped.checkBadges();

          checks[0].release({ badges: ['exterminator'], balance: 275 });
          await checking;
          round.release();
          await recording;

          expect(toasts).toEqual(['Badge unlocked: Exterminator']);
          expect(panels()).toEqual([]);
          expect(tokens()).toBe(275);
        });

        it('recordRound resolves first: the Minigame Badge is toasted once', async () => {
          const { wrapped, round, checks, toasts, tokens } = await racingSetup();
          const checking = wrapped.checkBadges();
          const recording = wrapped.recordRound('bug-squash', 520, BIG_ROUND);

          round.release();
          await recording;
          checks[0].release({ badges: ['exterminator'], balance: 200 });
          await checking;

          expect(toasts).toEqual(['Badge unlocked: Exterminator']);
          expect(tokens()).toBe(275);
        });

        it('a check with no write overlapping it still updates the balance', async () => {
          const { wrapped, checks, balances, tokens } = await racingSetup();
          const checking = wrapped.checkBadges();

          checks[0].release({ badges: [], balance: 250 });
          await checking;

          expect(tokens()).toBe(250);
          expect(balances).toEqual([250]);
        });

        it('resets the announced set on stop() and a new start()', async () => {
          const { session, store, wrapped, checks, panels } = await racingSetup();
          const checking = wrapped.checkBadges();
          checks[0].release({ badges: ['ship-it'], balance: 400 });
          await checking;
          expect(panels()).toEqual(['Badge unlocked: Ship It']);

          session.stop();
          await session.start(PLAYER, store);
          session.storeEmitter.emit('badge:earned', { badgeId: 'ship-it' });

          expect(panels()).toEqual(['Badge unlocked: Ship It']);
        });
      });
    });

    it('leaderboard forwards straight to the store, without touching the snapshot', async () => {
      const { registry, wrapped } = await setup();
      const before = registry.get(PROGRESS_KEY);

      const entries = await wrapped.leaderboard('bug-squash', 5);

      expect(entries).toEqual([]);
      expect(registry.get(PROGRESS_KEY)).toBe(before);
    });

    it('a saveLook that resolves after stop() leaves `player` and `progress` absent', async () => {
      const { registry, session, wrapped } = await setup();

      // Simulate a sign-out racing the in-flight write: bindPlayer(null) and
      // stop() both run (as main.ts's onSignedOut does) before this saveLook
      // settles.
      const pending = wrapped.saveLook({ ...DEFAULT_LOOK, name: 'Too Late' });
      bindPlayer(registry, null);
      session.stop();
      await pending;

      expect(registry.get(PROGRESS_KEY)).toBeUndefined();
      expect(registry.get('player')).toBeUndefined();
    });

    it('a write from an old session does not modify the snapshot of a newer start()', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const oldStore = createInMemoryProgressStore({ emitter });
      await session.start(PLAYER, oldStore);
      const oldWrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;

      const newStore = createInMemoryProgressStore({ emitter });
      const fresh = await session.start(PLAYER, newStore);

      const result = await oldWrapped.purchase('beanbag');

      expect(result.balance).toBe(50);
      expect(registry.get(PROGRESS_KEY)).toEqual(fresh);
    });
  });

  describe('stop', () => {
    it('removes both registry keys', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });
      const store = createInMemoryProgressStore({ emitter });
      await session.start(PLAYER, store);
      expect(registry.get(PROGRESS_KEY)).toBeDefined();
      expect(registry.get(PROGRESS_STORE_KEY)).toBeDefined();

      session.stop();

      expect(registry.get(PROGRESS_KEY)).toBeUndefined();
      expect(registry.get(PROGRESS_STORE_KEY)).toBeUndefined();
    });

    it('emits tokens:changed with balance 0, so the HUD never shows a stale balance', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const balances: number[] = [];
      emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
      const session = createProgressSession({ registry, emitter });
      const store = createInMemoryProgressStore({ emitter });
      await session.start(PLAYER, store);

      session.stop();

      expect(balances[balances.length - 1]).toBe(0);
    });
  });
});

describe('createActiveProgressStore', () => {
  it('forwards to the signed-in store under PROGRESS_STORE_KEY', async () => {
    const registry = createFakeRegistry();
    registry.set(PROGRESS_STORE_KEY, createInMemoryProgressStore());
    const active = createActiveProgressStore(registry);

    await expect(active.purchase('beanbag')).resolves.toEqual({ balance: 50 });
  });

  it('uses the fallback when nobody is signed in', async () => {
    const registry = createFakeRegistry();
    const fallback = createInMemoryProgressStore();
    const active = createActiveProgressStore(registry, () => fallback);

    await expect(active.loadAll()).resolves.toMatchObject({ tokens: 100 });
  });

  it('rejects with not_authenticated when nobody is signed in and there is no fallback', async () => {
    const active = createActiveProgressStore(createFakeRegistry());

    await expect(active.loadAll()).rejects.toMatchObject({ code: 'not_authenticated' });
    await expect(active.setSlot(1, null)).rejects.toMatchObject({ code: 'not_authenticated' });
    await expect(active.leaderboard('bug-squash')).rejects.toMatchObject({
      code: 'not_authenticated',
    });
    await expect(active.questProgress()).rejects.toMatchObject({ code: 'not_authenticated' });
    await expect(active.completeQuest('main')).rejects.toMatchObject({
      code: 'not_authenticated',
    });
  });

  it('forwards the Quest methods to the signed-in store', async () => {
    const registry = createFakeRegistry();
    registry.set(PROGRESS_STORE_KEY, createInMemoryProgressStore());
    const active = createActiveProgressStore(registry);

    await active.markDevPitVisited();

    expect((await active.questProgress()).devPitVisited).toBe(true);
    await expect(active.completeQuest('main')).rejects.toMatchObject({
      code: 'quest_incomplete',
    });
  });
});
