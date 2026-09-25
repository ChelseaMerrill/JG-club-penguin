import { describe, expect, it } from 'vitest';
import { CELL_COUNT, createBugSquashEngine, type BugSquashEngine } from './bug-squash-engine';

/** Cycles through `values` forever, so a short deterministic sequence can
 *  drive an arbitrary number of `rng()` calls. */
function queueRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length];
    i += 1;
    return value;
  };
}

/** Spawns a non-flaky bug in the lowest-index free cell every `tick`: a
 *  spawn-check roll of `0` always clears `< spawnProbability`, a cell-pick
 *  roll of `0` always picks the first free cell, and a flaky roll of `0.99`
 *  always clears `>= FLAKY_CHANCE` (0.25). */
function alwaysSpawnNonFlakyRng(): () => number {
  return queueRng([0, 0, 0.99]);
}

/** Spawns a flaky (2-hit) bug in the lowest-index free cell every tick. */
function alwaysSpawnFlakyRng(): () => number {
  return queueRng([0, 0, 0]);
}

/** Squashes cell `index` repeatedly, spawning and clearing a fresh
 *  non-flaky bug there each time, to build a consecutive-squash streak
 *  without any of the escape/lifetime mechanics interfering. */
function squashRepeatedly(engine: BugSquashEngine, times: number): void {
  for (let i = 0; i < times; i++) {
    engine.tick(0.1);
    engine.hit(0);
  }
}

describe('createBugSquashEngine: combo multiplier', () => {
  it('scores a squash at 1x until the 4th, then climbs to 2x, 3x and caps at 4x', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });

    const observedMultipliers: number[] = [];
    for (let i = 0; i < 12; i++) {
      engine.tick(0.1);
      const result = engine.hit(0);
      if (result.kind === 'squashed') observedMultipliers.push(result.multiplier);
    }

    // combo 1-3 -> x1, combo 4-7 -> x2, combo 8-11 -> x3, combo 12 -> x4.
    expect(observedMultipliers).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4]);
    expect(engine.getState().comboMultiplier).toBe(4);
    expect(engine.getState().bestComboMultiplier).toBe(4);
  });

  it("a cyan squash's points scale with the combo multiplier (10 x multiplier)", () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });

    squashRepeatedly(engine, 3); // combo now 3, still x1
    engine.tick(0.1);
    const fourth = engine.hit(0); // combo 4 -> x2

    expect(fourth).toMatchObject({ kind: 'squashed', points: 20, multiplier: 2 });
  });
});

describe('createBugSquashEngine: combo reset', () => {
  it('clicking an empty cell resets the combo to 1x', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });
    squashRepeatedly(engine, 4); // combo 4 -> x2
    expect(engine.getState().comboMultiplier).toBe(2);

    const miss = engine.hit(5); // cell 5 is never populated by this rng sequence
    expect(miss).toEqual({ kind: 'miss' });
    expect(engine.getState().comboCount).toBe(0);
    expect(engine.getState().comboMultiplier).toBe(1);

    // The next squash starts back at the 1x rate.
    engine.tick(0.1);
    const next = engine.hit(0);
    expect(next).toMatchObject({ kind: 'squashed', points: 10, multiplier: 1 });
  });
});

describe('createBugSquashEngine: bug types', () => {
  it('a cyan bug is squashed in 1 hit for +10', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });
    engine.tick(0.1);
    expect(engine.getState().cells[0].bug).toEqual({ flaky: false, hp: 1 });

    const result = engine.hit(0);

    expect(result).toEqual({ kind: 'squashed', points: 10, multiplier: 1 });
    expect(engine.getState().score).toBe(10);
    expect(engine.getState().squashed).toBe(1);
    expect(engine.getState().cells[0].bug).toBeNull();
  });

  it('a white flaky bug survives the first hit and is squashed on the 2nd for +25', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnFlakyRng() });
    engine.tick(0.1);
    expect(engine.getState().cells[0].bug).toEqual({ flaky: true, hp: 2 });

    const first = engine.hit(0);
    expect(first).toEqual({ kind: 'partial' });
    expect(engine.getState().squashed).toBe(0);
    expect(engine.getState().cells[0].bug).toEqual({ flaky: true, hp: 1 });

    const second = engine.hit(0);
    expect(second).toEqual({ kind: 'squashed', points: 25, multiplier: 1 });
    expect(engine.getState().score).toBe(25);
    expect(engine.getState().squashed).toBe(1);
  });
});

describe('createBugSquashEngine: escapes end the round', () => {
  it('losing all three build lights to escapes ends the round', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });

    // Never hit anything: every bug that spawns eventually ages out. Ticking
    // in a bounded loop (well past what 3 escapes could plausibly need)
    // avoids hard-coding the exact lifetime/spawn timing.
    for (let i = 0; i < 200 && !engine.getState().ended; i++) {
      engine.tick(1);
    }

    const state = engine.getState();
    expect(state.ended).toBe(true);
    expect(state.lights).toBe(0);
    expect(state.escaped).toBeGreaterThanOrEqual(3);
  });

  it('tick and hit are no-ops once the round has ended', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });
    for (let i = 0; i < 200 && !engine.getState().ended; i++) engine.tick(1);
    const finalState = engine.getState();

    engine.tick(5);
    expect(engine.hit(0)).toEqual({ kind: 'miss' });
    expect(engine.getState()).toEqual(finalState);
  });
});

/** An rng whose spawn-check roll can be toggled on/off, so a caller can
 *  fast-forward elapsed time (roll never clears the spawn-check) and then
 *  flip to a fixed roll to observe spawn behavior at that elapsed time,
 *  without any spawns happening during the fast-forward itself. Cell-pick
 *  and flaky rolls are always `0` (first free cell, always flaky; neither
 *  affects whether a spawn happens). */
function makeSpawnProbe(): { rng: () => number; setSpawnCheckRoll: (roll: number | null) => void } {
  // `null` means "never spawn": every step's spawn-check roll is `1`, which
  // never clears a `< probability` check, so the engine makes exactly one
  // `rng()` call per step (it short-circuits before the cell-pick/flaky
  // rolls) and time can be fast-forwarded without ever placing a bug.
  let spawnCheckRoll: number | null = null;
  // Only advances once a roll is set, so switching phases always starts a
  // step's rng() calls back at the spawn-check position (cycle 0).
  let cycle = 0;
  const rng = () => {
    if (spawnCheckRoll === null) return 1;
    const phase = cycle % 3;
    cycle += 1;
    if (phase === 0) return spawnCheckRoll; // the spawn-check roll
    if (phase === 1) return 0; // cell pick: the lowest-index free cell
    return 0.99; // flaky roll: never flaky
  };
  return {
    rng,
    setSpawnCheckRoll: (roll) => {
      spawnCheckRoll = roll;
      cycle = 0;
    },
  };
}

describe('createBugSquashEngine: the ramp', () => {
  it('caps concurrent bugs at 2 early, 3 by 20s, and 4 by 40s', () => {
    const early = makeSpawnProbe();
    const earlyEngine = createBugSquashEngine({ rng: early.rng });
    early.setSpawnCheckRoll(0);
    for (let i = 0; i < 6; i++) earlyEngine.tick(0.1); // ~0.6s elapsed: well inside any bug's TTL
    expect(earlyEngine.getState().cells.filter((c) => c.bug).length).toBe(2);

    const mid = makeSpawnProbe();
    const midEngine = createBugSquashEngine({ rng: mid.rng });
    midEngine.tick(25); // elapsed = 25s (never spawning), in the [20, 40) band
    mid.setSpawnCheckRoll(0);
    for (let i = 0; i < 6; i++) midEngine.tick(0.1);
    expect(midEngine.getState().cells.filter((c) => c.bug).length).toBe(3);

    const late = makeSpawnProbe();
    const lateEngine = createBugSquashEngine({ rng: late.rng });
    lateEngine.tick(40); // elapsed = 40s (never spawning), at/after the 40s band
    late.setSpawnCheckRoll(0);
    for (let i = 0; i < 6; i++) lateEngine.tick(0.1);
    expect(lateEngine.getState().cells.filter((c) => c.bug).length).toBe(4);
  });

  it('spawn probability rises from 0.10 at the start to 0.32 by 60s', () => {
    const early = makeSpawnProbe();
    const earlyEngine = createBugSquashEngine({ rng: early.rng });
    early.setSpawnCheckRoll(0.31); // >= 0.10 (elapsed 0), so it fails the early check
    earlyEngine.tick(0.1);
    expect(earlyEngine.getState().cells.some((c) => c.bug)).toBe(false);

    const late = makeSpawnProbe();
    const lateEngine = createBugSquashEngine({ rng: late.rng });
    lateEngine.tick(59.9); // never spawning yet (roll defaults to 1)
    late.setSpawnCheckRoll(0.31); // < 0.32 (elapsed ~60), so it now passes
    lateEngine.tick(0.1);
    expect(lateEngine.getState().cells.some((c) => c.bug)).toBe(true);
  });
});

describe('createBugSquashEngine: stats shape', () => {
  it('getStats reports score, squashed, bestCombo and escaped as numbers', () => {
    const engine = createBugSquashEngine({ rng: alwaysSpawnNonFlakyRng() });
    squashRepeatedly(engine, 5);

    const stats = engine.getStats();

    expect(stats).toEqual({
      score: expect.any(Number),
      squashed: expect.any(Number),
      bestCombo: expect.any(Number),
      escaped: expect.any(Number),
    });
    expect(Object.keys(stats).sort()).toEqual(['bestCombo', 'escaped', 'score', 'squashed']);
    expect(stats.squashed).toBe(5);
    expect(stats.score).toBe(engine.getState().score);
  });
});

describe('createBugSquashEngine: debugSetScore', () => {
  it('sets the score directly, bypassing hits', () => {
    const engine = createBugSquashEngine();
    engine.debugSetScore(500);
    expect(engine.getState().score).toBe(500);
    expect(engine.getStats().score).toBe(500);
  });
});

describe('createBugSquashEngine: cell count', () => {
  it('always reports exactly 16 cells', () => {
    const engine = createBugSquashEngine();
    expect(engine.getState().cells.length).toBe(CELL_COUNT);
  });
});
