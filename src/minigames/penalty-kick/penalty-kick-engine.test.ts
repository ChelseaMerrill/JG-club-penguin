import { describe, expect, it } from 'vitest';
import {
  aimXPeriodMs,
  aimYPeriodMs,
  createPenaltyKickEngine,
  INTRO_COACH_LINE,
  KICK_DURATION_MS,
  resultLine,
  resultTitle,
  RESULT_PAUSE_MS,
  scored,
  SHOTS_PER_ROUND,
  TICK_MS,
  type PenaltyKickEngine,
  type PenaltyOutcome,
} from './penalty-kick-engine';

/** A `random` that always returns the same value, queued values exhausted by repeating the last. */
function queuedRandom(values: readonly number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function ticks(engine: PenaltyKickEngine, n: number): void {
  for (let i = 0; i < n; i++) engine.tick();
}

/** Ticks the ball flight (`KICK_DURATION_MS`) and the result pause (`RESULT_PAUSE_MS`) through to the next shot. */
function playOutKick(engine: PenaltyKickEngine): void {
  ticks(engine, Math.ceil(KICK_DURATION_MS / TICK_MS));
  ticks(engine, Math.ceil(RESULT_PAUSE_MS / TICK_MS));
}

describe('aimXPeriodMs / aimYPeriodMs: the sweep speeds up every kick', () => {
  it('the aim-side period shrinks 55 ms a shot (design: 520 - shot * 55)', () => {
    expect([0, 1, 2, 3, 4].map(aimXPeriodMs)).toEqual([520, 465, 410, 355, 300]);
  });

  it('the aim-height period shrinks 70 ms a shot (design: 640 - shot * 70)', () => {
    expect([0, 1, 2, 3, 4].map(aimYPeriodMs)).toEqual([640, 570, 500, 430, 360]);
  });
});

describe('createPenaltyKickEngine: a fresh round', () => {
  it('starts aiming the first shot with the intro Coach line', () => {
    const engine = createPenaltyKickEngine();

    expect(engine.view.stage).toBe('aim-x');
    expect(engine.view.shot).toBe(0);
    expect(engine.view.coachLine).toBe(INTRO_COACH_LINE);
    expect(engine.view.results).toEqual([null, null, null, null, null]);
    expect(engine.stats()).toEqual({ goals: 0, golazos: 0, saved: 0, wide: 0, over: 0 });
  });

  it('act() locks the aim side from the current sweep position and moves to aim-y', () => {
    const engine = createPenaltyKickEngine();
    ticks(engine, 16); // t = 256; aimXPeriodMs(0) = 520, so aimX = 256/520

    engine.act();

    expect(engine.view.stage).toBe('aim-y');
    expect(engine.view.aimX).toBeCloseTo(256 / 520, 10);
    expect(engine.view.coachLine).toBe('Now the height.');
  });
});

describe('every outcome (seeded keeper)', () => {
  it('WIDE: locking the aim side at the very start of the sweep (x = 0) always misses, whatever the height', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });

    engine.act(); // locks aimX = 0 (t = 0)
    engine.act(); // locks aimY = 0 (t = 0)

    expect(engine.view.outcome).toBe('wide');
    expect(engine.view.stage).toBe('kick');
  });

  it('OVER THE BAR: a dead-centre shot locked too high goes over, whatever the keeper does', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    ticks(engine, 16); // t = 256
    engine.act(); // locks aimX = 256/520 ≈ 0.492 (zone 1, centre)
    ticks(engine, 21); // t = 592
    engine.act(); // locks aimY = 592/640 ≈ 0.925 > 0.92

    expect(engine.view.outcome).toBe('over');
  });

  it('GOLAÇO: a top-corner shot (zone 0 or 2, height > .78) always scores, even when the keeper "guesses" that zone', () => {
    // random() always 0: the 45%-chance branch fires every time and the
    // keeper dives the shot's own zone -- the save condition `zone ===
    // keeperZone` would be true, but golazo is checked first in the
    // design's own branch order, so it still wins.
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    ticks(engine, 6); // t = 96
    engine.act(); // locks aimX = 96/520 ≈ 0.185 (zone 0, left third)
    ticks(engine, 28); // t = 544
    engine.act(); // locks aimY = 544/640 = 0.85 (> .78, <= .92)

    expect(engine.view.outcome).toBe('golazo');
  });

  it('SAVED: a centre shot the keeper correctly guesses is saved', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    ticks(engine, 16); // t = 256
    engine.act(); // locks aimX ≈ 0.492 (zone 1, centre)
    ticks(engine, 5); // t = 336
    engine.act(); // locks aimY = 336/640 = 0.525

    expect(engine.view.outcome).toBe('save');
  });

  it('GOOOL: a centre shot the keeper dives the wrong way for scores', () => {
    // First random() (the 45% check) returns .9 (misses), the second (the
    // uniform 0-2 pick) returns 0 -> keeper dives zone 0 while the shot is
    // zone 1 (centre): no save, no golazo (centre is excluded from it), no
    // wide/over -- the default outcome.
    const engine = createPenaltyKickEngine({ random: queuedRandom([0.9, 0]) });
    ticks(engine, 16); // t = 256
    engine.act(); // locks aimX ≈ 0.492 (zone 1, centre)
    ticks(engine, 5); // t = 336
    engine.act(); // locks aimY = 0.525 (>= .3, so the low-ball save roll never runs)

    expect(engine.view.outcome).toBe('goal');
    expect(engine.view.keeperZone).toBe(0);
  });
});

describe('the toast and Coach line', () => {
  it('shows the outcome toast/colour and Coach line only once the kick lands', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    engine.act();
    engine.act(); // wide, kick stage, kickProgress 0
    expect(engine.view.toast).toBeNull();

    ticks(engine, Math.ceil(KICK_DURATION_MS / TICK_MS));

    expect(engine.view.stage).toBe('result');
    expect(engine.view.toast).toBe('WIDE');
    expect(engine.view.coachLine).toBe('Aim inside the post next time.');
    expect(engine.view.results[0]).toBe('wide');
  });

  it("GOOOL's toast includes +30 and GOLAÇO's includes +50, baked into the string", () => {
    const goal = createPenaltyKickEngine({ random: queuedRandom([0.9, 0]) });
    ticks(goal, 16);
    goal.act();
    ticks(goal, 5);
    goal.act();
    ticks(goal, Math.ceil(KICK_DURATION_MS / TICK_MS));
    expect(goal.view.toast).toBe('GOOOL! +30');

    const golazo = createPenaltyKickEngine({ random: queuedRandom([0]) });
    ticks(golazo, 6);
    golazo.act();
    ticks(golazo, 28);
    golazo.act();
    ticks(golazo, Math.ceil(KICK_DURATION_MS / TICK_MS));
    expect(golazo.view.toast).toBe('GOLAÇO! +50');
  });
});

describe('act() and debugForceShot() are no-ops mid-flight', () => {
  it('act() does nothing while the ball is in flight or the result is showing', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    engine.act();
    engine.act(); // now 'kick'
    const before = { ...engine.view };

    engine.act();

    expect(engine.view.stage).toBe(before.stage);
    expect(engine.view.outcome).toBe(before.outcome);
  });

  it('debugForceShot() does nothing once a shot is already decided', () => {
    const engine = createPenaltyKickEngine({ random: queuedRandom([0]) });
    engine.debugForceShot('goal');
    expect(engine.view.stage).toBe('kick');
    expect(engine.view.outcome).toBe('goal');

    engine.debugForceShot('save'); // already 'kick': ignored

    expect(engine.view.outcome).toBe('goal');
  });
});

describe('a full round via debugForceShot', () => {
  const outcomes: PenaltyOutcome[] = ['goal', 'golazo', 'save', 'wide', 'over'];

  it('plays all 5 shots, tallying each outcome and finishing at `done`', () => {
    const engine = createPenaltyKickEngine();

    for (const [index, outcome] of outcomes.entries()) {
      expect(engine.view.shot).toBe(index);
      engine.debugForceShot(outcome);
      expect(engine.view.stage).toBe('kick');
      playOutKick(engine);
    }

    expect(engine.view.stage).toBe('done');
    expect(engine.view.results).toEqual(outcomes);
    expect(engine.stats()).toEqual({ goals: 1, golazos: 1, saved: 1, wide: 1, over: 1 });
  });

  it('ticking past `done` is a no-op', () => {
    const engine = createPenaltyKickEngine();
    for (const outcome of outcomes) {
      engine.debugForceShot(outcome);
      playOutKick(engine);
    }
    const before = { ...engine.view };

    engine.tick();

    expect(engine.view).toEqual(before);
  });
});

describe('scored / resultTitle / resultLine', () => {
  it('GOLEADOR at 4 or 5 scored (goals + golazos)', () => {
    expect(resultTitle({ goals: 4, golazos: 0, saved: 1, wide: 0, over: 0 })).toBe('GOLEADOR');
    expect(resultTitle({ goals: 2, golazos: 3, saved: 0, wide: 0, over: 0 })).toBe('GOLEADOR');
    expect(resultLine({ goals: 4, golazos: 0, saved: 1, wide: 0, over: 0 })).toBe(
      'Cinco estrelas. The keeper is still looking for the ball.',
    );
  });

  it('SOLID STRIKER at 2-3 scored', () => {
    expect(resultTitle({ goals: 2, golazos: 0, saved: 2, wide: 1, over: 0 })).toBe('SOLID STRIKER');
    expect(scored({ goals: 1, golazos: 1, saved: 3, wide: 0, over: 0 })).toBe(2);
    expect(resultLine({ goals: 2, golazos: 0, saved: 2, wide: 1, over: 0 })).toBe(
      'Decent. The corners are where the goals live.',
    );
  });

  it('NEEDS PRACTICE below 2 scored', () => {
    expect(resultTitle({ goals: 1, golazos: 0, saved: 3, wide: 1, over: 0 })).toBe(
      'NEEDS PRACTICE',
    );
    expect(resultTitle({ goals: 0, golazos: 0, saved: 2, wide: 2, over: 1 })).toBe(
      'NEEDS PRACTICE',
    );
    expect(resultLine({ goals: 0, golazos: 0, saved: 2, wide: 2, over: 1 })).toBe(
      'Back to the training pitch. Bring water.',
    );
  });
});

describe('SHOTS_PER_ROUND', () => {
  it('is 5 (five solo penalties)', () => {
    expect(SHOTS_PER_ROUND).toBe(5);
  });
});
