import type { BadgeId, MinigameId } from '../contracts/game-events';
import { IGLOO_GEAR_CATALOG } from './minigame-rules';
import { MAIN_QUEST_REWARD, type IglooSlot } from './progress-store';

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
