import { describe, expect, it } from 'vitest';
import {
  BURN_OFF_AT_SEC,
  capForElapsed,
  createPancakeFlipEngine,
  scoreFromStats,
  STAGE_BURNT_AT_SEC,
  STAGE_FLIP_NOW_AT_SEC,
  STAGE_GOLDEN_AT_SEC,
  stageForAge,
  type PanIndex,
} from './pancake-flip-engine';

describe('stageForAge: the design stage thresholds', () => {
  it('is raw below 2.4s', () => {
    expect(stageForAge(0)).toBe('raw');
    expect(stageForAge(STAGE_FLIP_NOW_AT_SEC - 0.01)).toBe('raw');
  });

  it('is flip-now from 2.4s up to (not including) 4.6s', () => {
    expect(stageForAge(STAGE_FLIP_NOW_AT_SEC)).toBe('flip-now');
    expect(stageForAge(STAGE_GOLDEN_AT_SEC - 0.01)).toBe('flip-now');
  });

  it('is golden from 4.6s up to (not including) 6.8s', () => {
    expect(stageForAge(STAGE_GOLDEN_AT_SEC)).toBe('golden');
    expect(stageForAge(STAGE_BURNT_AT_SEC - 0.01)).toBe('golden');
  });

  it('is burnt at 6.8s and stays burnt up to the 8.4s burn-off point', () => {
    expect(stageForAge(STAGE_BURNT_AT_SEC)).toBe('burnt');
    expect(stageForAge(BURN_OFF_AT_SEC)).toBe('burnt');
  });
});

describe('capForElapsed: the batter cadence cap', () => {
  it('caps at 2 for the first 30s, 3 until 60s, then 4', () => {
    expect(capForElapsed(0)).toBe(2);
    expect(capForElapsed(29.9)).toBe(2);
    expect(capForElapsed(30)).toBe(3);
    expect(capForElapsed(59.9)).toBe(3);
    expect(capForElapsed(60)).toBe(4);
    expect(capForElapsed(1000)).toBe(4);
  });

  it('never lets more pans cook than the cap allows, even with guaranteed spawns', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 1, random: () => 0 });
    const countActive = () =>
      ([0, 1, 2, 3] as PanIndex[]).filter((i) => engine.panAt(i) !== null).length;

    for (let i = 0; i < 290; i++) {
      engine.tick(0.1);
      expect(countActive()).toBeLessThanOrEqual(2);
    }
    // Crossing into the 30s..60s window: cap 3.
    for (let i = 0; i < 290; i++) {
      engine.tick(0.1);
      expect(countActive()).toBeLessThanOrEqual(3);
    }
    // Crossing past 60s: cap 4.
    for (let i = 0; i < 100; i++) {
      engine.tick(0.1);
      expect(countActive()).toBeLessThanOrEqual(4);
    }
  });
});

describe('flip payout per stage', () => {
  it('pays 0 for Raw and marks it wasted, not stacked', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(0);
    const outcome = engine.flip(); // pan 0 seeded at age 0: raw
    expect(outcome).toBe('raw');
    expect(engine.stats).toEqual({
      golden: 0,
      flipNow: 0,
      raw: 1,
      burnt: 0,
      stacked: 0,
      bestStreak: 0,
    });
    expect(engine.score).toBe(0);
  });

  it('pays 5 for Flip Now and counts it stacked', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(0);
    engine.tick(STAGE_FLIP_NOW_AT_SEC); // pan 0 now flip-now
    const outcome = engine.flip();
    expect(outcome).toBe('flip-now');
    expect(engine.stats.flipNow).toBe(1);
    expect(engine.stats.stacked).toBe(1);
    expect(engine.score).toBe(5);
  });

  it('pays 10 for Golden and counts it stacked', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(0);
    engine.tick(STAGE_GOLDEN_AT_SEC);
    const outcome = engine.flip();
    expect(outcome).toBe('golden');
    expect(engine.stats.golden).toBe(1);
    expect(engine.stats.stacked).toBe(1);
    expect(engine.score).toBe(10);
  });

  it('pays -5 (against a buffer) for a manually-flipped Burnt pancake', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(0); // pan 0 seeded at age 0
    engine.tick(STAGE_GOLDEN_AT_SEC); // pan 0 -> 4.6s: golden
    expect(engine.flip()).toBe('golden'); // bank +10 first so the -5 doesn't floor away
    expect(engine.score).toBe(10);

    engine.select(2); // pan 2 seeded at age 1.5, now at 1.5+4.6=6.1s (golden, untouched)
    engine.tick(STAGE_BURNT_AT_SEC - STAGE_GOLDEN_AT_SEC); // pan 2 -> 8.3s: still burnt, not yet burned off
    const outcome = engine.flip();
    expect(outcome).toBe('burnt');
    expect(engine.stats.burnt).toBe(1);
    expect(engine.stats.stacked).toBe(1); // unchanged: burnt never stacks
    expect(engine.score).toBe(5);
  });

  it('flipping an empty pan is a no-op that changes nothing', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(1); // seeded empty
    const outcome = engine.flip();
    expect(outcome).toBe('empty');
    expect(engine.stats).toEqual({
      golden: 0,
      flipNow: 0,
      raw: 0,
      burnt: 0,
      stacked: 0,
      bestStreak: 0,
    });
  });
});

describe('a round of 2 Golden and 5 Burnt (issue #39 AC)', () => {
  it('scores 0, not a negative amount', () => {
    const stats = { golden: 2, flipNow: 0, raw: 0, burnt: 5, stacked: 2, bestStreak: 2 };
    // 2*10 - 5*5 = -5, floored at 0.
    expect(scoreFromStats(stats)).toBe(0);
  });

  it('holds through the live engine, banking Burnt flips before the Golden ones', () => {
    // Deterministic: `batterSpawnChance: 1` + `random: () => 0` always spawns
    // fresh batter into the lowest free pan index the instant a slot opens,
    // so exact pan timing can be driven by `tick` amounts alone.
    const engine = createPancakeFlipEngine({ batterSpawnChance: 1, random: () => 0 });
    const refillTwoLanes = () => {
      engine.tick(0);
      engine.tick(0);
    };

    // The two starting pans (0 and 2) -> Burnt, Burnt.
    engine.tick(STAGE_BURNT_AT_SEC);
    engine.select(0);
    expect(engine.flip()).toBe('burnt');
    engine.select(2);
    expect(engine.flip()).toBe('burnt');
    refillTwoLanes(); // pans 0 and 1 spawn fresh

    // Second pair -> Burnt, Burnt (4 total).
    engine.tick(STAGE_BURNT_AT_SEC);
    engine.select(0);
    expect(engine.flip()).toBe('burnt');
    engine.select(1);
    expect(engine.flip()).toBe('burnt');
    refillTwoLanes(); // pans 0 and 1 spawn fresh again

    // Third pair: flip pan 0 at Golden, then keep aging pan 1 to Burnt (5th).
    engine.tick(STAGE_GOLDEN_AT_SEC);
    engine.select(0);
    expect(engine.flip()).toBe('golden'); // 1st Golden
    engine.tick(STAGE_BURNT_AT_SEC - STAGE_GOLDEN_AT_SEC);
    engine.select(1);
    expect(engine.flip()).toBe('burnt'); // 5th Burnt

    // Flipping pan 0 above freed a slot that auto-refilled; age that pan to
    // Golden for the 2nd one.
    engine.tick(STAGE_GOLDEN_AT_SEC);
    engine.select(0);
    expect(engine.flip()).toBe('golden'); // 2nd Golden

    expect(engine.stats.golden).toBe(2);
    expect(engine.stats.burnt).toBe(5);
    // 2*10 - 5*5 = -5, floored at 0 (not the -5 a naive sum would show).
    expect(engine.score).toBe(0);
  });
});

describe('burn-off', () => {
  it('counts a pancake left past 8.4s as burnt and clears the pan', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    const { burnedOff } = engine.tick(BURN_OFF_AT_SEC + 0.1); // pan 0 (age 0) burns off
    expect(burnedOff).toContain(0);
    expect(engine.panAt(0)).toBeNull();
    expect(engine.stats.burnt).toBeGreaterThanOrEqual(1);
  });

  it('resets the streak', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 0 });
    engine.select(0);
    engine.tick(STAGE_GOLDEN_AT_SEC);
    engine.flip(); // streak 1
    expect(engine.streak).toBe(1);

    engine.tick(BURN_OFF_AT_SEC + 0.1); // pan 2 (already at 6.1s) burns off
    expect(engine.streak).toBe(0);
  });
});

describe('bestStreak', () => {
  it('tracks the longest run of Golden/Flip Now flips, surviving a later reset', () => {
    const engine = createPancakeFlipEngine({ batterSpawnChance: 1, random: () => 0 });
    let flips = 0;
    for (let i = 0; i < 2000 && flips < 3; i++) {
      engine.tick(0.1);
      for (const index of [0, 1, 2, 3] as PanIndex[]) {
        const pan = engine.panAt(index);
        if (pan && (pan.stage === 'golden' || pan.stage === 'flip-now') && flips < 3) {
          engine.select(index);
          engine.flip();
          flips += 1;
        }
      }
    }
    expect(engine.stats.bestStreak).toBeGreaterThanOrEqual(3);

    // Force a burn-off to reset the live streak; bestStreak must not drop.
    const bestBefore = engine.stats.bestStreak;
    engine.tick(BURN_OFF_AT_SEC + 1);
    expect(engine.streak).toBe(0);
    expect(engine.stats.bestStreak).toBe(bestBefore);
  });
});

describe('pan selection', () => {
  it('selectDelta clamps to the pan range [0, 3]', () => {
    const engine = createPancakeFlipEngine();
    engine.select(0);
    engine.selectDelta(-1);
    expect(engine.selected).toBe(0);

    engine.select(3);
    engine.selectDelta(1);
    expect(engine.selected).toBe(3);
  });

  it('select jumps directly to a pan index', () => {
    const engine = createPancakeFlipEngine();
    engine.select(2);
    expect(engine.selected).toBe(2);
  });
});

describe('stats shape', () => {
  it('starts with every counter at 0', () => {
    const engine = createPancakeFlipEngine();
    expect(engine.stats).toEqual({
      golden: 0,
      flipNow: 0,
      raw: 0,
      burnt: 0,
      stacked: 0,
      bestStreak: 0,
    });
  });
});
