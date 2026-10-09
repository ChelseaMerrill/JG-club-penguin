import type { MinigameId, RoomId } from '../contracts';
import { getRoomDefinition } from '../game/rooms/registry';
import type { MinigameRegistry } from '../minigames/minigame';
import { MINIGAME_RULES, type MinigameRule } from '../persistence/minigame-rules';

/**
 * Quest definitions as data (#46). The build has "steps" Quests -- the main
 * Quest (five steps) and any later one (#140, #141, #143) -- each with steps
 * counted in any order and paid once by the server's `complete_quest`, plus
 * one Quest per shipped Minigame (its Badge goal; the existing Badge bonus is
 * its reward, so it has no RPC of its own). Every Quest is active from the
 * start.
 *
 * Adding a steps Quest: append a `kind: 'steps'` entry to `QUEST_DEFINITIONS`
 * whose `id` and step ids match the server's `public.quests` row and
 * `public.quest_steps__<id>` function (20261006000000_quest_registry.sql),
 * and register the same Quest with the in-memory fake
 * (`registerInMemoryStepsQuest`, src/persistence/in-memory-steps-quests.ts).
 * The engine reads its steps from `QuestProgress.questSteps` and the
 * controller claims it through `completeQuest(id)`; neither needs a change.
 */

/** The main Quest's id. */
export const MAIN_QUEST_ID = 'main';

/** A steps Quest's id (the server's `public.quests.id`) or a Minigame Quest's id. */
export type QuestId = string;

/** The main Quest's step ids, checked against saved progress by `quest-engine.ts`. */
export const MAIN_QUEST_STEP_IDS = [
  'create-penguin',
  'visit-dev-pit',
  'finish-bug-squash',
  'finish-pancake-flip',
  'buy-igloo-gear',
] as const;

/** One main-Quest step. */
export type MainQuestStepId = (typeof MAIN_QUEST_STEP_IDS)[number];

export interface QuestStepDefinition {
  /** The step's id within its Quest: the key in the server's
   *  `QuestProgress.questSteps[questId]` (a `MainQuestStepId` for 'main'). */
  id: string;
  /** The ticket's step copy, used in the step toast ("Quest: <label> ✓ (x / 5)"). */
  label: string;
  /** The short form the HUD widget shows as the next step. */
  hint: string;
  /** Where the step happens; `null` for anywhere. */
  roomId: RoomId | null;
}

export interface StepsQuestDefinition {
  kind: 'steps';
  /** The server's `public.quests.id` (lowercase letters, digits and '-'). */
  id: string;
  title: string;
  /** The panel's small line under the title. */
  location: string;
  steps: readonly QuestStepDefinition[];
  /** Paid once by `complete_quest` (the server's `public.quests.reward_tokens`);
   *  shown on the panel row and the banner. */
  rewardTokens: number;
}

export interface MinigameQuestDefinition {
  kind: 'minigame';
  id: MinigameId;
  minigameId: MinigameId;
  title: string;
  location: string;
  /** What counts as progress, following the Minigame's Badge rule: its
   *  personal best (`'best'`) or its recorded match wins (`'match-wins'`,
   *  `QuestProgress.matchWins`; Beystadium). */
  goalKind: 'best' | 'match-wins';
  /** The Minigame's Badge threshold (a best) or match-win count. */
  goal: number;
  /** The HUD widget's next-step text. */
  hint: string;
  /** Where the Minigame is played; `null` while its Room isn't in the build. */
  roomId: RoomId | null;
  /** The HUD widget's next-step location. */
  hintLocation: string;
}

export type QuestDefinition = StepsQuestDefinition | MinigameQuestDefinition;

/** The Room's own display title (e.g. `the-melt` shows as THE KITCHEN). */
export function roomTitle(roomId: RoomId | null): string {
  return roomId === null ? 'ANY ROOM' : getRoomDefinition(roomId).title;
}

/** The goal a Minigame Quest tracks, straight from the Minigame's Badge rule. */
function badgeGoal(minigameId: MinigameId): Pick<MinigameQuestDefinition, 'goalKind' | 'goal'> {
  const rule: MinigameRule = MINIGAME_RULES[minigameId];
  return rule.badgeKind === 'match-wins'
    ? { goalKind: 'match-wins', goal: rule.badgeMatchWins }
    : { goalKind: 'best', goal: rule.badgeThreshold };
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
    ...badgeGoal(minigameId),
    hint,
    roomId,
    hintLocation: room,
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
  {
    kind: 'steps',
    id: 'igloo-badge',
    title: 'Decorate your igloo with a JG badge',
    location: 'THE MARKET · IGLOO GEAR',
    rewardTokens: 75,
    steps: [
      {
        id: 'talk-to-casey',
        label: 'Talk to Casey at the Igloo Gear stall',
        hint: 'Talk to Casey',
        roomId: 'roof-deck',
      },
      {
        id: 'buy-jg-award',
        label: 'Buy a JG award from Casey',
        hint: 'Buy a JG award',
        roomId: 'roof-deck',
      },
      {
        id: 'hang-jg-award',
        label: 'Hang the award on an igloo wall',
        hint: 'Hang the award in your Igloo',
        roomId: 'igloo',
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
  // The design's "QUEST · LET IT RIP · WIN 3 MATCHES" as its title; located
  // from Team Room 4's own definition, where Michael launches it (#121).
  minigameQuest(
    'beystadium',
    'LET IT RIP · WIN 3 MATCHES',
    'team-room-4',
    'TALK TO MICHAEL',
    'Win 3 Beystadium matches',
  ),
  // #141: Nicole's coffee run, steps in the ticket's order. The server's
  // `quest_steps__nicole_coffee` (20261006020000_quest_nicole_coffee.sql C4)
  // reports them; a cup that goes cold resets steps 3-5 until Tom hands over
  // another. The 1:00 countdown is `src/quests/coffee-run.ts`'s.
  {
    kind: 'steps',
    id: 'nicole-coffee',
    title: 'Bring Nicole a coffee before kickoff',
    location: 'THE KITCHEN → THE ICEBOX',
    rewardTokens: 75,
    steps: [
      {
        id: 'talk-to-nicole',
        label: 'Talk to Nicole in The Icebox',
        hint: 'Talk to Nicole',
        roomId: 'the-icebox',
      },
      {
        id: 'visit-kitchen',
        label: 'Go to The Kitchen',
        hint: 'Go to The Kitchen',
        roomId: 'the-melt',
      },
      {
        id: 'ask-tom',
        label: "Ask Tom for Nicole's coffee",
        hint: "Ask Tom for Nicole's coffee",
        roomId: 'the-melt',
      },
      {
        id: 'carry-coffee',
        label: 'Carry it back before it goes cold',
        hint: 'Carry it back before it goes cold',
        roomId: 'the-icebox',
      },
      {
        id: 'deliver-coffee',
        label: 'Hand it to Nicole in The Icebox',
        hint: 'Hand it to Nicole',
        roomId: 'the-icebox',
      },
    ],
  },
  // #142: Linda Martin's pitch, steps in the ticket's order. Linda's
  // reaction to a sub-20 s pitch is shown as part of passing step 2, not a
  // separate server step (20261009010000_quest_pitch_hack.sql P4). The
  // overlay's own 60 s countdown is `src/quests/pitch-overlay.ts`'s.
  {
    kind: 'steps',
    id: 'pitch-hack',
    title: 'Pitch your hack in under 60 seconds',
    location: 'THE ICEBOX · TALK TO LINDA',
    rewardTokens: 75,
    steps: [
      {
        id: 'talk-to-linda',
        label: 'Talk to Linda in The Icebox',
        hint: 'Talk to Linda',
        roomId: 'the-icebox',
      },
      {
        id: 'pitch-under-60',
        label: 'Pitch Linda in under 60 seconds',
        hint: 'Pitch Linda',
        roomId: 'the-icebox',
      },
    ],
  },
];

/**
 * Every steps Quest plus the Quests whose Minigame is registered in `registry`
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
