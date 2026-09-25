import type { MinigameStatsMap } from '../../contracts';

/** One of the four flavours, matching `design/build/snowcone-logic.js`'s own
 *  `FLAV` order and the keyboard 1-4 mapping (issue #49). */
export type FlavorIndex = 0 | 1 | 2 | 3;

export const FLAVOR_COUNT = 4;

/** Display name and swatch colour per flavour, taken verbatim from the
 *  design's `FLAV` array. Index order is the 1-4 key order. */
export const FLAVORS: ReadonlyArray<{ readonly name: string; readonly color: string }> = [
  { name: 'BLUE RASPBERRY', color: '#00BDFF' },
  { name: 'COCONUT', color: '#F4F4F4' },
  { name: 'MINT', color: '#BFE3F0' },
  { name: 'BLACKBERRY', color: '#0C4B5F' },
];

/** Customer first names, taken verbatim from the design's `NAMES` array. */
const NAMES = ['Elena', 'Marcus', 'Dev', 'Priya', 'Sam', 'Kai', 'Rosa', 'Theo', 'Ines', 'Bo'];

/** The Player builds at most this many scoops (a "Hexle-size" cone) before
 *  a flavour key press is ignored, matching the design's own
 *  `yours.length >= 4` guard. */
export const MAX_ORDER_SIZE = 4;

/** The queue is always topped back up to this many customers. */
export const LINE_LENGTH = 3;

/**
 * The round length (issue #49 ticket, matches `MINIGAME_RULES['snow-cone-stand']
 * .durationSeconds`; kept as its own constant, not an import, so this module
 * stays persistence-free the same way `pancake-flip-engine.ts` hardcodes its
 * own stage thresholds instead of importing `minigame-rules.ts`. The two are
 * kept in step by `snow-cone-stand-engine.test.ts` asserting they're equal.
 */
export const ROUND_DURATION_SEC = 120;

/** Rush hour (ticket #49, matches the design's `s.time <= 60 && s.time > 30`):
 *  active whenever the time *remaining* in the round is in this window. */
export const RUSH_HOUR_REMAINING_MAX_SEC = 60;
export const RUSH_HOUR_REMAINING_MIN_SEC = 30;

/** Tokens double during rush hour (ticket #49). */
export const RUSH_TOKEN_MULTIPLIER = 2;

/** A customer not at the front of the line loses patience at this fixed
 *  rate regardless of rush hour, matching the design's own flat `0.25` per
 *  100ms tick (`* 10` for a per-second rate; see `PATIENCE_RATE_SCALE`
 *  below for why every design decay value here is scaled by 10). */
export const BACK_OF_LINE_PATIENCE_DECAY_PER_SEC = 2.5;

/**
 * The design's own patience decay values (`c.rate`, the customer-lost-off
 * threshold, and the flat back-of-line `0.25`) were calibrated against its
 * `setInterval(this.tick, 100)` cadence: every value is "how much patience
 * drains in the next 100ms of real time". This engine's `tick(dtSec)` takes
 * an arbitrary elapsed slice instead (as `pancake-flip-engine.ts` does), so
 * every design decay value is scaled by 10 here to keep the same real-time
 * feel independent of how often `tick` is actually called. (Decision,
 * 2026-09-24: the ticket doesn't give its own numbers for patience decay, so
 * the design's own real-time pacing wins per decision 4.)
 */
const PATIENCE_RATE_SCALE = 10;

export function isRushHour(elapsedSec: number): boolean {
  const remaining = ROUND_DURATION_SEC - elapsedSec;
  return remaining <= RUSH_HOUR_REMAINING_MAX_SEC && remaining > RUSH_HOUR_REMAINING_MIN_SEC;
}

/** The front-of-line patience decay rate, applying rush hour's 1.4x speed-up
 *  (design: `c.rate * (rush ? 1.4 : 1)`) to a customer's own base rate.
 *  Exported so "rush hour speeds up patience" can be tested as a pure
 *  multiplier, independent of any particular customer's timing. */
export function frontOfLinePatienceDecayPerSec(baseRatePerSec: number, rush: boolean): number {
  return baseRatePerSec * (rush ? 1.4 : 1);
}

/** Tokens per cone, by scoop count (1-4) -- ticket #49, matches the design's
 *  `[0, 5, 10, 15, 25][order.length]` (index 0 unused: no cone has 0 scoops). */
export const TOKENS_BY_CONE_SIZE: Readonly<Record<number, number>> = { 1: 5, 2: 10, 3: 15, 4: 25 };

export type SnowConeStandStats = MinigameStatsMap['snow-cone-stand'];

function emptyStats(): SnowConeStandStats {
  return {
    cone5: 0,
    cone10: 0,
    cone15: 0,
    cone25: 0,
    rushCone5: 0,
    rushCone10: 0,
    rushCone15: 0,
    rushCone25: 0,
    served: 0,
    lost: 0,
  };
}

const NORMAL_STAT_KEY: Record<number, keyof SnowConeStandStats> = {
  1: 'cone5',
  2: 'cone10',
  3: 'cone15',
  4: 'cone25',
};
const RUSH_STAT_KEY: Record<number, keyof SnowConeStandStats> = {
  1: 'rushCone5',
  2: 'rushCone10',
  3: 'rushCone15',
  4: 'rushCone25',
};

/**
 * The round's payout formula, mirroring `MINIGAME_RULES['snow-cone-stand']
 * .rawPayout`/`.rawBest` (`minigame-rules.ts`) and `record_round`'s
 * `'snow-cone-stand'` branch (#27's migration) exactly: rush-hour cones pay
 * double, and the total is floored at 0 (a no-op here since every term is
 * already non-negative, but kept for parity with those two sources, which
 * `.rawBest` also floors). The Brain Freeze Badge threshold (200) is
 * compared against that same raw total server-side, so this is also the
 * round's displayed score (decision 3, issue #49): a game reporting a
 * "score" a Player can watch climb toward 200 that isn't what actually
 * earns the Badge would be a lie the server quietly overrules.
 */
export function scoreFromStats(stats: Readonly<SnowConeStandStats>): number {
  const raw =
    5 * stats.cone5 +
    10 * stats.cone10 +
    15 * stats.cone15 +
    25 * stats.cone25 +
    2 *
      (5 * stats.rushCone5 + 10 * stats.rushCone10 + 15 * stats.rushCone15 + 25 * stats.rushCone25);
  return Math.max(0, raw);
}

/** What a queued (or currently-being-served) customer looks like to the DOM
 *  layer: never exposes the internal patience decay rate. */
export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly order: readonly FlavorIndex[];
  /** 0..100, clamped at 0 (a customer at 0 is removed the same tick). */
  readonly patience: number;
}

interface InternalCustomer extends Customer {
  /** This customer's own base patience decay rate (per second, at the front
   *  of the line, before rush hour's 1.4x); fixed at creation. */
  readonly baseRatePerSec: number;
}

export type ServeOutcome =
  | { result: 'served'; coneSize: number; tokensAwarded: number; rush: boolean }
  | { result: 'wrong-order' }
  /** Nothing was at the front of the line to serve; a no-op, matching
   *  `pancake-flip-engine.ts`'s `flip()` returning `'empty'`. Shouldn't
   *  happen in practice (the line is always refilled to `LINE_LENGTH`). */
  | { result: 'empty' };

export interface SnowConeStandEngineOptions {
  /** Injectable RNG in `[0, 1)`; defaults to `Math.random`. */
  random?: () => number;
}

/**
 * A pure, DOM-free Snow Cone Stand round (issue #49): a 3-customer line,
 * patience decay, order building, and serve scoring. Time only moves when
 * `tick(dtSec)` is called, the same contract `pancake-flip-engine.ts` uses,
 * so the DOM layer (`snow-cone-stand.ts`) controls exactly how much unpaused
 * play time the round sees.
 */
export interface SnowConeStandEngine {
  readonly stats: Readonly<SnowConeStandStats>;
  /** The floored, running score (`scoreFromStats(stats)`). */
  readonly score: number;
  /** The queue, always exactly `LINE_LENGTH` long; index 0 is next served. */
  readonly line: readonly Customer[];
  readonly yourScoops: readonly FlavorIndex[];
  /** Whether the round is currently in rush hour. */
  readonly rush: boolean;
  readonly elapsedSec: number;
  /** Adds a scoop to the cone being built. Ignored once `yourScoops` is
   *  already `MAX_ORDER_SIZE` long (design: `yours.length >= 4`). */
  addFlavor(flavor: FlavorIndex): void;
  /** Removes the most recently added scoop; a no-op on an empty cone. */
  undo(): void;
  /** Serves the built cone to the front customer: matches (in order and
   *  count) -> `'served'` (paid, the customer leaves happy); any mismatch,
   *  including serving nothing to a customer who ordered scoops ->
   *  `'wrong-order'` (design fidelity: an accidental empty SPACE loses the
   *  customer, same as a wrong flavour). Either way clears the built cone
   *  and refills the line. */
  serve(): ServeOutcome;
  /** Advances play by `dtSec` of unpaused time: decays every customer's
   *  patience, drops the front customer (lost, refilled) if it hits 0.
   *  Returns whether that happened this call, for the DOM layer's toast. */
  tick(dtSec: number): { waddledOff: boolean };
}

export function createSnowConeStandEngine(
  options: SnowConeStandEngineOptions = {},
): SnowConeStandEngine {
  const random = options.random ?? Math.random;

  let elapsedSec = 0;
  let nextId = 1;
  let yours: FlavorIndex[] = [];
  const stats = emptyStats();

  function newCustomer(hard: boolean): InternalCustomer {
    // Always draws exactly 7 random() calls (1 order length + MAX_ORDER_SIZE
    // flavour rolls, even though only the first `orderLen` are used + 1 name
    // + 1 rate jitter), so every customer this engine ever creates consumes
    // a fixed, predictable slice of the injected RNG -- deterministic tests
    // can script exact customers without depending on order length first.
    const orderLen = 1 + Math.floor(random() * (hard ? 4 : 3));
    const rolls: FlavorIndex[] = [];
    for (let i = 0; i < MAX_ORDER_SIZE; i++) {
      rolls.push(Math.floor(random() * FLAVOR_COUNT) as FlavorIndex);
    }
    const name = NAMES[Math.floor(random() * NAMES.length)];
    const rateJitter = random();
    const baseRatePerSec = ((hard ? 1.6 : 1.1) + rateJitter * 0.6) * PATIENCE_RATE_SCALE;

    return {
      id: nextId++,
      name,
      order: rolls.slice(0, orderLen),
      patience: 100,
      baseRatePerSec,
    };
  }

  const line: InternalCustomer[] = [newCustomer(false), newCustomer(false), newCustomer(false)];

  function refill(hard: boolean): void {
    while (line.length < LINE_LENGTH) line.push(newCustomer(hard));
  }

  function tick(dtSec: number): { waddledOff: boolean } {
    elapsedSec += dtSec;
    const rush = isRushHour(elapsedSec);

    for (let i = 0; i < line.length; i++) {
      const decayPerSec =
        i === 0
          ? frontOfLinePatienceDecayPerSec(line[i].baseRatePerSec, rush)
          : BACK_OF_LINE_PATIENCE_DECAY_PER_SEC;
      line[i] = { ...line[i], patience: line[i].patience - decayPerSec * dtSec };
    }

    let waddledOff = false;
    if (line[0] && line[0].patience <= 0) {
      line.shift();
      stats.lost += 1;
      waddledOff = true;
    }
    refill(rush);

    return { waddledOff };
  }

  function addFlavor(flavor: FlavorIndex): void {
    if (yours.length >= MAX_ORDER_SIZE) return;
    yours.push(flavor);
  }

  function undo(): void {
    yours.pop();
  }

  function serve(): ServeOutcome {
    const customer = line[0];
    if (!customer) return { result: 'empty' };

    const rush = isRushHour(elapsedSec);
    const matches =
      customer.order.length === yours.length &&
      customer.order.every((flavor, i) => flavor === yours[i]);

    line.shift();
    yours = [];

    if (!matches) {
      stats.lost += 1;
      refill(rush);
      return { result: 'wrong-order' };
    }

    const size = customer.order.length;
    const tokensAwarded = TOKENS_BY_CONE_SIZE[size] * (rush ? RUSH_TOKEN_MULTIPLIER : 1);
    const key = (rush ? RUSH_STAT_KEY : NORMAL_STAT_KEY)[size];
    stats[key] += 1;
    stats.served += 1;
    refill(rush);

    return { result: 'served', coneSize: size, tokensAwarded, rush };
  }

  return {
    get stats() {
      return stats;
    },
    get score() {
      return scoreFromStats(stats);
    },
    get line() {
      return line;
    },
    get yourScoops() {
      return yours;
    },
    get rush() {
      return isRushHour(elapsedSec);
    },
    get elapsedSec() {
      return elapsedSec;
    },
    addFlavor,
    undo,
    serve,
    tick,
  };
}
