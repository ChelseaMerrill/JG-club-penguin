/**
 * The Snowmageddon Quest's server rules (#154,
 * `20261012000000_quest_snowmageddon.sql` S1-S6), as pure functions for the
 * in-memory fake (`createInMemoryProgressStore`) to mirror the migration.
 *
 * The Eastern calendar day is `stair-climb-rules.ts`'s own `stairDay` --
 * identical rule (America/New_York, daylight saving from the platform's time
 * zone data), reused rather than duplicating the `Intl.DateTimeFormat`
 * construction a second time.
 */
import { stairDay } from './stair-climb-rules';

/** The Quest's id (`public.quests.id`). */
export const SNOWMAGEDDON_QUEST_ID = 'snowmageddon';

/** The Quest's reward (`public.quests.reward_tokens`). */
export const SNOWMAGEDDON_REWARD = 75;

/** Distinct Players to hit in one Eastern day to complete the Quest. */
export const SNOWMAGEDDON_TARGET = 5;

/** The Badge this Quest awards, through a side channel (not `completeQuest`'s own `badgesEarned`; S6/D3). */
export const SNOWMAGEDDON_BADGE_ID = 'snowmageddon';

/** The America/New_York calendar day `date` falls on, as `YYYY-MM-DD` (mirrors the migration's `snowball_day`). */
export const snowballDay = stairDay;

/**
 * `quest_steps__snowmageddon` (S5): `hit-1` .. `hit-5`, each true once
 * `hitsToday` (today's distinct-target count) reaches that many. Once
 * `completed` (a `player_quest_completions` row exists), every step reads
 * true regardless of `hitsToday`, so progress never "un-completes" after
 * midnight Eastern.
 */
export function snowmageddonQuestSteps(
  hitsToday: number,
  completed: boolean,
): Record<string, boolean> {
  if (completed) {
    return { 'hit-1': true, 'hit-2': true, 'hit-3': true, 'hit-4': true, 'hit-5': true };
  }
  return {
    'hit-1': hitsToday >= 1,
    'hit-2': hitsToday >= 2,
    'hit-3': hitsToday >= 3,
    'hit-4': hitsToday >= 4,
    'hit-5': hitsToday >= 5,
  };
}
