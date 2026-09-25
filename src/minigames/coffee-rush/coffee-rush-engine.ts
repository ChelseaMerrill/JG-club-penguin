import type { MinigameStatsMap } from '../../contracts';

/** One of the four cups on the counter. */
export type CupIndex = 0 | 1 | 2 | 3;

export const CUP_COUNT = 4;

/** The order queue's fixed length (issue #50, mirroring `design/Minigame
 *  Coffee Rush.dc.html`'s own four-ticket line). Only `orders()[0]` (the
 *  head) is ever the active pour target; the rest are shown for their
 *  draining patience bars. */
export const ORDER_QUEUE_SIZE = 4;

export type CupSize = 'small' | 'medium' | 'large';

/** Fill-line target percentage per order size (ticket #50's own numbers,
 *  verbatim from `design/Minigame Coffee Rush.dc.html`'s `SIZES` table). */
export const FILL_TARGET_PCT: Record<CupSize, number> = {
  small: 40,
  medium: 65,
  large: 88,
};

/** Token value per correctly-served cup, before any perfect bonus (ticket
 *  #50's numbers, matching `MINIGAME_RULES['coffee-rush'].rawPayout` and the
 *  `record_round` SQL branch exactly). */
export const CUP_VALUE: Record<CupSize, number> = {
  small: 5,
  medium: 10,
  large: 15,
};

/** Bonus added to a perfect pour's payout (ticket #50). */
export const PERFECT_BONUS = 5;

/** A release within this many fill points of the target line, either side,
 *  is a PERFECT pour (ticket #50: "within 4% of the line is PERFECT"). */
export const PERFECT_TOLERANCE_PCT = 4;

/**
 * A release off the target by more than `PERFECT_TOLERANCE_PCT` but no
 * more than this, either side, is still served without the perfect bonus:
 * `design/Minigame Coffee Rush.dc.html`'s own symmetric `pourStop`
 * window (`Math.abs(f - target) <= 10`), since the ticket names no number
 * here. Further over the line spills ("overfill spills"); further under is
 * rejected.
 */
export const SERVE_TOLERANCE_PCT = 10;

/** Fill gained per second while holding the pour (design's own `+2.6` per
 *  100ms tick -> 26/s), reaching a full, forced-spill cup in ~3.8s. */
export const POUR_RATE_PCT_PER_SEC = 26;

/** Patience lost per second by the order at the head of the line (design's
 *  own `-1.0` per 100ms tick -> 10/s): about 10s to walk out once it's the
 *  one being poured for. */
export const HEAD_PATIENCE_DECAY_PCT_PER_SEC = 10;

/** Patience lost per second by every other queued order (design's own
 *  `-0.3` per 100ms tick -> 3/s): a much slower drain while waiting in line,
 *  so an order can still arrive at the head already worn down. */
export const QUEUED_PATIENCE_DECAY_PCT_PER_SEC = 3;

export const PATIENCE_START = 100;

export interface CoffeeRushEngineOptions {
  /** Injectable RNG in `[0, 1)`, for deterministic order sizes in tests;
   *  defaults to `Math.random`. */
  random?: () => number;
}

const SIZES: readonly CupSize[] = ['small', 'medium', 'large'];

export interface OrderView {
  size: CupSize;
  /** 0..100, clamped; the order's remaining patience. */
  patiencePct: number;
}

export interface CupView {
  /** 0..100, how full the cup currently is. */
  fillPct: number;
}

/** The outcome of releasing a pour (issue #50 decision 4, see
 *  `SERVE_TOLERANCE_PCT`'s doc comment for the exact boundaries):
 *  - `'perfect'`: within `PERFECT_TOLERANCE_PCT` of the line, pays the cup's
 *    value plus `PERFECT_BONUS`.
 *  - `'served'`: off the line (either side) by more than the perfect
 *    tolerance but within `SERVE_TOLERANCE_PCT`, pays just the cup's value.
 *  - `'rejected'`: under the line by more than `SERVE_TOLERANCE_PCT` (the
 *    "wrong size" case: too far off this order's own fill line to count as
 *    filling it). Doesn't pay, doesn't spill the cup (it's simply poured
 *    out), and leaves the order in line for another attempt.
 *  - `'spilled'`: released over the line by more than
 *    `SERVE_TOLERANCE_PCT` (ticket #50: "overfill spills"), or
 *    force-spilled mid-pour by `tick()` reaching a full cup first. The cup is lost and the order stays in
 *    line.
 *  - `'none'`: `releasePour()` called while not pouring; a no-op. */
export type PourOutcome = 'perfect' | 'served' | 'rejected' | 'spilled' | 'none';

export type CoffeeRushStats = MinigameStatsMap['coffee-rush'];

function emptyStats(): CoffeeRushStats {
  return { small: 0, medium: 0, large: 0, perfect: 0, spilled: 0, lost: 0 };
}

/** The round's floored score: cups served correctly, regardless of size or
 *  perfect bonus (issue #50: "score = cups served"). Matches
 *  `MINIGAME_RULES['coffee-rush'].rawBest` and the `record_round` SQL
 *  branch's `v_best` exactly, so the Barista badge threshold (>= 15) reads
 *  the same number the shell shows live as SCORE. */
export function scoreFromStats(stats: Pick<CoffeeRushStats, 'small' | 'medium' | 'large'>): number {
  return stats.small + stats.medium + stats.large;
}

/** The round's raw Token payout, matching `MINIGAME_RULES['coffee-rush']
 *  .rawPayout` and the `record_round` SQL branch exactly: never imported
 *  from here (this module stays persistence-free), kept in step by
 *  `coffee-rush-engine.test.ts` and `progress-store.contract.ts` both
 *  asserting against the same numbers independently. */
export function payoutFromStats(
  stats: Pick<CoffeeRushStats, 'small' | 'medium' | 'large' | 'perfect'>,
): number {
  return (
    CUP_VALUE.small * stats.small +
    CUP_VALUE.medium * stats.medium +
    CUP_VALUE.large * stats.large +
    PERFECT_BONUS * stats.perfect
  );
}

export interface CoffeeRushEngine {
  readonly stats: Readonly<CoffeeRushStats>;
  /** The floored score (`scoreFromStats(stats)`); cups served, not Tokens. */
  readonly score: number;
  readonly selected: CupIndex;
  readonly pouring: boolean;
  /** Consecutive served (perfect or plain) pours since the last spill,
   *  rejection, or walkout. */
  readonly streak: number;
  readonly bestStreak: number;
  /** The order line, always `ORDER_QUEUE_SIZE` long; index 0 is the head
   *  (the active pour target and the one whose patience drains fastest). */
  orders(): readonly OrderView[];
  cupAt(index: CupIndex): CupView;
  /** Advances play by `dtSec` of unpaused time: drains patience, walks out
   *  the head order if it hits 0 (refilling the line), and grows the
   *  selected cup's fill while pouring -- force-spilling it if it reaches a
   *  full 100 before being released. */
  tick(dtSec: number): { walkedOut: boolean; forceSpilled: boolean };
  select(index: CupIndex): void;
  selectDelta(delta: -1 | 1): void;
  /** Starts pouring into the selected cup; a no-op if already pouring. */
  startPour(): void;
  /** Releases the pour, scoring it against the head order's fill line (see
   *  `PourOutcome`). Always empties the poured cup and stops pouring. */
  releasePour(): PourOutcome;
}

export function createCoffeeRushEngine(options: CoffeeRushEngineOptions = {}): CoffeeRushEngine {
  const random = options.random ?? Math.random;

  function makeOrder(): { size: CupSize; patience: number } {
    const size = SIZES[Math.floor(random() * SIZES.length)];
    return { size, patience: PATIENCE_START };
  }

  const orderQueue: Array<{ size: CupSize; patience: number }> = [];
  while (orderQueue.length < ORDER_QUEUE_SIZE) orderQueue.push(makeOrder());

  const cups: Array<{ fill: number }> = [{ fill: 0 }, { fill: 0 }, { fill: 0 }, { fill: 0 }];
  let selected: CupIndex = 0;
  let pouring = false;
  let streak = 0;
  let bestStreak = 0;
  const stats = emptyStats();

  function refillQueue(): void {
    while (orderQueue.length < ORDER_QUEUE_SIZE) orderQueue.push(makeOrder());
  }

  function orders(): readonly OrderView[] {
    return orderQueue.map((order) => ({
      size: order.size,
      patiencePct: Math.max(0, order.patience),
    }));
  }

  function cupAt(index: CupIndex): CupView {
    return { fillPct: cups[index].fill };
  }

  function tick(dtSec: number): { walkedOut: boolean; forceSpilled: boolean } {
    if (orderQueue[0]) orderQueue[0].patience -= HEAD_PATIENCE_DECAY_PCT_PER_SEC * dtSec;
    for (let i = 1; i < orderQueue.length; i++) {
      orderQueue[i].patience -= QUEUED_PATIENCE_DECAY_PCT_PER_SEC * dtSec;
    }

    let walkedOut = false;
    if (orderQueue[0] && orderQueue[0].patience <= 0) {
      orderQueue.shift();
      stats.lost += 1;
      streak = 0;
      walkedOut = true;
      refillQueue();
    }

    let forceSpilled = false;
    if (pouring) {
      const cup = cups[selected];
      cup.fill = Math.min(100, cup.fill + POUR_RATE_PCT_PER_SEC * dtSec);
      if (cup.fill >= 100) {
        cup.fill = 0;
        pouring = false;
        stats.spilled += 1;
        streak = 0;
        forceSpilled = true;
      }
    }

    return { walkedOut, forceSpilled };
  }

  function select(index: CupIndex): void {
    selected = index;
    pouring = false;
  }

  function selectDelta(delta: -1 | 1): void {
    selected = Math.max(0, Math.min(CUP_COUNT - 1, selected + delta)) as CupIndex;
    pouring = false;
  }

  function startPour(): void {
    if (!pouring) pouring = true;
  }

  function releasePour(): PourOutcome {
    if (!pouring) return 'none';
    pouring = false;
    const cup = cups[selected];
    const fill = cup.fill;
    cup.fill = 0;

    const order = orderQueue[0];
    if (!order) return 'none';
    const target = FILL_TARGET_PCT[order.size];

    // A small epsilon absorbs floating-point noise from `tick(dtSec)`'s own
    // `POUR_RATE_PCT_PER_SEC * dtSec` accumulation so a pour meant to land
    // exactly on a boundary (the line itself, or the tolerance edges) isn't
    // misclassified by a fraction of a fill point.
    const EPSILON = 1e-6;

    const diff = Math.abs(fill - target);
    if (diff > SERVE_TOLERANCE_PCT + EPSILON) {
      streak = 0;
      if (fill < target) return 'rejected';
      stats.spilled += 1;
      return 'spilled';
    }

    const perfect = diff <= PERFECT_TOLERANCE_PCT + EPSILON;
    stats[order.size] += 1;
    if (perfect) stats.perfect += 1;
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    orderQueue.shift();
    refillQueue();
    return perfect ? 'perfect' : 'served';
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
    get pouring() {
      return pouring;
    },
    get streak() {
      return streak;
    },
    get bestStreak() {
      return bestStreak;
    },
    orders,
    cupAt,
    tick,
    select,
    selectDelta,
    startPour,
    releasePour,
  };
}
