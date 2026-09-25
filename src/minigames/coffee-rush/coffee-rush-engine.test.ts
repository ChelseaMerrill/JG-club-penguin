import { describe, expect, it } from 'vitest';
import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import {
  createCoffeeRushEngine,
  CUP_VALUE,
  FILL_TARGET_PCT,
  ORDER_QUEUE_SIZE,
  payoutFromStats,
  PATIENCE_START,
  PERFECT_BONUS,
  PERFECT_TOLERANCE_PCT,
  scoreFromStats,
  SERVE_TOLERANCE_PCT,
  type CoffeeRushEngine,
  type CupIndex,
  type PourOutcome,
} from './coffee-rush-engine';

/** Builds an engine whose head order is always the given size, by feeding a
 *  deterministic RNG that always picks index `sizeIndex` into `SIZES`
 *  (`['small','medium','large']`). */
function engineWithHeadSize(sizeIndex: 0 | 1 | 2): CoffeeRushEngine {
  return createCoffeeRushEngine({ random: () => sizeIndex / 3 });
}

function pourTo(engine: CoffeeRushEngine, fillPct: number): PourOutcome {
  engine.startPour();
  // POUR_RATE_PCT_PER_SEC is 26/s; ticking for fillPct/26 seconds lands
  // (within floating point noise) at fillPct exactly, since tick() doesn't
  // quantize to a fixed step.
  engine.tick(fillPct / 26);
  return engine.releasePour();
}

describe('order sizes and fill lines (design + ticket #50 numbers)', () => {
  it('exposes the ticket fill-line targets and cup values', () => {
    expect(FILL_TARGET_PCT).toEqual({ small: 40, medium: 65, large: 88 });
    expect(CUP_VALUE).toEqual({ small: 5, medium: 10, large: 15 });
  });

  it('always starts with a full 4-order line, each at full patience', () => {
    const engine = createCoffeeRushEngine();
    const orders = engine.orders();
    expect(orders).toHaveLength(ORDER_QUEUE_SIZE);
    for (const order of orders) {
      expect(order.patiencePct).toBe(PATIENCE_START);
      expect(['small', 'medium', 'large']).toContain(order.size);
    }
  });
});

describe('fill-line tolerance: the exact boundaries (issue #50 decision 4)', () => {
  it('is PERFECT exactly at the line and up to 4 under it', () => {
    const engine = engineWithHeadSize(1); // medium, target 65
    expect(pourTo(engine, 65)).toBe('perfect');

    const engine2 = engineWithHeadSize(1);
    expect(pourTo(engine2, 65 - PERFECT_TOLERANCE_PCT)).toBe('perfect');
  });

  it('is served (base value, no bonus) from just past 4 under the line up to 10 under', () => {
    const engine = engineWithHeadSize(1); // medium, target 65
    expect(pourTo(engine, 65 - PERFECT_TOLERANCE_PCT - 0.01)).toBe('served');

    const engine2 = engineWithHeadSize(1);
    expect(pourTo(engine2, 65 - SERVE_TOLERANCE_PCT)).toBe('served');
  });

  it('is rejected ("wrong size") more than 10 under the line, leaving the order in line', () => {
    const engine = engineWithHeadSize(1); // medium, target 65
    const sizeBefore = engine.orders()[0].size;
    const outcome = pourTo(engine, 65 - SERVE_TOLERANCE_PCT - 0.5);
    expect(outcome).toBe('rejected');
    // The order (its size) is still at the head, untouched -- only its
    // patience has drained, from `pourTo`'s own `tick()` call.
    expect(engine.orders()[0].size).toBe(sizeBefore);
    expect(engine.stats).toEqual({
      small: 0,
      medium: 0,
      large: 0,
      perfect: 0,
      spilled: 0,
      lost: 0,
    });
  });

  it('resets the streak on a rejection', () => {
    const engine = engineWithHeadSize(1);
    pourTo(engine, 65); // perfect, streak 1
    expect(engine.streak).toBe(1);
    pourTo(engine, 0); // way under: rejected
    expect(engine.streak).toBe(0);
  });
});

describe('overfill (ticket #50: "overfill spills"; the design\'s window is symmetric)', () => {
  it('counts a release up to 4 points over the line as perfect', () => {
    const engine = engineWithHeadSize(0); // small, target 40
    expect(pourTo(engine, 44)).toBe('perfect');
    expect(engine.stats.perfect).toBe(1);
  });

  it('serves a release 5-10 points over the line without the perfect bonus', () => {
    const engine = engineWithHeadSize(0);
    expect(pourTo(engine, 50)).toBe('served');
    expect(engine.stats).toMatchObject({ small: 1, perfect: 0, spilled: 0 });
  });

  it('spills a cup released more than 10 points over the line', () => {
    const engine = engineWithHeadSize(0); // small, target 40
    const sizeBefore = engine.orders()[0].size;
    const outcome = pourTo(engine, 51);
    expect(outcome).toBe('spilled');
    expect(engine.stats.spilled).toBe(1);
    expect(engine.orders()[0].size).toBe(sizeBefore); // order stays for another try
  });

  it('is not served: no size/perfect stat increments', () => {
    const engine = engineWithHeadSize(0);
    pourTo(engine, 100);
    expect(engine.stats).toEqual({
      small: 0,
      medium: 0,
      large: 0,
      perfect: 0,
      spilled: 1,
      lost: 0,
    });
    expect(engine.score).toBe(0);
  });

  it('resets the streak', () => {
    const engine = engineWithHeadSize(0);
    pourTo(engine, 40); // perfect, streak 1
    expect(engine.streak).toBe(1);
    pourTo(engine, 90); // overfill
    expect(engine.streak).toBe(0);
  });

  it('force-spills mid-pour once the cup reaches a full 100, without a release', () => {
    const engine = engineWithHeadSize(2); // large, target 88
    engine.startPour();
    const { forceSpilled } = engine.tick(100 / 26 + 1); // well past 100% fill
    expect(forceSpilled).toBe(true);
    expect(engine.pouring).toBe(false);
    expect(engine.cupAt(engine.selected).fillPct).toBe(0);
    expect(engine.stats.spilled).toBe(1);
  });
});

describe('payout per cup size + perfect bonus', () => {
  it('pays cup value alone for a plain served pour, per size', () => {
    for (const [sizeIndex, size, value] of [
      [0, 'small', 5],
      [1, 'medium', 10],
      [2, 'large', 15],
    ] as const) {
      const engine = engineWithHeadSize(sizeIndex);
      const target = FILL_TARGET_PCT[size];
      const outcome = pourTo(engine, target - SERVE_TOLERANCE_PCT); // served, not perfect
      expect(outcome).toBe('served');
      expect(engine.stats[size]).toBe(1);
      expect(engine.stats.perfect).toBe(0);
      expect(payoutFromStats(engine.stats)).toBe(value);
    }
  });

  it('adds the perfect bonus on top of the cup value', () => {
    const engine = engineWithHeadSize(2); // large, target 88, value 15
    expect(pourTo(engine, 88)).toBe('perfect');
    expect(engine.stats).toEqual({
      small: 0,
      medium: 0,
      large: 1,
      perfect: 1,
      spilled: 0,
      lost: 0,
    });
    expect(payoutFromStats(engine.stats)).toBe(CUP_VALUE.large + PERFECT_BONUS);
  });

  it("matches MINIGAME_RULES['coffee-rush'].rawPayout exactly for a mixed round", () => {
    const stats = { small: 5, medium: 5, large: 5, perfect: 2, spilled: 1, lost: 1 };
    expect(payoutFromStats(stats)).toBe(160);
    expect(MINIGAME_RULES['coffee-rush'].rawPayout(scoreFromStats(stats), stats)).toBe(160);
  });
});

describe('score = cups served (issue #50, matching the Barista threshold)', () => {
  it('sums small + medium + large, ignoring perfect/spilled/lost', () => {
    const stats = { small: 3, medium: 2, large: 1, perfect: 1, spilled: 4, lost: 2 };
    expect(scoreFromStats(stats)).toBe(6);
    expect(MINIGAME_RULES['coffee-rush'].rawBest(scoreFromStats(stats), stats)).toBe(6);
  });

  it('reaches the Barista threshold (15) via engine.score after 15 served pours', () => {
    const engine = engineWithHeadSize(0); // small every time, target 40
    for (let i = 0; i < 15; i++) {
      expect(pourTo(engine, 40)).toBe('perfect');
    }
    expect(engine.score).toBe(15);
    expect(engine.score).toBeGreaterThanOrEqual(MINIGAME_RULES['coffee-rush'].badgeThreshold);
  });
});

describe('patience expiry (walking out)', () => {
  it('walks the head order out once its patience hits 0, refilling the line', () => {
    const engine = createCoffeeRushEngine();
    const headBefore = engine.orders()[0];
    // Head patience drains at 10/s from 100, so 10s empties it exactly.
    const { walkedOut } = engine.tick(10);
    expect(walkedOut).toBe(true);
    expect(engine.stats.lost).toBe(1);
    expect(engine.orders()).toHaveLength(ORDER_QUEUE_SIZE);
    expect(engine.orders()[ORDER_QUEUE_SIZE - 1].patiencePct).toBe(PATIENCE_START);
    expect(engine.orders()[0]).not.toEqual(headBefore);
  });

  it('drains queued (non-head) orders slower than the head', () => {
    const engine = createCoffeeRushEngine();
    engine.tick(1);
    const orders = engine.orders();
    expect(orders[0].patiencePct).toBeCloseTo(PATIENCE_START - 10, 5);
    expect(orders[1].patiencePct).toBeCloseTo(PATIENCE_START - 3, 5);
  });

  it('resets the streak on a walkout', () => {
    const engine = engineWithHeadSize(0);
    pourTo(engine, 40); // perfect, streak 1
    expect(engine.streak).toBe(1);
    engine.tick(10); // next head walks out
    expect(engine.streak).toBe(0);
  });

  it('clamps a displayed patience at 0, never negative', () => {
    const engine = createCoffeeRushEngine();
    engine.tick(1000);
    expect(engine.orders()[0].patiencePct).toBe(0);
  });
});

describe('cup selection (A/D, design clamps 0..3)', () => {
  it('selectDelta clamps to the cup range [0, 3]', () => {
    const engine = createCoffeeRushEngine();
    engine.select(0);
    engine.selectDelta(-1);
    expect(engine.selected).toBe(0);

    engine.select(3);
    engine.selectDelta(1);
    expect(engine.selected).toBe(3);
  });

  it('select jumps directly to a cup index', () => {
    const engine = createCoffeeRushEngine();
    engine.select(2 as CupIndex);
    expect(engine.selected).toBe(2);
  });

  it('interrupts an in-progress pour without scoring or resetting its fill', () => {
    const engine = createCoffeeRushEngine();
    engine.select(0);
    engine.startPour();
    engine.tick(0.5); // partial fill on cup 0
    const fillBefore = engine.cupAt(0).fillPct;
    expect(fillBefore).toBeGreaterThan(0);

    engine.selectDelta(1); // switch to cup 1
    expect(engine.pouring).toBe(false);
    expect(engine.cupAt(0).fillPct).toBe(fillBefore); // untouched
  });
});

describe('a 90s round keeps ticking without error', () => {
  it("runs 900 ticks of 0.1s (the DOM layer's own cadence) cleanly", () => {
    const engine = createCoffeeRushEngine();
    for (let i = 0; i < 900; i++) {
      engine.tick(0.1);
      expect(engine.orders()).toHaveLength(ORDER_QUEUE_SIZE);
    }
    // Some orders should have walked out over 90s of unattended patience
    // drain, and stats stay well within the server's per-key bounds.
    expect(engine.stats.lost).toBeGreaterThan(0);
    expect(engine.stats.lost).toBeLessThan(100_000);
  });
});

describe('releasePour is a no-op when not pouring', () => {
  it("returns 'none' and changes nothing", () => {
    const engine = createCoffeeRushEngine();
    expect(engine.releasePour()).toBe('none');
    expect(engine.stats).toEqual({
      small: 0,
      medium: 0,
      large: 0,
      perfect: 0,
      spilled: 0,
      lost: 0,
    });
  });
});

describe("stats shape matches the contract (MinigameStatsMap['coffee-rush'])", () => {
  it('starts with every counter at 0', () => {
    const engine = createCoffeeRushEngine();
    expect(engine.stats).toEqual({
      small: 0,
      medium: 0,
      large: 0,
      perfect: 0,
      spilled: 0,
      lost: 0,
    });
  });

  it('every stat key is a non-negative integer', () => {
    const engine = engineWithHeadSize(1);
    pourTo(engine, 65); // perfect
    pourTo(engine, 90); // spilled
    engine.tick(10); // a walkout
    for (const value of Object.values(engine.stats)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
