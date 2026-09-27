import type { QuestStatus } from '../quests/quest-engine';
import type { NpcQuestGiver } from './npcs';

/** The button label, verbatim from #144. The dialog's CSS uppercases it on screen. */
export const QUEST_GIVER_BUTTON_LABEL = 'Got any work for me?';

/** What a quest giver says once their Quest is done (#144). */
export const QUEST_GIVER_DONE_LINE = 'Thanks again!';

/** Where "Got any work for me?" leads (#144 D6). */
export type QuestGiverResponse =
  | { kind: 'nothing'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'start'; questId: string }
  | { kind: 'progress'; text: string };

/**
 * Whether the Quest hasn't started yet: its `startStepId` step isn't done,
 * or, without one, nothing has progressed.
 */
function notStarted(giver: NpcQuestGiver, status: QuestStatus): boolean {
  if (giver.startStepId !== undefined) {
    const start = status.steps.find((s) => s.step.id === giver.startStepId);
    return start === undefined ? status.progress === 0 : !start.done;
  }
  return status.progress === 0;
}

/**
 * Routes "Got any work for me?" (#144 D6), checked in this order:
 * - no Quest status (no `questId`, a Quest not in this build, or progress not
 *   loaded yet): the "nothing right now" line;
 * - done: "Thanks again!";
 * - not started, with a registered starter: start it;
 * - otherwise: progress in the Quests panel's "title · x / y" format.
 *
 * Returns `null` when there's no Quest status and no "nothing right now" line,
 * so the dialog hides the button rather than showing a placeholder (D7).
 */
export function resolveQuestGiverResponse(
  giver: NpcQuestGiver,
  status: QuestStatus | undefined,
  canStart: (questId: string) => boolean,
): QuestGiverResponse | null {
  if (status === undefined) {
    return giver.nothingRightNowLine === undefined
      ? null
      : { kind: 'nothing', text: giver.nothingRightNowLine };
  }
  if (status.done) return { kind: 'done', text: QUEST_GIVER_DONE_LINE };
  const questId = status.quest.id;
  if (notStarted(giver, status) && canStart(questId)) return { kind: 'start', questId };
  return {
    kind: 'progress',
    text: `${status.quest.title} · ${status.progress} / ${status.target}`,
  };
}

/**
 * Quest starters, keyed by Quest id (#144 D9). It starts empty: each Quest's
 * own issue registers how its giver starts it (for example #121's Beystadium
 * launching its Minigame, or #140's opening dialogue).
 */
const starters = new Map<string, () => void>();

export function registerQuestStarter(questId: string, start: () => void): void {
  starters.set(questId, start);
}

export function hasQuestStarter(questId: string): boolean {
  return starters.has(questId);
}

/** Runs `questId`'s registered starter; does nothing when none is registered. */
export function startQuest(questId: string): void {
  starters.get(questId)?.();
}

/** Test-only: forgets every registered starter. */
export function clearQuestStarters(): void {
  starters.clear();
}
