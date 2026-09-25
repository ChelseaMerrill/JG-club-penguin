import { describe, expect, it } from 'vitest';
import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import {
  BACK_OF_LINE_PATIENCE_DECAY_PER_SEC,
  createSnowConeStandEngine,
  frontOfLinePatienceDecayPerSec,
  isRushHour,
  LINE_LENGTH,
  MAX_ORDER_SIZE,
  ROUND_DURATION_SEC,
  scoreFromStats,
  TOKENS_BY_CONE_SIZE,
} from './snow-cone-stand-engine';

/** Every customer this generates has a single-scoop order of flavour 0
 *  (`Math.floor(0 * n) === 0` for every roll) and a fixed, known patience
 *  decay rate -- deterministic regardless of how many customers get
 *  created, or whether they're created during rush hour or not. */
function zeroRandom(): number {
  return 0;
}

describe('isRushHour: the 60s-to-30s-remaining rush window (issue #49)', () => {
  it('is false before 60s remaining, true from 60s down to (not including) 30s remaining', () => {
    expect(isRushHour(59)).toBe(false); // 61s remaining
    expect(isRushHour(60)).toBe(true); // 60s remaining
    expect(isRushHour(89.9)).toBe(true); // 30.1s remaining
    expect(isRushHour(90)).toBe(false); // 30s remaining, not > 30
  });
});

describe('frontOfLinePatienceDecayPerSec: rush hour speeds up patience', () => {
  it('multiplies the base rate by 1.4x during rush hour, unchanged otherwise', () => {
    expect(frontOfLinePatienceDecayPerSec(10, false)).toBe(10);
    expect(frontOfLinePatienceDecayPerSec(10, true)).toBeCloseTo(14);
  });
});

describe('120s shift (issue #49)', () => {
  it("matches MINIGAME_RULES's duration, and rush hour is over once the shift ends", () => {
    expect(ROUND_DURATION_SEC).toBe(MINIGAME_RULES['snow-cone-stand'].durationSeconds);
    expect(isRushHour(ROUND_DURATION_SEC)).toBe(false);
    expect(isRushHour(ROUND_DURATION_SEC + 30)).toBe(false);
  });
});

describe('TOKENS_BY_CONE_SIZE: 5/10/15/25 by scoop count (issue #49)', () => {
  it('maps 1-4 scoops to 5, 10, 15, 25 tokens', () => {
    expect(TOKENS_BY_CONE_SIZE[1]).toBe(5);
    expect(TOKENS_BY_CONE_SIZE[2]).toBe(10);
    expect(TOKENS_BY_CONE_SIZE[3]).toBe(15);
    expect(TOKENS_BY_CONE_SIZE[4]).toBe(25);
  });
});

describe('scoreFromStats: mirrors the server payout exactly (issue #49 decision 3)', () => {
  it('sums normal cones at face value and rush cones doubled', () => {
    expect(
      scoreFromStats({
        cone5: 2,
        cone10: 0,
        cone15: 0,
        cone25: 0,
        rushCone5: 0,
        rushCone10: 0,
        rushCone15: 0,
        rushCone25: 4,
        served: 6,
        lost: 0,
      }),
    ).toBe(2 * 5 + 4 * 25 * 2); // 210, the #27 contract test's own figure
  });
});

describe('stats shape', () => {
  it('starts with every counter at 0, using exactly the 8 payout keys plus served/lost', () => {
    const engine = createSnowConeStandEngine();
    expect(Object.keys(engine.stats).sort()).toEqual(
      [
        'cone5',
        'cone10',
        'cone15',
        'cone25',
        'lost',
        'rushCone10',
        'rushCone15',
        'rushCone25',
        'rushCone5',
        'served',
      ].sort(),
    );
    expect(engine.stats).toEqual({
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
    });
  });

  it('always keeps the line at LINE_LENGTH (3) customers', () => {
    const engine = createSnowConeStandEngine();
    expect(engine.line).toHaveLength(LINE_LENGTH);
  });
});

describe('order matching', () => {
  it('serves and pays a correctly matched cone', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    const target = engine.line[0];
    expect(target.order).toEqual([0]);

    engine.addFlavor(0);
    const outcome = engine.serve();

    expect(outcome).toEqual({ result: 'served', coneSize: 1, tokensAwarded: 5, rush: false });
    expect(engine.stats.cone5).toBe(1);
    expect(engine.stats.served).toBe(1);
    expect(engine.stats.lost).toBe(0);
    expect(engine.yourScoops).toEqual([]);
    expect(engine.line).toHaveLength(LINE_LENGTH);
  });

  it('loses the customer on a wrong flavour', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    expect(engine.line[0].order).toEqual([0]);

    engine.addFlavor(1); // the customer ordered flavour 0
    const outcome = engine.serve();

    expect(outcome).toEqual({ result: 'wrong-order' });
    expect(engine.stats.served).toBe(0);
    expect(engine.stats.lost).toBe(1);
    expect(engine.yourScoops).toEqual([]);
    expect(engine.line).toHaveLength(LINE_LENGTH);
  });

  it('loses the customer on a wrong scoop count (right flavours, too few)', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    // Advance one serve so the next customer (still order [0] with a fixed
    // random source) is compared against an empty cone below is redundant;
    // instead directly under-serve the very first customer.
    const outcome = engine.serve(); // yours is empty, customer wants 1 scoop
    expect(outcome).toEqual({ result: 'wrong-order' });
    expect(engine.stats.lost).toBe(1);
  });
});

describe('undo', () => {
  it('removes the most recently added scoop, and is a no-op on an empty cone', () => {
    const engine = createSnowConeStandEngine();
    engine.addFlavor(0);
    engine.addFlavor(1);
    expect(engine.yourScoops).toEqual([0, 1]);

    engine.undo();
    expect(engine.yourScoops).toEqual([0]);

    engine.undo();
    expect(engine.yourScoops).toEqual([]);

    engine.undo(); // no-op, doesn't throw
    expect(engine.yourScoops).toEqual([]);
  });

  it('ignores a flavour key press once the cone already has MAX_ORDER_SIZE scoops', () => {
    const engine = createSnowConeStandEngine();
    engine.addFlavor(0);
    engine.addFlavor(1);
    engine.addFlavor(2);
    engine.addFlavor(3);
    engine.addFlavor(0); // ignored: already at MAX_ORDER_SIZE (4)
    expect(engine.yourScoops).toHaveLength(MAX_ORDER_SIZE);
  });
});

describe('patience expiry', () => {
  it('loses the front customer once their patience runs out, and refills the line', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    const firstId = engine.line[0].id;

    const { waddledOff } = engine.tick(10); // base rate 11/sec, non-rush: -110 patience
    expect(waddledOff).toBe(true);
    expect(engine.stats.lost).toBe(1);
    expect(engine.line).toHaveLength(LINE_LENGTH);
    expect(engine.line[0].id).not.toBe(firstId);
  });

  it("doesn't touch a customer whose patience is still positive", () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    const { waddledOff } = engine.tick(0.1); // -1.1 patience, still well above 0
    expect(waddledOff).toBe(false);
    expect(engine.stats.lost).toBe(0);
    expect(engine.line[0].patience).toBeCloseTo(98.9);
  });

  it('decays a non-front customer at the fixed back-of-line rate', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });
    engine.tick(1);
    expect(engine.line[1].patience).toBeCloseTo(100 - BACK_OF_LINE_PATIENCE_DECAY_PER_SEC);
  });
});

describe('rush hour (issue #49)', () => {
  it('doubles Tokens for a cone served once the shift crosses into the rush window', () => {
    const engine = createSnowConeStandEngine({ random: zeroRandom });

    // Before rush hour: pays face value.
    engine.addFlavor(0);
    const before = engine.serve();
    expect(before).toEqual({ result: 'served', coneSize: 1, tokensAwarded: 5, rush: false });

    // Advance the shift to exactly 60s elapsed (60s remaining): rush hour
    // starts. Every customer this engine ever creates orders flavour 0
    // alone (zeroRandom), so whichever is at the front afterward is still a
    // 1-scoop order, regardless of how many expired along the way.
    for (let i = 0; i < 60; i++) engine.tick(1);
    expect(engine.rush).toBe(true);

    engine.addFlavor(0);
    const during = engine.serve();
    expect(during).toEqual({ result: 'served', coneSize: 1, tokensAwarded: 10, rush: true });
    expect(engine.stats.cone5).toBe(1);
    expect(engine.stats.rushCone5).toBe(1);
  });
});
