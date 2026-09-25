import type { MinigameId } from '../contracts/game-events';
import { UNSAFE_NAME_CHARS_RE } from '../contracts/penguin';
import {
  FLAKY_POINTS,
  MAX_COMBO_MULTIPLIER,
  ROUND_SECONDS,
} from '../minigames/bug-squash/bug-squash-engine';
import { PAN_COUNT, STAGE_FLIP_NOW_AT_SEC } from '../minigames/pancake-flip/pancake-flip-engine';
import { MINIGAME_RULES } from './minigame-rules';

/**
 * #70 red-team R2 (decided 2026-09-24): a client asserts its own `score`/
 * `stats`, and `record_round` never recomputes them from real play, so a
 * forged best could otherwise sit at #1 on the leaderboard forever. Each
 * entry here is "the most a single round could possibly score" for that
 * Minigame's own `best_score` measure (`MINIGAME_RULES[id].rawBest`),
 * derived from the engine's own constants below -- not from real gameplay,
 * which stays far under these numbers. `null` means "exclude nothing": no
 * engine exists yet to derive a ceiling from.
 *
 * Mirrored exactly in `supabase/migrations/20260924020000_leaderboard.sql`'s
 * `leaderboard()` `case`; `sql-leaderboard.test.ts` asserts the two agree by
 * parsing the migration text.
 */
export const LEADERBOARD_SCORE_CEILINGS: Readonly<Record<MinigameId, number | null>> = {
  // Bug Squash's `best_score` is the round's raw `score`
  // (`MINIGAME_RULES['bug-squash'].rawBest`), the sum of every squash's
  // `points = (flaky ? FLAKY_POINTS : CYAN_POINTS) * multiplier`. The
  // engine advances in fixed 100ms steps (`STEP_MS`, private to the engine)
  // over the `ROUND_SECONDS`-long round, and a bug can spawn at most once
  // per step (`bugs.size < maxConcurrentBugs(elapsed)` before each spawn
  // roll) -- so there are at most `(ROUND_SECONDS * 1000) / 100` spawns in
  // the whole round, whatever the spawn/combo mechanics do in between. The
  // single highest-value squash is a flaky bug (`FLAKY_POINTS`) squashed at
  // the maximum combo multiplier (`MAX_COMBO_MULTIPLIER`). Ceiling = ticks *
  // FLAKY_POINTS * MAX_COMBO_MULTIPLIER = 600 * 25 * 4 = 60,000. (The true
  // reachable max is a little lower once the combo ramp-up is accounted
  // for; this bound only needs to sit at or above it, which it does.)
  'bug-squash': ((ROUND_SECONDS * 1000) / 100) * FLAKY_POINTS * MAX_COMBO_MULTIPLIER,
  // Pancake Flip's `best_score` is `stats.stacked`
  // (`MINIGAME_RULES['pancake-flip'].rawBest`), a count of flips landed
  // during the Flip Now/Golden window. A pancake can't be flipped for
  // credit before `STAGE_FLIP_NOW_AT_SEC` seconds on the pan, so one pan can
  // produce at most `floor(durationSeconds / STAGE_FLIP_NOW_AT_SEC)` scoring
  // flips across the whole round if flipped the instant it's eligible and
  // immediately replaced; `PAN_COUNT` pans cooking at once (generously
  // assuming the top cadence cap for the entire round, not just its last
  // third) bounds the total. Ceiling =
  // floor(90 / 2.4) * 4 = 37 * 4 = 148.
  'pancake-flip':
    Math.floor(MINIGAME_RULES['pancake-flip'].durationSeconds / STAGE_FLIP_NOW_AT_SEC) * PAN_COUNT,
  // No engine ships yet for these two (#38/#39 built Bug Squash/Pancake
  // Flip only), so there are no constants to derive a ceiling from.
  // Excluding nothing here is the conservative choice: a wrong guessed
  // number could hide a legitimate future best, whereas "no ceiling yet" is
  // easy to tighten once #46's stretch engines exist.
  'coffee-rush': null,
  'snow-cone-stand': null,
};

/**
 * R1: a Penguin name is blank for leaderboard purposes once every
 * invisible/control/bidi/format character (#75's `UNSAFE_NAME_CHARS_RE`,
 * `src/contracts/penguin.ts` -- the same set the name-gate strips) and
 * every ordinary whitespace character (JS `\s`, which already covers
 * NBSP) is stripped from it. `UNSAFE_NAME_CHARS_RE` is
 * Unicode-property-based (`\p{Default_Ignorable_Code_Point}`, `\p{Cf}`)
 * and has no Postgres equivalent (no `\p{}` support there), so the
 * migration's own char class spells out an aligned, explicit range list
 * instead (see its header comment) rather than importing this. The two
 * are reviewed together, not mechanically generated from one another.
 */
export function isBlankLeaderboardName(name: string): boolean {
  return name.replace(UNSAFE_NAME_CHARS_RE, '').replace(/\s/gu, '').length === 0;
}

/** True when `score` is at or under `minigameId`'s `LEADERBOARD_SCORE_CEILINGS` entry (always true when that entry is `null`, meaning no ceiling). */
export function isUnderLeaderboardCeiling(minigameId: MinigameId, score: number): boolean {
  const ceiling = LEADERBOARD_SCORE_CEILINGS[minigameId];
  return ceiling === null || score <= ceiling;
}
