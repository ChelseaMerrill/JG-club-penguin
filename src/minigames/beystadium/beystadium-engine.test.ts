import { describe, expect, it } from 'vitest';
import {
  createBeystadiumEngine,
  launchSpin,
  type BeyIndex,
  type BeystadiumEngine,
  type BeystadiumPhase,
} from './beystadium-engine';

function ticks(engine: BeystadiumEngine, count: number): void {
  for (let i = 0; i < count; i++) engine.tick();
}

describe('launchSpin: the launch meter zones (design `action()`)', () => {
  it('is a perfect launch (spin 100) anywhere in the cyan zone [66, 86]', () => {
    expect(launchSpin(66)).toEqual({ perfect: true, spin: 100 });
    expect(launchSpin(76)).toEqual({ perfect: true, spin: 100 });
    expect(launchSpin(86)).toEqual({ perfect: true, spin: 100 });
  });

  it('starts at 78 spin just outside the zone, and anywhere above 40', () => {
    expect(launchSpin(65.9)).toEqual({ perfect: false, spin: 78 });
    expect(launchSpin(86.1)).toEqual({ perfect: false, spin: 78 });
    expect(launchSpin(100)).toEqual({ perfect: false, spin: 78 });
    expect(launchSpin(40.1)).toEqual({ perfect: false, spin: 78 });
  });

  it('starts at only 60 spin at a meter of 40 or less', () => {
    expect(launchSpin(40)).toEqual({ perfect: false, spin: 60 });
    expect(launchSpin(0)).toEqual({ perfect: false, spin: 60 });
  });
});

describe('the launch meter', () => {
  it('sweeps up 3.4 per 50 ms tick, bounces off 100 and comes back down', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    expect(engine.view.phase).toBe('launch');
    expect(engine.view.meter).toBe(0);

    ticks(engine, 1);
    expect(engine.view.meter).toBeCloseTo(3.4);
    ticks(engine, 28);
    expect(engine.view.meter).toBeCloseTo(98.6);
    ticks(engine, 1); // 102 clamps to 100 and turns around
    expect(engine.view.meter).toBe(100);
    ticks(engine, 1);
    expect(engine.view.meter).toBeCloseTo(96.6);
    ticks(engine, 29); // 96.6 - 29 * 3.4 = -2 clamps to 0 and turns around
    expect(engine.view.meter).toBe(0);
    ticks(engine, 1);
    expect(engine.view.meter).toBeCloseTo(3.4);
  });

  it('SPACE after 20 ticks (meter 68) is a perfect launch: 100 spin against Michael 96', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    ticks(engine, 20);

    expect(engine.action()).toBe('perfect-launch');
    expect(engine.view.phase).toBe('fight');
    expect(engine.view.mySpin).toBe(100);
    expect(engine.view.mkSpin).toBe(96);
    expect(engine.view.clash).toBe('PERFECT LAUNCH');
    expect(engine.view.mike).toBe('Okay. Not bad.');
    expect(engine.stats().perfectLaunches).toBe(1);
  });

  it('SPACE after 19 ticks (meter 64.6) is a plain launch at 78 spin', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    ticks(engine, 19);

    expect(engine.action()).toBe('launch');
    expect(engine.view.mySpin).toBe(78);
    expect(engine.view.clash).toBe('LAUNCHED');
    expect(engine.view.mike).toBe('Weak rip.');
    expect(engine.stats().perfectLaunches).toBe(0);
  });

  it('SPACE after 11 ticks (meter 37.4) is a weak launch at 60 spin', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    ticks(engine, 11);

    engine.action();
    expect(engine.view.mySpin).toBe(60);
  });
});

/** A fresh engine with `bey` picked, launched perfectly (100 vs Michael's 96). */
function fightingWith(bey: BeyIndex): BeystadiumEngine {
  const engine = createBeystadiumEngine();
  engine.pick(bey);
  engine.toStadium();
  ticks(engine, 20);
  engine.action();
  return engine;
}

describe('spin drain during the fight', () => {
  // Per tick: 0.42 - sta * 0.025. Michael (sta 7) drains 0.245.
  it.each([
    [0 as BeyIndex, 'GLACIER', 97.3],
    [1 as BeyIndex, 'AVALANCHE', 96.8],
    [2 as BeyIndex, 'PERMAFROST', 98.05],
  ])('Bey %i (%s) is at %d spin after 10 ticks, Michael at 93.55', (bey, _name, expected) => {
    const engine = fightingWith(bey);
    ticks(engine, 10);

    expect(engine.view.mySpin).toBeCloseTo(expected);
    expect(engine.view.mkSpin).toBeCloseTo(93.55);
  });
});

describe("Michael's strikes", () => {
  it('lands every 2.6 s (52 ticks) for 12.4 damage, costing him 2 spin', () => {
    const engine = fightingWith(0);
    ticks(engine, 51);
    expect(engine.view.mySpin).toBeCloseTo(86.23);

    ticks(engine, 1);
    expect(engine.view.mySpin).toBeCloseTo(73.56);
    expect(engine.view.mkSpin).toBeCloseTo(81.26);
    expect(engine.view.clash).toBe('MICHAEL HITS');
    expect(engine.view.mike).toBe('That one hurt.');
  });

  it('does only 2 damage while a dodge (X, 1 spin) is still active', () => {
    const engine = fightingWith(0);
    ticks(engine, 40);
    expect(engine.dodge()).toBe(true);
    expect(engine.view.clash).toBe('DODGE READY');
    expect(engine.view.dodging).toBe(true);
    // A second X while already dodging is ignored and costs nothing.
    expect(engine.dodge()).toBe(false);

    ticks(engine, 12);
    expect(engine.view.mySpin).toBeCloseTo(82.96);
    expect(engine.view.mkSpin).toBeCloseTo(81.26);
    expect(engine.view.clash).toBe('DODGED');
    expect(engine.view.mike).toBe('Slippery.');
  });

  it('hits in full once the 1.2 s (24 tick) dodge has run out', () => {
    const engine = fightingWith(0);
    ticks(engine, 20);
    engine.dodge();

    ticks(engine, 32);
    expect(engine.view.clash).toBe('MICHAEL HITS');
    expect(engine.view.mySpin).toBeCloseTo(72.56);
  });

  it('ignores X before the fight starts', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    expect(engine.dodge()).toBe(false);
  });
});

describe('strikes in the ring zone', () => {
  it('whiffs (4 spin) just before the zone opens, at ring 1.5 s', () => {
    const engine = fightingWith(0);
    ticks(engine, 30);

    expect(engine.view.inStrikeZone).toBe(false);
    expect(engine.action()).toBe('whiff');
    expect(engine.view.mySpin).toBeCloseTo(87.9);
    expect(engine.view.clash).toBe('WHIFF');
    expect(engine.view.mike).toBe('You missed. Loudly.');
    expect(engine.stats().strikes).toBe(0);
  });

  // 8 + atk * 1.3 damage to Michael (15.8 / 19.7 / 11.9); the strike costs
  // the Player 2 spin.
  it.each([
    [0 as BeyIndex, 72.605],
    [1 as BeyIndex, 68.705],
    [2 as BeyIndex, 76.505],
  ])('Bey %i strikes Michael down to %d at ring 1.55 s', (bey, expectedMichael) => {
    const engine = fightingWith(bey);
    ticks(engine, 31);
    const before = engine.view.mySpin;

    expect(engine.view.inStrikeZone).toBe(true);
    expect(engine.action()).toBe('strike');
    expect(engine.view.mkSpin).toBeCloseTo(expectedMichael);
    expect(engine.view.mySpin).toBeCloseTo(before - 2);
    expect(engine.view.clash).toBe('STRIKE!');
    expect(engine.stats().strikes).toBe(1);
  });

  it("cycles Michael's reaction lines strike by strike", () => {
    const engine = fightingWith(2);
    ticks(engine, 31);
    const lines: string[] = [];
    for (let i = 0; i < 4; i++) {
      engine.action();
      lines.push(engine.view.mike);
    }
    expect(lines).toEqual(['Hey!', 'Stop that.', 'Fine. FINE.', 'Hey!']);
  });

  it('closes the zone at ring 2.0 s and reopens it every 2.2 s', () => {
    const engine = fightingWith(2);
    ticks(engine, 39);
    expect(engine.view.inStrikeZone).toBe(true);
    ticks(engine, 1);
    expect(engine.view.inStrikeZone).toBe(false);
    expect(engine.action()).toBe('whiff');
    ticks(engine, 35); // tick 75 = 44 + 31
    expect(engine.view.inStrikeZone).toBe(true);
    expect(engine.action()).toBe('strike');
  });
});

describe('battle rounds and the match (best of 3)', () => {
  it('Michael takes a round the Player never fights back in, at 0 spin', () => {
    const engine = fightingWith(0);
    ticks(engine, 207);
    expect(engine.view.phase).toBe('fight');

    ticks(engine, 1);
    expect(engine.view.phase).toBe('round-end');
    expect(engine.view.mySpin).toBe(0);
    expect(engine.view.roundsLost).toBe(1);
    expect(engine.view.roundsWon).toBe(0);
    expect(engine.view.banner).toBe('MICHAEL TAKES IT');
    expect(engine.view.mike).toBe('3-0 energy.');
  });

  it('takes 1.6 s after a round before round 2 launches', () => {
    const engine = fightingWith(0);
    ticks(engine, 208);
    ticks(engine, 31);
    expect(engine.view.phase).toBe('round-end');

    ticks(engine, 1);
    expect(engine.view.phase).toBe('launch');
    expect(engine.view.round).toBe(2);
    expect(engine.view.banner).toBe('ROUND 2');
    expect(engine.view.mike).toBe('Faster this time.');
  });

  it('the Player takes a round by striking Michael to 0', () => {
    const engine = fightingWith(0);
    ticks(engine, 31);
    for (let i = 0; i < 6; i++) engine.action();

    ticks(engine, 1);
    expect(engine.view.phase).toBe('round-end');
    expect(engine.view.roundsWon).toBe(1);
    expect(engine.view.banner).toBe('YOU WIN THE ROUND');
    expect(engine.view.mike).toBe('...lucky.');
  });

  it('a 2-1 match win ends in match-over with the contract stats', () => {
    const engine = fightingWith(0);
    // Round 1: win with 6 strikes.
    ticks(engine, 31);
    for (let i = 0; i < 6; i++) engine.action();
    ticks(engine, 1 + 32);
    // Round 2: a weak launch, then lose without fighting back.
    ticks(engine, 11);
    engine.action();
    while (engine.view.phase === 'fight') engine.tick();
    expect(engine.view.roundsLost).toBe(1);
    ticks(engine, 32);
    // Round 3: a perfect launch and 6 strikes.
    expect(engine.view.mike).toBe('Final round. Sweaty palms yet?');
    ticks(engine, 20);
    engine.action();
    ticks(engine, 31);
    for (let i = 0; i < 6; i++) engine.action();
    ticks(engine, 1);
    expect(engine.view.phase).toBe('round-end');
    ticks(engine, 31);
    expect(engine.view.phase).toBe('round-end');
    ticks(engine, 1);

    expect(engine.view.phase).toBe('match-over');
    expect(engine.stats()).toEqual({
      won: 1,
      roundsWon: 2,
      roundsLost: 1,
      strikes: 12,
      perfectLaunches: 2,
      bey: 0,
    });
  });

  it('a 0-2 match loss reports won 0', () => {
    const engine = fightingWith(1);
    const phase = (): BeystadiumPhase => engine.view.phase;
    while (phase() !== 'launch' || engine.view.round !== 2) engine.tick();
    ticks(engine, 20);
    engine.action();
    while (phase() !== 'match-over') engine.tick();

    expect(engine.stats()).toEqual({
      won: 0,
      roundsWon: 0,
      roundsLost: 2,
      strikes: 0,
      perfectLaunches: 2,
      bey: 1,
    });
  });

  it('ignores SPACE and X between battle rounds and after the match', () => {
    const engine = fightingWith(0);
    ticks(engine, 208);
    expect(engine.action()).toBe('none');
    expect(engine.dodge()).toBe(false);
  });
});

describe('timers counted in ticks', () => {
  it('shows the ROUND banner for 900 ms and a clash for 450 ms', () => {
    const engine = createBeystadiumEngine();
    engine.toStadium();
    expect(engine.view.banner).toBe('ROUND 1');
    ticks(engine, 17);
    expect(engine.view.banner).toBe('ROUND 1');
    ticks(engine, 1);
    expect(engine.view.banner).toBeNull();

    ticks(engine, 2); // meter 68
    engine.action();
    ticks(engine, 8);
    expect(engine.view.clash).toBe('PERFECT LAUNCH');
    ticks(engine, 1);
    expect(engine.view.clash).toBeNull();
  });

  it('reports the fight clock in seconds', () => {
    const engine = fightingWith(0);
    ticks(engine, 30);
    expect(engine.view.timeSec).toBeCloseTo(1.5);
  });
});
