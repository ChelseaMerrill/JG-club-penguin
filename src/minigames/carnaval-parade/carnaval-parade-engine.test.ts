import { describe, expect, it } from 'vitest';
import {
  createCarnavalParadeEngine,
  DURATION_MS,
  multiplierForStreak,
  paradeSpeed,
  spawnIntervalBaseMs,
  TICK_MS,
  type CarnavalParadeEngine,
} from './carnaval-parade-engine';

/** A scripted rng: `rng()` cycles through `queue`, and `next(...)` replaces
 *  the queue (and resets to its start) for later calls -- lets a test spawn
 *  one kind of item, then redirect to another, without rebuilding the engine. */
function scriptedRng(initial: readonly number[]): {
  rng: () => number;
  next(...values: number[]): void;
} {
  let queue: readonly number[] = initial;
  let index = 0;
  return {
    rng: () => {
      const value = queue[index % queue.length];
      index += 1;
      return value;
    },
    next(...values: number[]) {
      queue = values;
      index = 0;
    },
  };
}

/** Ticks `engine` until `predicate()` is true, or throws after `maxTicks`. */
function tickUntil(engine: CarnavalParadeEngine, predicate: () => boolean, maxTicks = 3000): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    engine.tick();
  }
  throw new Error(`tickUntil: predicate still false after ${maxTicks} ticks`);
}

describe('multiplierForStreak', () => {
  it('ramps every 5 in a row, capped at x4 (design: min(4, 1 + floor(streak / 5)))', () => {
    expect(multiplierForStreak(0)).toBe(1);
    expect(multiplierForStreak(4)).toBe(1);
    expect(multiplierForStreak(5)).toBe(2);
    expect(multiplierForStreak(9)).toBe(2);
    expect(multiplierForStreak(10)).toBe(3);
    expect(multiplierForStreak(14)).toBe(3);
    expect(multiplierForStreak(15)).toBe(4);
    expect(multiplierForStreak(19)).toBe(4);
    expect(multiplierForStreak(20)).toBe(4);
    expect(multiplierForStreak(1000)).toBe(4);
  });
});

describe('paradeSpeed', () => {
  it('ramps from 0.45 px/ms at the start to 1.05 px/ms by the finish, then stays there', () => {
    expect(paradeSpeed(0)).toBeCloseTo(0.45, 10);
    expect(paradeSpeed(DURATION_MS / 2)).toBeCloseTo(0.75, 10);
    expect(paradeSpeed(DURATION_MS)).toBeCloseTo(1.05, 10);
    expect(paradeSpeed(DURATION_MS * 2)).toBeCloseTo(1.05, 10);
  });
});

describe('spawnIntervalBaseMs', () => {
  it('starts at 700 ms and floors at 300 ms from about 36.4 s in', () => {
    expect(spawnIntervalBaseMs(0)).toBe(700);
    expect(spawnIntervalBaseMs(36_364)).toBeCloseTo(300, 0);
    expect(spawnIntervalBaseMs(45_000)).toBe(300);
  });
});

describe('createCarnavalParadeEngine', () => {
  it('starts with 3 lives, the middle lane, a 10-score feather and a 25-score star both at x1', () => {
    const engine = createCarnavalParadeEngine();
    expect(engine.view).toMatchObject({
      phase: 'play',
      score: 0,
      lives: 3,
      streak: 0,
      bestStreak: 0,
      multiplier: 1,
      lane: 1,
      ended: null,
    });
    expect(engine.stats()).toEqual({ feathers: 0, stars: 0, barriersHit: 0, bestStreak: 0 });
  });

  it('is reproducible: two engines built with the same seeded rng spawn identical items', () => {
    const build = () =>
      createCarnavalParadeEngine({ rng: scriptedRng([0.1, 0.4, 0.15, 0.05, 0.91]).rng });
    const a = build();
    const b = build();

    for (let i = 0; i < 200; i++) {
      a.tick();
      b.tick();
    }

    expect(a.view.items).toEqual(b.view.items);
    expect(a.view.score).toBe(b.view.score);
    expect(a.stats()).toEqual(b.stats());
  });

  it('a feather scores 10 at x1 and counts toward the streak and feathers stat', () => {
    // jitter=0, lane=floor(0.5*3)=1 (the Penguin's own starting lane), r=0.6 -> a single feather.
    const { rng } = scriptedRng([0, 0.5, 0.6]);
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.view.score > 0);

    expect(engine.view.score).toBe(10);
    expect(engine.view.streak).toBe(1);
    expect(engine.view.bestStreak).toBe(1);
    expect(engine.stats()).toMatchObject({ feathers: 1, stars: 0, barriersHit: 0 });
  });

  it('a gold star scores 25 at x1 and counts toward the stars stat, not feathers', () => {
    // r=0.28 is in [.22, .34): a star.
    const { rng } = scriptedRng([0, 0.5, 0.28]);
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.view.score > 0);

    expect(engine.view.score).toBe(25);
    expect(engine.stats()).toMatchObject({ feathers: 0, stars: 1, barriersHit: 0 });
  });

  it('the multiplier reaches x2 on the 6th feather in a row, scoring it 20', () => {
    const { rng } = scriptedRng([0, 0.5, 0.6]); // repeated single feathers, same lane as the Penguin.
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.stats().feathers >= 5);
    expect(engine.view.score).toBe(50); // 5 feathers at x1.
    expect(engine.view.streak).toBe(5);
    expect(engine.view.multiplier).toBe(2); // what the *next* pickup would score at.

    tickUntil(engine, () => engine.stats().feathers >= 6);
    expect(engine.view.score).toBe(70); // +20 (10 * x2) for the 6th.
    expect(engine.view.bestStreak).toBe(6);
  });

  it('a barrier costs a life, resets the streak, and counts toward barriersHit', () => {
    const { rng, next } = scriptedRng([0, 0.5, 0.6]); // feathers in lane 1 first, to bank a streak.
    const engine = createCarnavalParadeEngine({ rng });
    tickUntil(engine, () => engine.stats().feathers >= 2);
    expect(engine.view.streak).toBeGreaterThan(0);

    // r=0.1 (<.22) spawns a barrier in the Penguin's lane; the extra-barrier
    // roll (0.9) stays >= .4, so no second barrier rides along.
    next(0, 0.5, 0.1, 0.9);
    tickUntil(engine, () => engine.view.lives < 3, 3000);

    expect(engine.view.lives).toBe(2);
    expect(engine.view.streak).toBe(0);
    expect(engine.stats()).toMatchObject({ barriersHit: 1 });
  });

  it('missing a feather (it scrolls off-screen uncollected) breaks the streak', () => {
    const { rng, next } = scriptedRng([0, 0.5, 0.6]); // feathers in lane 1 (the default lane).
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.stats().feathers >= 2);
    expect(engine.view.streak).toBe(2);

    engine.moveLane(-1); // lane 1 -> 0, out of the path of every in-flight and future feather.
    next(0, 0.5, 0.6);
    tickUntil(engine, () => engine.view.streak === 0, 3000);

    // Nothing more was actually collected -- the streak reset came from a miss.
    expect(engine.stats().feathers).toBe(2);
  });

  it('missing a gold star does not break the streak (only a missed feather does)', () => {
    // Alternates two spawn events: a feather in lane 1 (the Penguin's own
    // starting lane, always collected) and a gold star in lane 0 (never the
    // Penguin's lane, always missed) -- isolating the star's miss from any
    // feather miss, since the Penguin never has to move lanes for this.
    const { rng } = scriptedRng([0, 0.5, 0.6, 0, 0, 0.28]);
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.stats().feathers >= 4);

    // Every feather landed in an unbroken row: a missed star never reset it.
    expect(engine.view.streak).toBe(4);
    expect(engine.stats().stars).toBe(0);
  });

  it("ends with ended: 'time' at 45 s when lives never run out", () => {
    // lane=floor(0.91*3)=2; the Penguin stays in its default lane (1), so
    // nothing it spawns (feathers, r=.6) is ever in the Penguin's own lane.
    const { rng } = scriptedRng([0, 0.91, 0.6]);
    const engine = createCarnavalParadeEngine({ rng });

    const totalTicks = Math.ceil(DURATION_MS / TICK_MS) + 5;
    for (let i = 0; i < totalTicks && engine.view.phase === 'play'; i++) engine.tick();

    expect(engine.view.phase).toBe('done');
    expect(engine.view.ended).toBe('time');
    expect(engine.view.lives).toBe(3);
  });

  it("ends with ended: 'lives' once the 3rd barrier lands, well before 45 s", () => {
    const { rng } = scriptedRng([0, 0.5, 0.1, 0.9]); // repeated barriers, the Penguin's own lane.
    const engine = createCarnavalParadeEngine({ rng });

    tickUntil(engine, () => engine.view.lives <= 0, 3000);

    expect(engine.view.phase).toBe('done');
    expect(engine.view.ended).toBe('lives');
    expect(engine.view.elapsedMs).toBeLessThan(DURATION_MS);
    expect(engine.stats().barriersHit).toBe(3);
  });

  it('tick() is a no-op once the round is done', () => {
    const { rng } = scriptedRng([0, 0.5, 0.1, 0.9]);
    const engine = createCarnavalParadeEngine({ rng });
    tickUntil(engine, () => engine.view.phase === 'done', 3000);
    const frozen = { ...engine.view };

    engine.tick();
    engine.tick();

    expect(engine.view.score).toBe(frozen.score);
    expect(engine.view.lives).toBe(frozen.lives);
    expect(engine.view.elapsedMs).toBe(frozen.elapsedMs);
  });

  it('moveLane clamps to [0, 2] and is a no-op once the round is done', () => {
    const engine = createCarnavalParadeEngine();
    engine.moveLane(-1);
    engine.moveLane(-1);
    expect(engine.view.lane).toBe(0);
    engine.moveLane(-1);
    expect(engine.view.lane).toBe(0);

    engine.moveLane(1);
    engine.moveLane(1);
    expect(engine.view.lane).toBe(2);
    engine.moveLane(1);
    expect(engine.view.lane).toBe(2);

    const { rng } = scriptedRng([0, 0.5, 0.1, 0.9]);
    const done = createCarnavalParadeEngine({ rng });
    tickUntil(done, () => done.view.phase === 'done', 3000);
    done.moveLane(1);
    expect(done.view.lane).toBe(1);
  });

  it('debugSetScore sets the score and feather/star counts directly, for shell tests', () => {
    const engine = createCarnavalParadeEngine();

    engine.debugSetScore(410, 41, 0);

    expect(engine.view.score).toBe(410);
    expect(engine.stats()).toMatchObject({ feathers: 41, stars: 0 });
  });
});
