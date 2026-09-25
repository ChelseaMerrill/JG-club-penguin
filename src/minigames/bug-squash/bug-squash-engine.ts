/**
 * Bug Squash's pure game logic: spawns and expires bugs across a 16-cell
 * grid, scores hits with a combo multiplier, and tracks build lights until
 * three escapes end the round. DOM-free and driven entirely by an injected
 * `rng` and explicit `tick(dtSeconds)` calls, so it's deterministically
 * unit-testable without touching `document`, a real clock, or real
 * randomness. Ported from `design/Minigame Bug Squash.dc.html`'s `tick`/
 * `hit` component logic.
 *
 * "Elapsed" here means unpaused play time only: the DOM layer
 * (`bug-squash.ts`) only calls `tick` while the shell hasn't paused the
 * round, so the spawn-rate/lifetime ramp (keyed off elapsed time) never
 * advances during a pause.
 *
 * Producer: #38. Consumer: `bug-squash.ts` (the `Minigame` implementation).
 */

/** The grid is a 4x4 of 16 cells, indices 0-15. */
export const CELL_COUNT = 16;

/** Keyboard keys for the 16 cells, in cell-index order (the design's own
 *  `KEYS`, left-to-right/top-to-bottom over the 4x4 grid). */
export const CELL_KEYS: readonly string[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  'Q',
  'W',
  'E',
  'R',
  'T',
  'Y',
];

/** The round length the ramp curve below is calibrated to (`MINIGAME_RULES`
 *  keeps the shell's own timer at the same value). */
export const ROUND_SECONDS = 60;

export const MAX_LIGHTS = 3;
export const MAX_COMBO_MULTIPLIER = 4;
export const CYAN_POINTS = 10;
export const FLAKY_POINTS = 25;
export const FLAKY_CHANCE = 0.25;

/** The design's own tick granularity (a 100ms `setInterval`); every spawn
 *  probability and lifetime constant below is calibrated to this step size.
 *  `tick` divides whatever `dtSeconds` it's given into steps of this size,
 *  tracked internally as whole milliseconds so repeated calls never drift
 *  off an exact elapsed-time boundary the way repeated float addition would. */
const STEP_MS = 100;

interface Bug {
  flaky: boolean;
  hp: 1 | 2;
  ttlMs: number;
}

export interface BugSquashCell {
  bug: { flaky: boolean; hp: 1 | 2 } | null;
}

export interface BugSquashState {
  /** Total unpaused play time this engine has processed via `tick`. */
  elapsedSec: number;
  score: number;
  squashed: number;
  /** The current consecutive-squash streak; a miss or an escape resets it. */
  comboCount: number;
  /** `1`-`4`, derived from `comboCount`. */
  comboMultiplier: number;
  /** The best `comboMultiplier` reached this round; reported as the
   *  `bestCombo` stat. */
  bestComboMultiplier: number;
  /** Remaining build lights, `3` down to `0`. */
  lights: number;
  escaped: number;
  /** True once `lights` has reached 0 (three escapes). The DOM layer calls
   *  `context.finish()` when this flips true. */
  ended: boolean;
  cells: readonly BugSquashCell[];
}

export type BugSquashHitResult =
  { kind: 'miss' } | { kind: 'partial' } | { kind: 'squashed'; points: number; multiplier: number };

export interface BugSquashStats {
  score: number;
  squashed: number;
  bestCombo: number;
  escaped: number;
}

export interface BugSquashEngineOptions {
  /** Returns a float in `[0, 1)`, called in the same order the design's own
   *  `Math.random()` calls run (spawn roll, then cell pick, then flaky
   *  roll). Defaults to `Math.random`; tests inject a deterministic
   *  sequence instead. */
  rng?: () => number;
}

export interface BugSquashEngine {
  getState(): BugSquashState;
  /** The `MinigameStatsMap['bug-squash']` shape, straight off the live
   *  state (also what `bug-squash.ts`'s `end()` returns). */
  getStats(): BugSquashStats;
  /** Advances the round by `dtSeconds` of unpaused play time: ages and
   *  expires existing bugs (an expiry is an escape: -1 light, combo reset),
   *  then rolls to maybe spawn a new one. A no-op once `ended`. */
  tick(dtSeconds: number): void;
  /** Squashes (or damages) whatever is in `cellIndex`, or resets the combo
   *  if it's empty. A no-op once `ended`. */
  hit(cellIndex: number): BugSquashHitResult;
  /** Test-only: sets the score directly, bypassing hits (mirrors the old
   *  stub's `debugSetScore`, for `dev-minigame-hook.ts`'s e2e hook). */
  debugSetScore(score: number): void;
}

function deriveMultiplier(comboCount: number): number {
  return Math.min(MAX_COMBO_MULTIPLIER, 1 + Math.floor(comboCount / 4));
}

/** `elapsedSec` clamped to the round length: the ramp curves below never
 *  extrapolate past the round they're calibrated for, even if the DOM layer
 *  somehow ticked past it. */
function clampElapsed(elapsedSec: number): number {
  return Math.min(elapsedSec, ROUND_SECONDS);
}

function spawnProbability(elapsedSec: number): number {
  return 0.1 + (clampElapsed(elapsedSec) / ROUND_SECONDS) * 0.22;
}

function maxConcurrentBugs(elapsedSec: number): number {
  const elapsed = clampElapsed(elapsedSec);
  if (elapsed < 20) return 2;
  if (elapsed < 40) return 3;
  return 4;
}

function spawnTtlMs(elapsedSec: number): number {
  const elapsed = clampElapsed(elapsedSec);
  return Math.max(1100, 2600 - (elapsed / ROUND_SECONDS) * 1200);
}

export function createBugSquashEngine(options: BugSquashEngineOptions = {}): BugSquashEngine {
  const rng = options.rng ?? Math.random;

  let elapsedMs = 0;
  let score = 0;
  let squashed = 0;
  let comboCount = 0;
  let bestComboCount = 0;
  let lights = MAX_LIGHTS;
  let escaped = 0;
  let ended = false;
  const bugs = new Map<number, Bug>();

  function elapsedSec(): number {
    return elapsedMs / 1000;
  }

  function snapshotCells(): BugSquashCell[] {
    const cells: BugSquashCell[] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      const bug = bugs.get(i);
      cells.push({ bug: bug ? { flaky: bug.flaky, hp: bug.hp } : null });
    }
    return cells;
  }

  function getState(): BugSquashState {
    return {
      elapsedSec: elapsedSec(),
      score,
      squashed,
      comboCount,
      comboMultiplier: deriveMultiplier(comboCount),
      bestComboMultiplier: deriveMultiplier(bestComboCount),
      lights,
      escaped,
      ended,
      cells: snapshotCells(),
    };
  }

  function getStats(): BugSquashStats {
    return { score, squashed, bestCombo: deriveMultiplier(bestComboCount), escaped };
  }

  /** One `STEP_MS` of simulation: ages/expires bugs, then maybe spawns one,
   *  exactly mirroring the design's own `tick`'s per-100ms body. */
  function stepOnce(): void {
    if (ended) return;
    elapsedMs += STEP_MS;

    for (const [index, bug] of bugs) {
      const ttlMs = bug.ttlMs - STEP_MS;
      if (ttlMs <= 0) {
        bugs.delete(index);
        escaped += 1;
        lights -= 1;
        comboCount = 0;
      } else {
        bugs.set(index, { ...bug, ttlMs });
      }
    }

    if (lights <= 0) {
      ended = true;
      return;
    }

    const elapsed = elapsedSec();
    const maxBugs = maxConcurrentBugs(elapsed);
    if (bugs.size < maxBugs && rng() < spawnProbability(elapsed)) {
      const free: number[] = [];
      for (let i = 0; i < CELL_COUNT; i++) if (!bugs.has(i)) free.push(i);
      if (free.length > 0) {
        const index = free[Math.floor(rng() * free.length)];
        const flaky = rng() < FLAKY_CHANCE;
        bugs.set(index, { flaky, hp: flaky ? 2 : 1, ttlMs: spawnTtlMs(elapsed) });
      }
    }
  }

  function tick(dtSeconds: number): void {
    if (ended || dtSeconds <= 0) return;
    // Rounds to the nearest whole step rather than subtracting a running
    // remainder, so a `dtSeconds` that isn't an exact multiple of the step
    // (or float error in the caller's own accumulation) can't compound into
    // drift across many calls.
    const steps = Math.round((dtSeconds * 1000) / STEP_MS);
    for (let i = 0; i < steps && !ended; i++) stepOnce();
  }

  function hit(cellIndex: number): BugSquashHitResult {
    if (ended) return { kind: 'miss' };
    const bug = bugs.get(cellIndex);
    if (!bug) {
      comboCount = 0;
      return { kind: 'miss' };
    }

    if (bug.hp > 1) {
      // A flaky bug survives one hit: it loses hp but gets a grace period
      // (matching the design's own `ttl + 0.6`) instead of dying outright.
      bugs.set(cellIndex, { ...bug, hp: 1, ttlMs: bug.ttlMs + 600 });
      return { kind: 'partial' };
    }

    bugs.delete(cellIndex);
    comboCount += 1;
    bestComboCount = Math.max(bestComboCount, comboCount);
    const multiplier = deriveMultiplier(comboCount);
    const points = (bug.flaky ? FLAKY_POINTS : CYAN_POINTS) * multiplier;
    score += points;
    squashed += 1;
    return { kind: 'squashed', points, multiplier };
  }

  function debugSetScore(nextScore: number): void {
    score = nextScore;
  }

  return { getState, getStats, tick, hit, debugSetScore };
}
