import type { BadgeId, MinigameId } from '../contracts';
import { MINIGAME_RULES } from '../persistence/minigame-rules';
import {
  roomTitle,
  type MainQuestStepId,
  type QuestDefinition,
  type QuestStepDefinition,
} from './quest-definitions';

/**
 * Everything Quest progress is worked out from: the saved progress snapshot
 * (`ProgressStore.loadAll`) plus `ProgressStore.questProgress`. Earlier play
 * counts because every field here is saved data, not a session counter.
 */
export interface QuestInputs {
  profileCreatedAt: string | null;
  bests: Partial<Record<MinigameId, number>>;
  badges: readonly BadgeId[];
  ownedItems: readonly string[];
  devPitVisited: boolean;
  /** Minigames with at least one finished (never quit) round. */
  roundsFinished: readonly MinigameId[];
  /** Quests the server has already paid (`complete_quest`). */
  completedQuests: readonly string[];
  /** Recorded match wins per Minigame (`QuestProgress.matchWins`), for a
   *  `'match-wins'` Minigame Quest; missing counts as none. */
  matchWins?: Partial<Record<MinigameId, number>>;
}

export interface QuestStepStatus {
  step: QuestStepDefinition;
  done: boolean;
}

/** The HUD widget's next-step line: "<text> · <location> ↘". */
export interface QuestHint {
  text: string;
  location: string;
}

export interface QuestStatus {
  quest: QuestDefinition;
  /** Steps done (main Quest), or the personal best or match wins (Minigame Quest). */
  progress: number;
  target: number;
  done: boolean;
  /** The main Quest's steps in order; empty for a Minigame Quest. */
  steps: QuestStepStatus[];
  /** `null` once the Quest is done. */
  nextHint: QuestHint | null;
}

function stepDone(id: MainQuestStepId, inputs: QuestInputs): boolean {
  switch (id) {
    case 'create-penguin':
      return inputs.profileCreatedAt !== null;
    case 'visit-dev-pit':
      return inputs.devPitVisited;
    case 'finish-bug-squash':
      return inputs.roundsFinished.includes('bug-squash');
    case 'finish-pancake-flip':
      return inputs.roundsFinished.includes('pancake-flip');
    case 'buy-igloo-gear':
      return inputs.ownedItems.length > 0;
  }
}

function evaluateQuest(quest: QuestDefinition, inputs: QuestInputs): QuestStatus {
  if (quest.kind === 'steps') {
    const steps = quest.steps.map((step) => ({ step, done: stepDone(step.id, inputs) }));
    const progress = steps.filter((s) => s.done).length;
    const done = progress === steps.length || inputs.completedQuests.includes(quest.id);
    const next = steps.find((s) => !s.done);
    return {
      quest,
      progress,
      target: steps.length,
      done,
      steps,
      nextHint:
        done || !next ? null : { text: next.step.hint, location: roomTitle(next.step.roomId) },
    };
  }

  const progress =
    quest.goalKind === 'match-wins'
      ? (inputs.matchWins?.[quest.minigameId] ?? 0)
      : (inputs.bests[quest.minigameId] ?? 0);
  const badgeId = MINIGAME_RULES[quest.minigameId].badgeId;
  const done = progress >= quest.goal || inputs.badges.includes(badgeId);
  return {
    quest,
    progress,
    target: quest.goal,
    done,
    steps: [],
    nextHint: done ? null : { text: quest.hint, location: quest.hintLocation },
  };
}

/** Evaluates every Quest in `definitions` against saved progress. */
export function evaluateQuests(
  definitions: readonly QuestDefinition[],
  inputs: QuestInputs,
): QuestStatus[] {
  return definitions.map((quest) => evaluateQuest(quest, inputs));
}

export type QuestTransition =
  | {
      kind: 'step';
      questId: string;
      step: QuestStepDefinition;
      progress: number;
      target: number;
    }
  | { kind: 'quest-done'; questId: string; quest: QuestDefinition };

/**
 * What changed between two evaluations: each main-Quest step newly done
 * (for the step toast) and each Quest newly done (for the banner and the
 * tracked-Quest switch). Quests missing from `previous` report nothing.
 */
export function questTransitions(
  previous: readonly QuestStatus[],
  next: readonly QuestStatus[],
): QuestTransition[] {
  const transitions: QuestTransition[] = [];
  for (const after of next) {
    const before = previous.find((s) => s.quest.id === after.quest.id);
    if (!before) continue;
    for (const stepStatus of after.steps) {
      const wasDone = before.steps.find((s) => s.step.id === stepStatus.step.id)?.done ?? false;
      if (stepStatus.done && !wasDone) {
        transitions.push({
          kind: 'step',
          questId: after.quest.id,
          step: stepStatus.step,
          progress: after.progress,
          target: after.target,
        });
      }
    }
    if (after.done && !before.done) {
      transitions.push({ kind: 'quest-done', questId: after.quest.id, quest: after.quest });
    }
  }
  return transitions;
}

/** "Quest: Visit the Dev Pit ✓ (3 / 5)"; `''` for anything but a step. */
export function stepToastMessage(transition: QuestTransition): string {
  if (transition.kind !== 'step') return '';
  return `Quest: ${transition.step.label} ✓ (${transition.progress} / ${transition.target})`;
}

/**
 * The active Quest after `fromId` in panel order, wrapping around; the first
 * active Quest when `fromId` isn't listed; `null` when every Quest is done.
 */
export function nextTrackedQuestId(
  statuses: readonly QuestStatus[],
  fromId: string | null,
): string | null {
  const start = statuses.findIndex((s) => s.quest.id === fromId);
  for (let offset = 1; offset <= statuses.length; offset += 1) {
    // `start` is -1 when `fromId` isn't listed, so offset 1 lands on index 0.
    const candidate = statuses[(start + offset) % statuses.length];
    if (candidate && !candidate.done) return candidate.quest.id;
  }
  return null;
}

/**
 * The Quest the HUD widget shows: `preferred` (the remembered choice, the
 * main Quest by default) while it is active, else the next active Quest
 * after it, else `null` when every Quest is done.
 */
export function resolveTrackedQuestId(
  statuses: readonly QuestStatus[],
  preferred: string | null,
): string | null {
  const wanted = preferred ?? statuses[0]?.quest.id ?? null;
  const match = statuses.find((s) => s.quest.id === wanted);
  if (match && !match.done) return match.quest.id;
  return nextTrackedQuestId(statuses, match ? match.quest.id : null);
}

/** The HUD widget's line once every Quest is done (#46, verbatim). */
export const ALL_DONE_LINES: readonly string[] = [
  'Overachiever. Noted.',
  'Work hard, waddle harder.',
  'Shipped it. Go touch snow.',
  'Nothing left to ship. Suspicious.',
  'Excellence is our approach to everything.',
];

/** One of `ALL_DONE_LINES`, chosen by `random` (in [0, 1)). */
export function pickAllDoneLine(random: () => number = Math.random): string {
  const index = Math.min(Math.floor(random() * ALL_DONE_LINES.length), ALL_DONE_LINES.length - 1);
  return ALL_DONE_LINES[Math.max(index, 0)];
}
