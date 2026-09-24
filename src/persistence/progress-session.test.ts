import { describe, expect, it } from 'vitest';
import { bindPlayer, type Player } from '../auth/player';
import { createEmitter } from '../contracts/emitter';
import type { GameEventMap } from '../contracts/game-events';
import { DEFAULT_LOOK } from '../contracts/penguin';
import { createInMemoryProgressStore } from './in-memory-progress-store';
import { emptySlots, type ProgressSnapshot, type ProgressStore } from './progress-store';
import {
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

    it('returns null and leaves the keys unset when loadAll fails, without rejecting', async () => {
      const registry = createFakeRegistry();
      const emitter = createEmitter<GameEventMap>();
      const session = createProgressSession({ registry, emitter });

      const result = await session.start(PLAYER, failingStore());

      expect(result).toBeNull();
      expect(registry.get(PROGRESS_KEY)).toBeUndefined();
      expect(registry.get(PROGRESS_STORE_KEY)).toBeUndefined();
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

      const result = await wrapped.recordRound('bug-squash', 520, { squashed: 520 });

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
          return Promise.resolve({ tokensAwarded: 10, balance, newBest: false, badgeEarned: true });
        },
        purchase: () => Promise.reject(new Error('unused in this test')),
        setSlot: () => Promise.reject(new Error('unused in this test')),
      };
      await session.start(PLAYER, store);
      const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;

      await wrapped.recordRound('bug-squash', 520, { squashed: 520 });
      await wrapped.recordRound('bug-squash', 520, { squashed: 520 });

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.badges).toEqual(['exterminator']);
      expect(snapshot.tokens).toBe(balance);
    });

    it('purchase updates tokens and appends the owned item', async () => {
      const { registry, wrapped } = await setup();
      await wrapped.recordRound('bug-squash', 520, { squashed: 520 });

      const result = await wrapped.purchase('beanbag');

      const snapshot = registry.get(PROGRESS_KEY) as ProgressSnapshot;
      expect(snapshot.tokens).toBe(result.balance);
      expect(snapshot.ownedItems).toEqual(['beanbag']);
    });

    it('setSlot moves an item between slots and empties on null', async () => {
      const { registry, wrapped } = await setup();
      await wrapped.recordRound('bug-squash', 520, { squashed: 520 });
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
