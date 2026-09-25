import type { MinigameStatsMap } from '../../contracts';

/** One of the four pans on the griddle. */
export type PanIndex = 0 | 1 | 2 | 3;

export const PAN_COUNT = 4;

/** A pancake's cook stage, from `design/Minigame Pancake Flip.dc.html`'s own
 *  `stage(age)` thresholds: RAW until 2.4s, FLIP NOW until 4.6s, GOLDEN
 *  until 6.8s, then BURNT (still on the pan until it burns off at 8.4s). */
export type PancakeStage = 'raw' | 'flip-now' | 'golden' | 'burnt';

export const STAGE_FLIP_NOW_AT_SEC = 2.4;
export const STAGE_GOLDEN_AT_SEC = 4.6;
export const STAGE_BURNT_AT_SEC = 6.8;
/** A pancake left on the pan past this age burns off on its own (counts as
 *  Burnt) instead of waiting for the Player to flip it. */
export const BURN_OFF_AT_SEC = 8.4;

/** The pure stage/age mapping, exported for the DOM layer's own labels and
 *  for tests to check the exact boundaries independent of the engine. */
export function stageForAge(ageSec: number): PancakeStage {
  if (ageSec < STAGE_FLIP_NOW_AT_SEC) return 'raw';
  if (ageSec < STAGE_GOLDEN_AT_SEC) return 'flip-now';
  if (ageSec < STAGE_BURNT_AT_SEC) return 'golden';
  return 'burnt';
}

export type PancakeFlipStats = MinigameStatsMap['pancake-flip'];

function emptyStats(): PancakeFlipStats {
  return { golden: 0, flipNow: 0, raw: 0, burnt: 0, stacked: 0, bestStreak: 0 };
}

/**
 * Payout per flip (issue #39, decided 2026-09-24, replaces the design's
 * +15/+10 tip values): Golden +10, Flip Now +5, Raw 0, Burnt -5, the round's
 * total floored at 0. Mirrors `MINIGAME_RULES['pancake-flip'].rawPayout`
 * (`minigame-rules.ts`) exactly, but that formula is never imported here:
 * this module stays persistence-free, and the two are kept in step by the
 * shared `#27`/`#39` payout table and by
 * `progress-store.contract.ts`/`pancake-flip-engine.test.ts` both asserting
 * against it independently.
 */
export function scoreFromStats(
  stats: Pick<PancakeFlipStats, 'golden' | 'flipNow' | 'burnt'>,
): number {
  const raw = 10 * stats.golden + 5 * stats.flipNow - 5 * stats.burnt;
  return Math.max(0, raw);
}

/** What a pan looks like to the DOM layer: its current stage and how far
 *  through its cook time (0..1, clamped) it is, for the cook bar. */
export interface PanView {
  stage: PancakeStage;
  /** 0..1, `age / BURN_OFF_AT_SEC` clamped, for the cook bar's width. */
  cookFraction: number;
}

export type FlipOutcome = PancakeStage | 'empty';

export interface PancakeFlipEngineOptions {
  /** Chance, checked once per `tick()` call, of a free pan getting fresh
   *  batter when under the current cadence cap. Matches the design's own
   *  7%-per-100ms-tick cadence; tests pass 1 (always) or 0 (never) for
   *  deterministic spawn behavior. */
  batterSpawnChance?: number;
  /** Injectable RNG in `[0, 1)`; defaults to `Math.random`. */
  random?: () => number;
}

/**
 * A pure, DOM-free Pancake Flip round: four pans, the batter cadence, and
 * flip scoring. Time only moves when `tick(dtSec)` is called, so the DOM
 * layer (`pancake-flip.ts`) — which owns the interval and stops it on
 * `pause()`/`end()` — controls exactly how much "unpaused play time" the
 * cadence cap (`capForElapsed`) sees.
 */
export interface PancakeFlipEngine {
  readonly stats: Readonly<PancakeFlipStats>;
  /** The floored, running score (`scoreFromStats(stats)`); shown live via
   *  `MinigameContext.setScore` and returned by `Minigame.end()`. */
  readonly score: number;
  readonly selected: PanIndex;
  /** Consecutive Golden/Flip Now flips since the last Raw, Burnt, or
   *  burn-off; reflected into `stats.bestStreak` as it grows. */
  readonly streak: number;
  /** `null` for an empty pan. */
  panAt(index: PanIndex): PanView | null;
  /** Advances play by `dtSec` of unpaused time: ages every pan, burns off
   *  any pan past `BURN_OFF_AT_SEC` (counted as Burnt), then maybe drops
   *  fresh batter into a free pan if under the cadence cap. Returns the
   *  indexes that burned off this call, for the DOM layer's toast. */
  tick(dtSec: number): { burnedOff: PanIndex[] };
  select(index: PanIndex): void;
  selectDelta(delta: -1 | 1): void;
  /** Flips the selected pan. `'empty'` when there's nothing on it (a no-op
   *  besides reporting that). Otherwise removes the pancake and scores it. */
  flip(): FlipOutcome;
}

/** The batter cadence cap (issue #39): at most 2 pans cooking in the first
 *  30s of unpaused play, 3 until 60s, then 4. */
export function capForElapsed(elapsedSec: number): number {
  if (elapsedSec < 30) return 2;
  if (elapsedSec < 60) return 3;
  return 4;
}

export function createPancakeFlipEngine(options: PancakeFlipEngineOptions = {}): PancakeFlipEngine {
  const random = options.random ?? Math.random;
  const spawnChance = options.batterSpawnChance ?? 0.07;

  // Seeds two pans already cooking (one fresh, one partway along), the same
  // as the design's own `start()`, so the round isn't empty on frame one.
  const pans: Array<{ age: number } | null> = [{ age: 0 }, null, { age: 1.5 }, null];
  let elapsedSec = 0;
  let selected: PanIndex = 1;
  let streak = 0;
  const stats = emptyStats();

  function activeCount(): number {
    return pans.filter((pan) => pan !== null).length;
  }

  function panAt(index: PanIndex): PanView | null {
    const pan = pans[index];
    if (!pan) return null;
    return {
      stage: stageForAge(pan.age),
      cookFraction: Math.min(1, pan.age / BURN_OFF_AT_SEC),
    };
  }

  function tick(dtSec: number): { burnedOff: PanIndex[] } {
    elapsedSec += dtSec;
    const burnedOff: PanIndex[] = [];

    for (let i = 0; i < pans.length; i++) {
      const pan = pans[i];
      if (!pan) continue;
      pan.age += dtSec;
      if (pan.age > BURN_OFF_AT_SEC) {
        pans[i] = null;
        stats.burnt += 1;
        streak = 0;
        burnedOff.push(i as PanIndex);
      }
    }

    const cap = capForElapsed(elapsedSec);
    if (activeCount() < cap && random() < spawnChance) {
      const free: PanIndex[] = [];
      for (let i = 0; i < pans.length; i++) {
        if (pans[i] === null) free.push(i as PanIndex);
      }
      if (free.length > 0) {
        const pick = free[Math.floor(random() * free.length)];
        pans[pick] = { age: 0 };
      }
    }

    return { burnedOff };
  }

  function select(index: PanIndex): void {
    selected = index;
  }

  function selectDelta(delta: -1 | 1): void {
    selected = Math.max(0, Math.min(PAN_COUNT - 1, selected + delta)) as PanIndex;
  }

  function flip(): FlipOutcome {
    const pan = pans[selected];
    if (!pan) return 'empty';
    pans[selected] = null;
    const stage = stageForAge(pan.age);

    if (stage === 'raw') {
      stats.raw += 1;
      streak = 0;
    } else if (stage === 'burnt') {
      stats.burnt += 1;
      streak = 0;
    } else {
      if (stage === 'golden') stats.golden += 1;
      else stats.flipNow += 1;
      stats.stacked += 1;
      streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, streak);
    }

    return stage;
  }

  return {
    get stats() {
      return stats;
    },
    get score() {
      return scoreFromStats(stats);
    },
    get selected() {
      return selected;
    },
    get streak() {
      return streak;
    },
    panAt,
    tick,
    select,
    selectDelta,
    flip,
  };
}
