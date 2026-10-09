import type { BadgeId, MinigameId } from '../contracts/game-events';
import { IGLOO_GEAR_CATALOG, JG_AWARD_ITEM_IDS } from './minigame-rules';
import { MAIN_QUEST_REWARD, type IglooSlot } from './progress-store';
import {
  coffeeQuestSteps,
  NICOLE_COFFEE_QUEST_ID,
  NICOLE_COFFEE_REWARD,
  type CoffeeRunRecord,
} from './coffee-run-rules';
import {
  pitchQuestSteps,
  PITCH_HACK_QUEST_ID,
  PITCH_HACK_REWARD,
  type PitchRunRecord,
} from './pitch-run-rules';

/**
 * The in-memory fake's mirror of `public.quests` plus the
 * `public.quest_steps__<id>` functions (20261006000000_quest_registry.sql):
 * every steps Quest `completeQuest` pays, with its reward and its steps.
 * `createInMemoryProgressStore` reads this registry on every call, so a Quest
 * registered here is paid and reported by every fake store without any change
 * to `completeQuest` or `questProgress`.
 */

/** The fake Player's saved state a steps Quest's steps are worked out from. Read-only. */
export interface InMemoryQuestState {
  profileCreatedAt: string | null;
  devPitVisited: boolean;
  /** Minigames with at least one recorded round (`minigame_rounds`). */
  roundsFinished: readonly MinigameId[];
  /** Owned item ids (`player_items`). */
  ownedItems: readonly string[];
  slots: Readonly<Record<IglooSlot, string | null>>;
  badges: readonly BadgeId[];
  bests: Readonly<Partial<Record<MinigameId, number>>>;
  matchWins: Readonly<Partial<Record<MinigameId, number>>>;
  /** #143: the Igloo Badge Quest's "talk to Casey" flag (`player_quest_state.casey_talked_at`). */
  caseyTalked: boolean;
  /** #141: the fake's `player_coffee_runs` row, `null` before talking to Nicole. */
  coffeeRun: Readonly<CoffeeRunRecord> | null;
  /** #142: the fake's `player_pitch_runs` row, `null` before talking to Linda. */
  pitchRun: Readonly<PitchRunRecord> | null;
  /** #140: the "pair with a JGer" Quest's four client-asserted/checked flags
   *  (`player_quest_state.paul_talked_at`/`ci_board_checked_at`/`paired_at`/
   *  `paul_reported_at`). */
  paulTalked: boolean;
  ciBoardChecked: boolean;
  paired: boolean;
  paulReported: boolean;
  /** #140: whether any recorded `bug-squash` round's `flakyHits` stat
   *  reached 3 (`squash-flakes`). Sticky once true, mirroring the server's
   *  `exists (...)` check over every recorded round. */
  bugSquashFlakyHitsMet: boolean;
  /** The fake's clock (the server's `now()`), for time-limited steps. */
  nowMs: number;
}

/** One registered steps Quest: a `public.quests` row plus its steps function. */
export interface InMemoryStepsQuest {
  /** Paid once by `completeQuest` (`public.quests.reward_tokens`). */
  rewardTokens: number;
  /** Step id -> met, in the client's step ids (`QuestStepDefinition.id`). */
  steps(state: InMemoryQuestState): Record<string, boolean>;
}

/** Every steps Quest the fake pays, by Quest id. Seeded with the main Quest. */
export const IN_MEMORY_STEPS_QUESTS = new Map<string, InMemoryStepsQuest>();

/**
 * Registers a steps Quest with the fake (the mirror of a later migration's
 * `public.quests` row and `quest_steps__<id>` function). Returns a function
 * that removes it again, for tests.
 */
export function registerInMemoryStepsQuest(id: string, quest: InMemoryStepsQuest): () => void {
  IN_MEMORY_STEPS_QUESTS.set(id, quest);
  return () => {
    if (IN_MEMORY_STEPS_QUESTS.get(id) === quest) IN_MEMORY_STEPS_QUESTS.delete(id);
  };
}

// The main Quest (#46): `public.quest_steps__main`'s five checks.
registerInMemoryStepsQuest('main', {
  rewardTokens: MAIN_QUEST_REWARD,
  steps: (state) => ({
    'create-penguin': state.profileCreatedAt !== null,
    'visit-dev-pit': state.devPitVisited,
    'finish-bug-squash': state.roundsFinished.includes('bug-squash'),
    'finish-pancake-flip': state.roundsFinished.includes('pancake-flip'),
    'buy-igloo-gear': state.ownedItems.some(
      (itemId) => IGLOO_GEAR_CATALOG.find((item) => item.id === itemId)?.stall === 'igloo',
    ),
  }),
});

// The Igloo Badge Quest (#143): `public.quest_steps__igloo_badge`'s three checks.
registerInMemoryStepsQuest('igloo-badge', {
  rewardTokens: 75,
  steps: (state) => ({
    'talk-to-casey': state.caseyTalked,
    'buy-jg-award': state.ownedItems.some((itemId) =>
      (JG_AWARD_ITEM_IDS as readonly string[]).includes(itemId),
    ),
    'hang-jg-award': Object.values(state.slots).some(
      (itemId) => itemId !== null && (JG_AWARD_ITEM_IDS as readonly string[]).includes(itemId),
    ),
  }),
});

// #141 "Bring Nicole a coffee before kickoff": `public.quest_steps__nicole_coffee`
// (20261006020000_quest_nicole_coffee.sql C4), timed by the fake's clock.
registerInMemoryStepsQuest(NICOLE_COFFEE_QUEST_ID, {
  rewardTokens: NICOLE_COFFEE_REWARD,
  steps: (state) => coffeeQuestSteps(state.coffeeRun, state.nowMs),
});

// #142 "Pitch your hack in under 60 seconds": `public.quest_steps__pitch_hack`
// (20261009010000_quest_pitch_hack.sql P4), timed by the fake's clock.
registerInMemoryStepsQuest(PITCH_HACK_QUEST_ID, {
  rewardTokens: PITCH_HACK_REWARD,
  steps: (state) => pitchQuestSteps(state.pitchRun),
});

// #140 "Pair with a JGer and fix the flaky test":
// `public.quest_steps__pair_flaky_test` (20261009000000_quest_pair_flaky_test.sql P3).
registerInMemoryStepsQuest('pair-flaky-test', {
  rewardTokens: 150,
  steps: (state) => ({
    'talk-to-paul': state.paulTalked,
    'check-ci-board': state.ciBoardChecked,
    'pair-with-jger': state.paired,
    'squash-flakes': state.bugSquashFlakyHitsMet,
    'report-to-paul': state.paulReported,
  }),
});
