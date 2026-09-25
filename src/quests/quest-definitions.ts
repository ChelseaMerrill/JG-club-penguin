import type { MinigameId, RoomId } from '../contracts';
import { getRoomDefinition } from '../game/rooms/registry';
import type { MinigameRegistry } from '../minigames/minigame';
import { MINIGAME_RULES } from '../persistence/minigame-rules';

/**
 * Quest definitions as data (#46). The build has one main Quest (five steps,
 * counted in any order, paid once by the server's `complete_quest`) plus one
 * Quest per shipped Minigame (its Badge goal; the existing Badge bonus is its
 * reward, so it has no RPC of its own). Every Quest is active from the start.
 */

/** The main Quest's id: the only one `ProgressStore.completeQuest` accepts. */
export const MAIN_QUEST_ID = 'main';

export type QuestId = typeof MAIN_QUEST_ID | MinigameId;

/** One main-Quest step, checked against saved progress by `quest-engine.ts`. */
export type MainQuestStepId =
  | 'create-penguin'
  | 'visit-dev-pit'
  | 'finish-bug-squash'
  | 'finish-pancake-flip'
  | 'buy-igloo-gear';

export interface QuestStepDefinition {
  id: MainQuestStepId;
  /** The ticket's step copy, used in the step toast ("Quest: <label> ✓ (x / 5)"). */
  label: string;
  /** The short form the HUD widget shows as the next step. */
  hint: string;
  /** Where the step happens; `null` for anywhere. */
  roomId: RoomId | null;
}

export interface StepsQuestDefinition {
  kind: 'steps';
  id: typeof MAIN_QUEST_ID;
  title: string;
  /** The panel's small line under the title. */
  location: string;
  steps: readonly QuestStepDefinition[];
  /** Paid once by `complete_quest`; shown on the panel row and the banner. */
  rewardTokens: number;
}

export interface MinigameQuestDefinition {
  kind: 'minigame';
  id: MinigameId;
  minigameId: MinigameId;
  title: string;
  location: string;
  /** The Minigame's Badge threshold, compared against its personal best. */
  goal: number;
  /** The HUD widget's next-step text. */
  hint: string;
  roomId: RoomId;
}

export type QuestDefinition = StepsQuestDefinition | MinigameQuestDefinition;

/** The Room's own display title (e.g. `the-melt` shows as THE KITCHEN). */
export function roomTitle(roomId: RoomId | null): string {
  return roomId === null ? 'ANY ROOM' : getRoomDefinition(roomId).title;
}

function minigameQuest(
  minigameId: MinigameId,
  title: string,
  roomId: RoomId,
  npcLine: string | null,
  hint: string,
): MinigameQuestDefinition {
  const room = roomTitle(roomId);
  return {
    kind: 'minigame',
    id: minigameId,
    minigameId,
    title,
    location: npcLine ? `${room} · ${npcLine}` : room,
    goal: MINIGAME_RULES[minigameId].badgeThreshold,
    hint,
    roomId,
  };
}

/** Every Quest this code knows about, in panel order. `questsInBuild` narrows it to the build. */
export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    kind: 'steps',
    id: MAIN_QUEST_ID,
    title: 'Ship something before the ice melts',
    location: 'MAIN · ANY ROOM',
    rewardTokens: 150,
    steps: [
      {
        id: 'create-penguin',
        label: 'Create your Penguin',
        hint: 'Create your Penguin',
        roomId: null,
      },
      {
        id: 'visit-dev-pit',
        label: 'Visit the Dev Pit',
        hint: 'Visit the Dev Pit',
        roomId: 'dev-pit',
      },
      {
        id: 'finish-bug-squash',
        label: 'Finish a full round of Bug Squash',
        hint: 'Finish Bug Squash',
        roomId: 'dev-pit',
      },
      {
        id: 'finish-pancake-flip',
        label: 'Finish a full round of Pancake Flip',
        hint: 'Finish Pancake Flip',
        roomId: 'the-melt',
      },
      {
        id: 'buy-igloo-gear',
        label: 'Buy something at the Igloo Gear stall',
        hint: 'Buy at the Igloo Gear stall',
        roomId: 'roof-deck',
      },
    ],
  },
  minigameQuest('bug-squash', 'Bug Squash', 'dev-pit', 'TALK TO IAN', 'Score 500 in one round'),
  minigameQuest(
    'pancake-flip',
    'Pancake Flip',
    'the-melt',
    'TALK TO CHELSEA',
    'Stack 20 in one round',
  ),
  minigameQuest(
    'snow-cone-stand',
    'Snow Cone Stand',
    'roof-deck',
    'TALK TO JOSH',
    'Earn 200 tokens in one round',
  ),
  minigameQuest('coffee-rush', 'Coffee Rush', 'the-melt', null, 'Serve 15 cups in one round'),
];

/**
 * The main Quest plus the Quests whose Minigame is registered in `registry`
 * (`createDefaultMinigameRegistry()`), so a Minigame's Quest appears exactly
 * when its game ships.
 */
export function questsInBuild(
  definitions: readonly QuestDefinition[],
  registry: MinigameRegistry,
): QuestDefinition[] {
  return definitions.filter(
    (quest) => quest.kind === 'steps' || registry[quest.minigameId] !== undefined,
  );
}
