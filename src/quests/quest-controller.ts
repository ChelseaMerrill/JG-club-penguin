import type { TypedEmitter } from '../contracts/emitter';
import type { GameEventMap } from '../contracts/game-events';
import type { ProgressStore } from '../persistence/progress-store';
import { MAIN_QUEST_ID, type QuestDefinition } from './quest-definitions';
import {
  evaluateQuests,
  nextTrackedQuestId,
  pickAllDoneLine,
  questTransitions,
  resolveTrackedQuestId,
  stepToastMessage,
  type QuestStatus,
} from './quest-engine';

/** localStorage key for the tracked Quest: remembered on this device only. */
export const TRACKED_QUEST_STORAGE_KEY = 'jg-club-penguin.quests.tracked';

/** How long a Quest step toast stays up (#46). */
export const QUEST_STEP_TOAST_MS = 3000;

export interface QuestView {
  statuses: QuestStatus[];
  /** `null` once every Quest is done. */
  trackedId: string | null;
  /** The widget's line once every Quest is done; picked once per controller. */
  allDoneLine: string;
}

export interface QuestControllerDeps {
  store: Pick<ProgressStore, 'loadAll' | 'questProgress' | 'markDevPitVisited' | 'completeQuest'>;
  /** The Quests in this build (`questsInBuild`). */
  quests: readonly QuestDefinition[];
  events: TypedEmitter<GameEventMap>;
  /** `window.localStorage`, or `null` when unavailable. Every call is try/catch-wrapped. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  random?: () => number;
}

export interface QuestController {
  /** Starts a Session's Quest tracking: loads saved progress, without toasting what's already done. */
  start(): Promise<void>;
  /** Ends it: forgets progress and ignores `room:enter` until the next `start()`. */
  stop(): void;
  /**
   * Re-reads saved progress (after a round, a purchase, a Room visit). Toasts
   * each step newly done since the last read, claims the main Quest once its
   * steps are met, and moves the tracked Quest on when it finishes. Never
   * rejects.
   */
  refresh(): Promise<void>;
  /** `null` before the first load of a Session. */
  view(): QuestView | null;
  /** Tracks `questId` (remembered on this device). */
  track(questId: string): void;
  onChange(listener: (view: QuestView) => void): () => void;
  /** Fires when the server pays a Quest this Session (not when it says it was already paid). */
  onQuestComplete(listener: (quest: QuestDefinition, tokensAwarded: number) => void): () => void;
}

/**
 * The quest engine's runtime (#46): reads saved progress through the store,
 * evaluates it with `quest-engine.ts`, and turns transitions observed during
 * this Session into step toasts (`ui:toast`, 3 s), the main Quest's
 * `completeQuest('main')` claim and the tracked-Quest switch.
 */
export function createQuestController(deps: QuestControllerDeps): QuestController {
  const { store, quests, events, storage } = deps;
  const random = deps.random ?? Math.random;

  let active = false;
  let generation = 0;
  let statuses: QuestStatus[] | null = null;
  let trackedId: string | null = null;
  let devPitVisited = false;
  let visitRequested = false;
  let claimInFlight = false;
  let claimed = false;
  let allDoneLine: string | null = null;
  let queue: Promise<void> = Promise.resolve();
  const changeListeners = new Set<(view: QuestView) => void>();
  const completeListeners = new Set<(quest: QuestDefinition, tokensAwarded: number) => void>();

  function readStoredTracked(): string | null {
    try {
      return storage?.getItem(TRACKED_QUEST_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function writeStoredTracked(questId: string | null): void {
    if (questId === null) return;
    try {
      storage?.setItem(TRACKED_QUEST_STORAGE_KEY, questId);
    } catch {
      // Private mode or a full quota: the choice just isn't remembered.
    }
  }

  function currentView(): QuestView | null {
    if (!active || statuses === null) return null;
    if (trackedId === null && allDoneLine === null) allDoneLine = pickAllDoneLine(random);
    return { statuses, trackedId, allDoneLine: allDoneLine ?? '' };
  }

  function notify(): void {
    const view = currentView();
    if (!view) return;
    for (const listener of Array.from(changeListeners)) listener(view);
  }

  async function claimMainQuest(myGeneration: number): Promise<void> {
    claimInFlight = true;
    try {
      const result = await store.completeQuest(MAIN_QUEST_ID);
      if (myGeneration !== generation) return;
      claimed = true;
      const quest = quests.find((q) => q.id === MAIN_QUEST_ID);
      if (!result.alreadyCompleted && quest) {
        for (const listener of Array.from(completeListeners)) {
          listener(quest, result.tokensAwarded);
        }
      }
    } catch {
      // The store already toasts a failed save; the next refresh retries.
    } finally {
      claimInFlight = false;
    }
  }

  async function load(): Promise<void> {
    if (!active) return;
    const myGeneration = generation;
    let next: QuestStatus[];
    let completedQuests: readonly string[];
    try {
      const [snapshot, progress] = await Promise.all([store.loadAll(), store.questProgress()]);
      if (myGeneration !== generation) return;
      devPitVisited = progress.devPitVisited;
      completedQuests = progress.completedQuests;
      next = evaluateQuests(quests, {
        profileCreatedAt: snapshot.profileCreatedAt,
        bests: snapshot.bests,
        badges: snapshot.badges,
        ownedItems: snapshot.ownedItems,
        devPitVisited: progress.devPitVisited,
        roundsFinished: progress.roundsFinished,
        completedQuests: progress.completedQuests,
      });
    } catch {
      return;
    }

    const previous = statuses;
    if (previous === null) {
      trackedId = resolveTrackedQuestId(next, readStoredTracked() ?? MAIN_QUEST_ID);
    } else {
      for (const transition of questTransitions(previous, next)) {
        if (transition.kind === 'step') {
          events.emit('ui:toast', {
            message: stepToastMessage(transition),
            durationMs: QUEST_STEP_TOAST_MS,
          });
        } else if (transition.questId === trackedId) {
          trackedId = nextTrackedQuestId(next, transition.questId);
          writeStoredTracked(trackedId);
        }
      }
      trackedId = resolveTrackedQuestId(next, trackedId);
    }
    statuses = next;
    notify();

    const main = next.find((s) => s.quest.id === MAIN_QUEST_ID);
    const stepsMet = main !== undefined && main.progress === main.target;
    if (stepsMet && !completedQuests.includes(MAIN_QUEST_ID) && !claimed && !claimInFlight) {
      await claimMainQuest(myGeneration);
    }
  }

  function refresh(): Promise<void> {
    queue = queue.then(load, load);
    return queue;
  }

  events.on('room:enter', ({ roomId }) => {
    if (!active || roomId !== 'dev-pit' || devPitVisited || visitRequested) return;
    visitRequested = true;
    const myGeneration = generation;
    store
      .markDevPitVisited()
      .then(() => {
        if (myGeneration === generation) void refresh();
      })
      .catch(() => {
        if (myGeneration === generation) visitRequested = false;
      });
  });

  return {
    start() {
      generation += 1;
      active = true;
      statuses = null;
      trackedId = null;
      devPitVisited = false;
      visitRequested = false;
      claimed = false;
      return refresh();
    },
    stop() {
      generation += 1;
      active = false;
      statuses = null;
      trackedId = null;
    },
    refresh,
    view: currentView,
    track(questId) {
      if (!statuses?.some((s) => s.quest.id === questId && !s.done)) return;
      trackedId = questId;
      writeStoredTracked(questId);
      notify();
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    onQuestComplete(listener) {
      completeListeners.add(listener);
      return () => {
        completeListeners.delete(listener);
      };
    },
  };
}
