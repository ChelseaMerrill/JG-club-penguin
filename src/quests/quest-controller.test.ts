import { describe, expect, it, vi } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import type { GameEventMap, MinigameStatsMap } from '../contracts/game-events';
import { DEFAULT_LOOK } from '../contracts/penguin';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import type { ProgressStore } from '../persistence/progress-store';
import { createQuestController, TRACKED_QUEST_STORAGE_KEY } from './quest-controller';
import { QUEST_DEFINITIONS } from './quest-definitions';

const IN_BUILD = QUEST_DEFINITIONS.filter((q) =>
  ['main', 'bug-squash', 'pancake-flip'].includes(q.id),
);

const ZERO_BUG_SQUASH: MinigameStatsMap['bug-squash'] = {
  score: 0,
  squashed: 0,
  bestCombo: 0,
  escaped: 0,
};
const ZERO_PANCAKE: MinigameStatsMap['pancake-flip'] = {
  golden: 0,
  flipNow: 0,
  raw: 0,
  burnt: 0,
  stacked: 0,
  bestStreak: 0,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

/** Lets every pending promise chain (store calls, refreshes) settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(
  options: { store?: ProgressStore; storage?: ReturnType<typeof memoryStorage> | null } = {},
) {
  const events = createEmitter<GameEventMap>();
  const store =
    options.store ?? createInMemoryProgressStore({ emitter: events, completedLook: DEFAULT_LOOK });
  const toasts: GameEventMap['ui:toast'][] = [];
  events.on('ui:toast', (toast) => toasts.push(toast));
  const storage = options.storage === undefined ? memoryStorage() : options.storage;
  const controller = createQuestController({
    store,
    quests: IN_BUILD,
    events,
    storage,
    random: () => 0,
  });
  const completions: Array<{ questId: string; tokensAwarded: number }> = [];
  controller.onQuestComplete((quest, tokensAwarded) =>
    completions.push({ questId: quest.id, tokensAwarded }),
  );
  function main() {
    return controller.view()?.statuses.find((s) => s.quest.id === 'main');
  }
  function enterRoom(roomId: GameEventMap['room:enter']['roomId']) {
    events.emit('room:enter', { roomId, entryTile: { col: 0, row: 0 } });
  }
  return { events, store, toasts, storage, controller, completions, main, enterRoom };
}

describe('createQuestController', () => {
  it('loads progress from saved data on start and toasts nothing for steps already done', async () => {
    const { store, controller, toasts, main } = setup();
    await store.purchase('beanbag');

    await controller.start();

    expect(main()?.progress).toBe(2);
    expect(controller.view()?.trackedId).toBe('main');
    expect(toasts).toEqual([]);
  });

  it('marks the first Dev Pit visit and toasts the step for 3 seconds', async () => {
    const { store, controller, toasts, main, enterRoom } = setup();
    await store.purchase('beanbag');
    await controller.start();

    enterRoom('dev-pit');
    await settle();

    expect((await store.questProgress()).devPitVisited).toBe(true);
    expect(main()?.progress).toBe(3);
    expect(toasts).toEqual([{ message: 'Quest: Visit the Dev Pit ✓ (3 / 5)', durationMs: 3000 }]);
  });

  it('ignores Rooms other than the Dev Pit, and does nothing before start', async () => {
    const { store, controller, enterRoom } = setup();

    enterRoom('dev-pit');
    await settle();
    expect((await store.questProgress()).devPitVisited).toBe(false);

    await controller.start();
    enterRoom('the-melt');
    await settle();
    expect((await store.questProgress()).devPitVisited).toBe(false);
  });

  it('claims the main Quest once when its last step lands, reports the reward, and tracks the next active Quest', async () => {
    const { store, controller, completions, events, enterRoom } = setup();
    const completeQuest = vi.spyOn(store, 'completeQuest');
    const balances: number[] = [];
    events.on('tokens:changed', ({ balance }) => balances.push(balance));
    await controller.start();
    enterRoom('dev-pit');
    await store.recordRound('bug-squash', 0, ZERO_BUG_SQUASH);
    await store.recordRound('pancake-flip', 0, ZERO_PANCAKE);
    await settle();
    await controller.refresh();
    expect(completions).toEqual([]);

    await store.purchase('beanbag');
    await controller.refresh();
    await settle();
    await controller.refresh();

    expect(completeQuest).toHaveBeenCalledTimes(1);
    expect(completions).toEqual([{ questId: 'main', tokensAwarded: 150 }]);
    expect(balances.at(-1)).toBe(200);
    expect(controller.view()?.trackedId).toBe('bug-squash');
  });

  it('shows no banner when the server says the main Quest was already paid', async () => {
    const events = createEmitter<GameEventMap>();
    const store = createInMemoryProgressStore({ emitter: events, completedLook: DEFAULT_LOOK });
    await store.markDevPitVisited();
    await store.recordRound('bug-squash', 0, ZERO_BUG_SQUASH);
    await store.recordRound('pancake-flip', 0, ZERO_PANCAKE);
    await store.purchase('beanbag');
    await store.completeQuest('main');
    const { controller, completions } = setup({ store });

    await controller.start();
    await settle();

    expect(completions).toEqual([]);
    expect(controller.view()?.trackedId).toBe('bug-squash');
  });

  it('remembers the tracked Quest on this device only', async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.controller.start();

    first.controller.track('pancake-flip');

    expect(first.controller.view()?.trackedId).toBe('pancake-flip');
    expect(storage.data.get(TRACKED_QUEST_STORAGE_KEY)).toBe('pancake-flip');

    const second = setup({ storage });
    await second.controller.start();
    expect(second.controller.view()?.trackedId).toBe('pancake-flip');
  });

  it('keeps working when storage throws', async () => {
    const throwing = {
      data: new Map<string, string>(),
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const { controller } = setup({ storage: throwing });
    await controller.start();

    controller.track('bug-squash');

    expect(controller.view()?.trackedId).toBe('bug-squash');
  });

  it('switches the tracked Minigame Quest to the next active one when its Badge lands', async () => {
    const { store, controller } = setup();
    await controller.start();
    controller.track('bug-squash');

    await store.recordRound('bug-squash', 500, { ...ZERO_BUG_SQUASH, score: 500 });
    await controller.refresh();

    expect(controller.view()?.trackedId).toBe('pancake-flip');
  });

  it('shows an all-done line and tracks nothing once every Quest is done', async () => {
    const { store, controller, enterRoom } = setup();
    await store.recordRound('bug-squash', 500, { ...ZERO_BUG_SQUASH, score: 500 });
    await store.recordRound('pancake-flip', 0, { ...ZERO_PANCAKE, stacked: 20 });
    await store.purchase('beanbag');
    await controller.start();

    enterRoom('dev-pit');
    await settle();
    await controller.refresh();

    expect(controller.view()?.trackedId).toBeNull();
    expect(controller.view()?.allDoneLine).toBe('Overachiever. Noted.');
  });

  it('notifies listeners on every change and stops on stop()', async () => {
    const { controller, enterRoom, store } = setup();
    const views: unknown[] = [];
    controller.onChange((view) => views.push(view));
    await controller.start();
    expect(views.length).toBeGreaterThan(0);

    controller.stop();
    expect(controller.view()).toBeNull();
    enterRoom('dev-pit');
    await settle();
    expect((await store.questProgress()).devPitVisited).toBe(false);
  });
});
