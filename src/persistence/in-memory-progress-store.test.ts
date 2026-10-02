import { describe, expect, it } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK } from '../contracts/penguin';
import type { BadgeId, GameEventMap } from '../contracts/game-events';
import {
  createInMemoryProgressStore,
  createInMemoryProgressStoreWithControls,
} from './in-memory-progress-store';
import {
  describeProgressStoreContract,
  type ProgressStoreHarness,
} from './testing/progress-store.contract';

/**
 * A controllable clock: `advanceSeconds` moves it forward without a real
 * wait. It starts at midday Eastern, well outside Night Owl's 02:00-05:00
 * window (#138 D16).
 */
function makeHarness(): Promise<ProgressStoreHarness> {
  let currentMs = Date.parse('2026-09-24T16:00:00.000Z');
  const { store, grantTokens, holdBadge, setStairTally } = createInMemoryProgressStoreWithControls({
    now: () => currentMs,
  });
  return Promise.resolve({
    store,
    advanceSeconds(seconds: number): Promise<void> {
      currentMs += seconds * 1000;
      return Promise.resolve();
    },
    grantTokens(tokens: number): Promise<void> {
      grantTokens(tokens);
      return Promise.resolve();
    },
    holdBadge(badgeId: BadgeId): Promise<void> {
      holdBadge(badgeId);
      return Promise.resolve();
    },
    setStairTally(tokensToday: number, tokensDay?: string): Promise<void> {
      setStairTally(tokensToday, tokensDay);
      return Promise.resolve();
    },
  });
}

describeProgressStoreContract('createInMemoryProgressStore', makeHarness);

describe('createInMemoryProgressStore event emission', () => {
  it('emits tokens:changed with the new balance after a successful recordRound', async () => {
    const emitter = createEmitter<GameEventMap>();
    const balances: number[] = [];
    emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
    const store = createInMemoryProgressStore({ emitter });

    const result = await store.recordRound('bug-squash', 520, {
      score: 520,
      squashed: 520,
      bestCombo: 0,
      escaped: 0,
    });

    expect(balances).toEqual([result.balance]);
  });

  it('emits tokens:changed with the new balance after a successful completeQuest', async () => {
    const emitter = createEmitter<GameEventMap>();
    const balances: number[] = [];
    emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
    const store = createInMemoryProgressStore({ emitter, completedLook: DEFAULT_LOOK });
    await store.markDevPitVisited();
    await store.recordRound('bug-squash', 0, { score: 0, squashed: 0, bestCombo: 0, escaped: 0 });
    await store.recordRound('pancake-flip', 0, {
      golden: 0,
      flipNow: 0,
      raw: 0,
      burnt: 0,
      stacked: 0,
      bestStreak: 0,
    });
    await store.purchase('beanbag');
    balances.length = 0;

    const result = await store.completeQuest('main');

    expect(balances).toEqual([result.balance]);
  });

  it('emits tokens:changed with the new balance after a successful purchase', async () => {
    const emitter = createEmitter<GameEventMap>();
    const balances: number[] = [];
    emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
    const store = createInMemoryProgressStore({ emitter });

    const result = await store.purchase('beanbag');

    expect(balances).toEqual([result.balance]);
  });

  it('emits badge:earned only on the round that first earns the Badge', async () => {
    const emitter = createEmitter<GameEventMap>();
    const badgeEvents: BadgeId[] = [];
    emitter.on('badge:earned', ({ badgeId }) => badgeEvents.push(badgeId));
    let currentMs = 0;
    const store = createInMemoryProgressStore({ emitter, now: () => currentMs });

    await store.recordRound('bug-squash', 520, {
      score: 520,
      squashed: 520,
      bestCombo: 0,
      escaped: 0,
    });
    currentMs += 60_000;
    await store.recordRound('bug-squash', 520, {
      score: 520,
      squashed: 520,
      bestCombo: 0,
      escaped: 0,
    });

    expect(badgeEvents).toEqual(['exterminator']);
  });

  it('works without an emitter', async () => {
    const store = createInMemoryProgressStore();

    await expect(
      store.recordRound('bug-squash', 520, { score: 520, squashed: 520, bestCombo: 0, escaped: 0 }),
    ).resolves.toBeDefined();
    await expect(store.purchase('beanbag')).resolves.toBeDefined();
  });
});

describe('createInMemoryProgressStore Stairs Challenge clock (#51 slice 4)', () => {
  it('resets the daily tally at 00:00 America/New_York, by its injected clock', async () => {
    // 23:59:50 EDT on 2026-09-27.
    let currentMs = Date.parse('2026-09-28T03:59:50.000Z');
    const { store, setStairTally } = createInMemoryProgressStoreWithControls({
      now: () => currentMs,
    });
    await store.logStairFlight(0);
    setStairTally(95, '2026-09-27');

    currentMs += 3000; // 23:59:53 EDT: the same day, so 5 more reach the cap.
    expect(await store.logStairFlight(1)).toMatchObject({
      tokensAwarded: 5,
      flightTokensToday: 100,
    });
    currentMs += 3000; // 23:59:56 EDT: capped.
    expect(await store.logStairFlight(2)).toMatchObject({
      tokensAwarded: 0,
      flightTokensToday: 100,
    });

    currentMs = Date.parse('2026-09-28T04:00:00.000Z'); // 00:00:00 EDT, the next day.
    expect((await store.getStairClimb()).flightTokensToday).toBe(0);
    expect(await store.logStairFlight(3)).toMatchObject({
      logged: true,
      tokensAwarded: 10,
      flightTokensToday: 10,
    });
  });

  it('emits the balance on a paid flight and badge:earned once, on the first full climb only', async () => {
    const emitter = createEmitter<GameEventMap>();
    const events: string[] = [];
    emitter.on('tokens:changed', ({ balance }) => events.push(`tokens:${balance}`));
    emitter.on('badge:earned', ({ badgeId }) => events.push(`badge:${badgeId}`));
    let currentMs = Date.parse('2026-09-24T16:00:00.000Z');
    const store = createInMemoryProgressStore({ emitter, now: () => currentMs });

    for (let climb = 0; climb < 2; climb += 1) {
      await store.logStairFlight(0);
      for (let floor = 1; floor <= 5; floor += 1) {
        currentMs += 3000;
        await store.logStairFlight(floor);
      }
    }
    // Nothing logged, nothing emitted.
    await store.logStairFlight(5);

    expect(events).toEqual([
      'tokens:110',
      'tokens:120',
      'tokens:130',
      'tokens:140',
      'tokens:200',
      'badge:stair-master',
      'tokens:210',
      'tokens:220',
      'tokens:230',
      'tokens:240',
      'tokens:250',
    ]);
  });
});
