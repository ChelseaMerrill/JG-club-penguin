/**
 * The pure, DOM-free Beystadium engine: a best-of-3 Beyblade match against
 * Michael, ported rule for rule from `design/Minigame Beystadium.dc.html`'s
 * `class Component extends DCLogic` block. No timers and no randomness: the
 * DOM layer (`beystadium.ts`) calls `tick()` once per `TICK_MS`, exactly the
 * design's own `setInterval(this.tick, 50)`, so a test drives a whole match
 * deterministically by calling `tick()` itself.
 *
 * One Minigame round (one `record_round` call) is one match; the design's
 * "ROUND x / 3" are the match's battle rounds, counted here as `round`.
 *
 * Two deliberate, behaviour-preserving changes from the design's code:
 * - Time is counted in whole ticks, not by adding 0.05 to a float, so the
 *   design's float drift can't move a boundary: Michael strikes every 52nd
 *   fight tick (2.6 s), the ring cycles every 44 ticks (2.2 s), and its
 *   strike zone, ring in (1.5, 2.0) exclusive, is ring ticks 31-39.
 * - Everything the design times with `setTimeout` (the 900 ms round banner,
 *   the 450 ms clash text, the 1.6 s pause after a battle round) is counted
 *   in ticks too, so pausing the match (the DOM layer stops ticking) freezes
 *   those as well.
 */

/** The design's `setInterval(this.tick, 50)`. */
export const TICK_MS = 50;
const TICK_SEC = TICK_MS / 1000;

/** The launch meter moves this much per tick (design: `s.dir * 3.4`). */
export const METER_STEP = 3.4;
/** The cyan zone on the launch meter, inclusive (design: `meter >= 66 && meter <= 86`). */
export const PERFECT_ZONE_MIN = 66;
export const PERFECT_ZONE_MAX = 86;

/** Michael's Bey always launches at this spin (design: `mkSpin: 96`). */
export const MICHAEL_START_SPIN = 96;

/** Michael strikes every 2.6 s (design: `Math.floor(t / 2.6)` changing). */
const MICHAEL_STRIKE_EVERY_TICKS = 52;
/** The strike ring's cycle, 2.2 s (design: `(s.ring + 0.05) % 2.2`). */
export const RING_PERIOD_TICKS = 44;
/** The ring's cyan strike zone, ring in (1.5 s, 2.0 s) exclusive. */
export const RING_ZONE_FIRST_TICK = 31;
export const RING_ZONE_LAST_TICK = 39;
/** A dodge lasts 1.2 s (design: `dodge: 1.2`). */
const DODGE_TICKS = 24;
const CLASH_TICKS = 9; // 450 ms
const ROUND_BANNER_TICKS = 18; // 900 ms
const ROUND_END_TICKS = 32; // 1600 ms
/** First to this many battle rounds wins the match (best of 3). */
export const ROUNDS_TO_WIN = 2;

export interface Bey {
  name: string;
  /** Main colour (the Bey's outer ring and blade). */
  c1: string;
  /** Inner disc colour. */
  c2: string;
  atk: number;
  sta: number;
  blurb: string;
}

/** The three Beys, verbatim from the design's `BEYS`. */
export const BEYS: readonly Bey[] = [
  {
    name: 'GLACIER',
    c1: '#00BDFF',
    c2: '#161719',
    atk: 6,
    sta: 6,
    blurb: 'Balanced. Good first Bey.',
  },
  {
    name: 'AVALANCHE',
    c1: '#F4F4F4',
    c2: '#0C4B5F',
    atk: 9,
    sta: 4,
    blurb: 'Hits like a truck. Tires like one too.',
  },
  {
    name: 'PERMAFROST',
    c1: '#0C4B5F',
    c2: '#F4F4F4',
    atk: 3,
    sta: 9,
    blurb: 'Outlast everything. Boring. Effective.',
  },
];

export type BeyIndex = 0 | 1 | 2;

/** Michael's Bey (design: `MK={atk:8,sta:7}`, named on the pick screen). */
export const MICHAEL_BEY = { name: 'BLIZZARD FANG', atk: 8, sta: 7 } as const;

/** Michael's line as each battle round's launch starts (design `startLaunch`). */
const LAUNCH_LINES = ['Let it rip.', 'Faster this time.', 'Final round. Sweaty palms yet?'];
/** Michael's reaction to the Player's 1st, 2nd, 3rd... strike (design `action()`). */
const STRIKE_LINES = ['Hey!', 'Stop that.', 'Fine. FINE.'];

/**
 * A launch at `meter`: perfect (100 spin) inside the cyan zone, else 78 spin
 * above 40 and 60 spin at 40 or below (design `action()`'s launch branch).
 */
export function launchSpin(meter: number): { perfect: boolean; spin: number } {
  const perfect = meter >= PERFECT_ZONE_MIN && meter <= PERFECT_ZONE_MAX;
  if (perfect) return { perfect, spin: 100 };
  return { perfect, spin: meter > 40 ? 78 : 60 };
}

/** Spin a top loses every tick of the fight (design: `0.42 - sta * 0.025`). */
function spinDrainPerTick(sta: number): number {
  return 0.42 - sta * 0.025;
}

export type BeystadiumPhase = 'pick' | 'launch' | 'fight' | 'round-end' | 'match-over';

/** What SPACE did (design `action()`). */
export type ActionOutcome = 'perfect-launch' | 'launch' | 'strike' | 'whiff' | 'none';

/** One match's stats, exactly `MinigameStatsMap['beystadium']`. */
export interface BeystadiumStats {
  /** 1 when the Player won the match (took 2 battle rounds), else 0. */
  won: number;
  roundsWon: number;
  roundsLost: number;
  /** Strikes landed in the ring's cyan zone (the match's score). */
  strikes: number;
  perfectLaunches: number;
  /** The picked Bey's index into `BEYS` (0-2). */
  bey: number;
}

export interface BeystadiumView {
  phase: BeystadiumPhase;
  bey: BeyIndex;
  /** The current battle round, 1-3. */
  round: number;
  roundsWon: number;
  roundsLost: number;
  /** The launch meter, 0-100. */
  meter: number;
  mySpin: number;
  mkSpin: number;
  /** Seconds into the current battle round's fight (design `t`). */
  timeSec: number;
  /** The strike ring's position in its 2.2 s cycle, in seconds (design `ring`). */
  ring: number;
  inStrikeZone: boolean;
  dodging: boolean;
  clash: string | null;
  banner: string | null;
  /** Michael's current line. */
  mike: string;
  hint: string;
}

export interface BeystadiumEngine {
  readonly view: Readonly<BeystadiumView>;
  /** Picks a Bey on the pick screen; ignored once the match has started. */
  pick(bey: BeyIndex): void;
  /** TO THE STADIUM: starts battle round 1's launch. */
  toStadium(): void;
  /** Advances the match by one `TICK_MS` step. */
  tick(): void;
  /** SPACE: rips the launcher, or strikes during the fight. */
  action(): ActionOutcome;
  /** X: arms a 1.2 s dodge for 1 spin; `false` (and free) outside the fight
   *  or while a dodge is already armed. */
  dodge(): boolean;
  stats(): BeystadiumStats;
}

export function createBeystadiumEngine(): BeystadiumEngine {
  const view: BeystadiumView = {
    phase: 'pick',
    bey: 0,
    round: 1,
    roundsWon: 0,
    roundsLost: 0,
    meter: 0,
    mySpin: 100,
    mkSpin: 100,
    timeSec: 0,
    ring: 0,
    inStrikeZone: false,
    dodging: false,
    clash: null,
    banner: null,
    mike: 'Let it rip.',
    hint: 'Watch the ring. Strike on cyan.',
  };
  let dir = 1;
  let fightTicks = 0;
  let ringTicks = 0;
  // Like the design's `dodge`, only counts down during the fight, so a dodge
  // still armed when a battle round ends carries into the next one.
  let dodgeTicks = 0;
  let clashTicks = 0;
  /** `null`: the banner stays until replaced (the design's round-result banner). */
  let bannerTicks: number | null = null;
  let endTicks = 0;
  let strikes = 0;
  let perfectLaunches = 0;

  function sync(): void {
    view.timeSec = fightTicks * TICK_SEC;
    view.ring = ringTicks * TICK_SEC;
    view.inStrikeZone =
      view.phase === 'fight' &&
      ringTicks >= RING_ZONE_FIRST_TICK &&
      ringTicks <= RING_ZONE_LAST_TICK;
    view.dodging = dodgeTicks > 0;
  }

  function showClash(text: string): void {
    view.clash = text;
    clashTicks = CLASH_TICKS;
  }

  function startLaunch(): void {
    view.phase = 'launch';
    view.meter = 0;
    dir = 1;
    view.mySpin = 0;
    view.mkSpin = 0;
    view.clash = null;
    clashTicks = 0;
    view.banner = `ROUND ${view.round}`;
    bannerTicks = ROUND_BANNER_TICKS;
    fightTicks = 0;
    ringTicks = 0;
    view.mike = LAUNCH_LINES[view.round - 1] ?? LAUNCH_LINES[0];
  }

  function countDownTimers(): void {
    if (clashTicks > 0) {
      clashTicks -= 1;
      if (clashTicks === 0) view.clash = null;
    }
    if (bannerTicks !== null && bannerTicks > 0) {
      bannerTicks -= 1;
      if (bannerTicks === 0) view.banner = null;
    }
  }

  function tickLaunch(): void {
    let meter = view.meter + dir * METER_STEP;
    if (meter >= 100) {
      meter = 100;
      dir = -1;
    }
    if (meter <= 0) {
      meter = 0;
      dir = 1;
    }
    view.meter = meter;
  }

  function tickFight(): void {
    fightTicks += 1;
    ringTicks = (ringTicks + 1) % RING_PERIOD_TICKS;
    let my = view.mySpin - spinDrainPerTick(BEYS[view.bey].sta);
    let mk = view.mkSpin - spinDrainPerTick(MICHAEL_BEY.sta);

    if (fightTicks % MICHAEL_STRIKE_EVERY_TICKS === 0) {
      const dodged = dodgeTicks > 0;
      my -= dodged ? 2 : 6 + MICHAEL_BEY.atk * 0.8;
      mk -= 2;
      showClash(dodged ? 'DODGED' : 'MICHAEL HITS');
      view.mike = dodged ? 'Slippery.' : 'That one hurt.';
    }
    dodgeTicks = Math.max(0, dodgeTicks - 1);

    if (my <= 0 || mk <= 0) {
      // A tie at 0 goes to Michael (design: `won = mk <= 0 && my > 0`).
      const won = mk <= 0 && my > 0;
      if (won) view.roundsWon += 1;
      else view.roundsLost += 1;
      view.phase = 'round-end';
      view.mySpin = Math.max(0, my);
      view.mkSpin = Math.max(0, mk);
      view.banner = won ? 'YOU WIN THE ROUND' : 'MICHAEL TAKES IT';
      bannerTicks = null;
      view.mike = won ? '...lucky.' : '3-0 energy.';
      view.clash = null;
      clashTicks = 0;
      endTicks = ROUND_END_TICKS;
      return;
    }
    view.mySpin = my;
    view.mkSpin = mk;
  }

  function tickRoundEnd(): void {
    endTicks -= 1;
    if (endTicks > 0) return;
    if (view.roundsWon >= ROUNDS_TO_WIN || view.roundsLost >= ROUNDS_TO_WIN) {
      view.phase = 'match-over';
      return;
    }
    view.round += 1;
    startLaunch();
  }

  function tick(): void {
    countDownTimers();
    if (view.phase === 'launch') tickLaunch();
    else if (view.phase === 'fight') tickFight();
    else if (view.phase === 'round-end') tickRoundEnd();
    sync();
  }

  function action(): ActionOutcome {
    if (view.phase === 'launch') {
      const { perfect, spin } = launchSpin(view.meter);
      view.phase = 'fight';
      view.mySpin = spin;
      view.mkSpin = MICHAEL_START_SPIN;
      fightTicks = 0;
      ringTicks = 0;
      if (perfect) perfectLaunches += 1;
      showClash(perfect ? 'PERFECT LAUNCH' : 'LAUNCHED');
      view.mike = perfect ? 'Okay. Not bad.' : 'Weak rip.';
      view.hint = 'Strike when the ring turns cyan.';
      sync();
      return perfect ? 'perfect-launch' : 'launch';
    }
    if (view.phase === 'fight') {
      if (view.inStrikeZone) {
        view.mkSpin -= 8 + BEYS[view.bey].atk * 1.3;
        view.mySpin -= 2;
        view.mike = STRIKE_LINES[strikes % STRIKE_LINES.length];
        strikes += 1;
        showClash('STRIKE!');
        return 'strike';
      }
      view.mySpin -= 4;
      showClash('WHIFF');
      view.mike = 'You missed. Loudly.';
      return 'whiff';
    }
    return 'none';
  }

  function dodge(): boolean {
    if (view.phase !== 'fight' || dodgeTicks > 0) return false;
    dodgeTicks = DODGE_TICKS;
    view.mySpin -= 1;
    showClash('DODGE READY');
    sync();
    return true;
  }

  return {
    view,
    pick(bey) {
      if (view.phase === 'pick') view.bey = bey;
    },
    toStadium() {
      if (view.phase !== 'pick') return;
      startLaunch();
      sync();
    },
    tick,
    action,
    dodge,
    stats() {
      return {
        won: view.roundsWon >= ROUNDS_TO_WIN ? 1 : 0,
        roundsWon: view.roundsWon,
        roundsLost: view.roundsLost,
        strikes,
        perfectLaunches,
        bey: view.bey,
      };
    },
  };
}
