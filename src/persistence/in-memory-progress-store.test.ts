import { afterEach, describe, expect, it } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK } from '../contracts/penguin';
import type { BadgeId, GameEventMap } from '../contracts/game-events';
import {
  createInMemoryProgressStore,
  createInMemoryProgressStoreWithControls,
} from './in-memory-progress-store';
import { IN_MEMORY_STEPS_QUESTS, registerInMemoryStepsQuest } from './in-memory-steps-quests';
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
  const { store, grantTokens, holdBadge } = createInMemoryProgressStoreWithControls({
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

// The fake mirrors 20261006000000_quest_registry.sql: a steps Quest is a
// registry entry (its reward and its steps), and completeQuest pays any
// registered Quest without knowing about it in advance.
describe('createInMemoryProgressStore steps Quest registry', () => {
  const unregister: Array<() => void> = [];
  afterEach(() => {
    while (unregister.length > 0) unregister.pop()!();
  });

  function registerExtraQuest(): { setStepB(met: boolean): void } {
    let stepB = false;
    unregister.push(
      registerInMemoryStepsQuest('proof-extra', {
        rewardTokens: 40,
        steps: (state) => ({ 'step-a': state.profileCreatedAt !== null, 'step-b': stepB }),
      }),
    );
    return {
      setStepB(met: boolean) {
        stepB = met;
      },
    };
  }

  it('seeds the main Quest with its 150-Token reward', () => {
    expect(IN_MEMORY_STEPS_QUESTS.get('main')?.rewardTokens).toBe(150);
  });

  it('refuses a registered Quest with quest_incomplete while one of its steps is false, paying nothing', async () => {
    registerExtraQuest();
    const store = createInMemoryProgressStore({ completedLook: DEFAULT_LOOK });

    await expect(store.completeQuest('proof-extra')).rejects.toMatchObject({
      code: 'quest_incomplete',
    });
    expect((await store.loadAll()).tokens).toBe(100);
    expect((await store.questProgress()).questSteps['proof-extra']).toEqual({
      'step-a': true,
      'step-b': false,
    });
  });

  it('pays a registered Quest its own reward once, with no Ship It, and reports it done', async () => {
    const extra = registerExtraQuest();
    const emitter = createEmitter<GameEventMap>();
    const badgeEvents: BadgeId[] = [];
    emitter.on('badge:earned', ({ badgeId }) => badgeEvents.push(badgeId));
    const store = createInMemoryProgressStore({ emitter, completedLook: DEFAULT_LOOK });
    extra.setStepB(true);

    const first = await store.completeQuest('proof-extra');
    const second = await store.completeQuest('proof-extra');

    expect(first).toEqual({
      tokensAwarded: 40,
      balance: 140,
      alreadyCompleted: false,
      badgesEarned: [],
    });
    expect(second).toEqual({
      tokensAwarded: 0,
      balance: 140,
      alreadyCompleted: true,
      badgesEarned: [],
    });
    expect(badgeEvents).toEqual([]);
    const progress = await store.questProgress();
    expect(progress.completedQuests).toEqual(['proof-extra']);
    expect(progress.questSteps['proof-extra']).toEqual({ 'step-a': true, 'step-b': true });
  });

  it('refuses a registered Quest with no steps as quest_incomplete', async () => {
    unregister.push(
      registerInMemoryStepsQuest('proof-empty', { rewardTokens: 10, steps: () => ({}) }),
    );
    const store = createInMemoryProgressStore({ completedLook: DEFAULT_LOOK });

    await expect(store.completeQuest('proof-empty')).rejects.toMatchObject({
      code: 'quest_incomplete',
    });
  });

  it('refuses a Quest id once it is unregistered, as unknown_quest', async () => {
    registerExtraQuest();
    unregister.pop()!();
    const store = createInMemoryProgressStore({ completedLook: DEFAULT_LOOK });

    await expect(store.completeQuest('proof-extra')).rejects.toMatchObject({
      code: 'unknown_quest',
    });
    expect((await store.questProgress()).questSteps).not.toHaveProperty('proof-extra');
  });
});
