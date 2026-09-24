import { describe, expect, it } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import type { BadgeId, GameEventMap } from '../contracts/game-events';
import { createInMemoryProgressStore } from './in-memory-progress-store';
import {
  describeProgressStoreContract,
  type ProgressStoreHarness,
} from './progress-store.contract';

/** A controllable clock: `advanceSeconds` moves it forward without a real wait. */
function makeHarness(): Promise<ProgressStoreHarness> {
  let currentMs = Date.parse('2026-09-24T00:00:00.000Z');
  const store = createInMemoryProgressStore({ now: () => currentMs });
  return Promise.resolve({
    store,
    advanceSeconds(seconds: number): Promise<void> {
      currentMs += seconds * 1000;
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

    const result = await store.recordRound('bug-squash', 520, { squashed: 520 });

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

    await store.recordRound('bug-squash', 520, { squashed: 520 });
    currentMs += 60_000;
    await store.recordRound('bug-squash', 520, { squashed: 520 });

    expect(badgeEvents).toEqual(['exterminator']);
  });

  it('emits nothing when no emitter is given', async () => {
    const store = createInMemoryProgressStore();

    await expect(store.recordRound('bug-squash', 520, { squashed: 520 })).resolves.toBeDefined();
    await expect(store.purchase('beanbag')).resolves.toBeDefined();
  });
});
