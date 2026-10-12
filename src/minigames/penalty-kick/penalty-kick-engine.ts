/**
 * The pure, DOM-free Penalty Kick engine: five solo penalties against a
 * keeper, ported rule for rule from `design/Minigame Penalty Kick.dc.html`'s
 * `class Component extends DCLogic` block. No timers and no hidden
 * randomness beyond the injectable `random` (default `Math.random`): the DOM
 * layer (`penalty-kick.ts`) calls `tick()` once per `TICK_MS`, exactly the
 * design's own `setInterval(this.tick, 16)`, so a test drives a whole round
 * deterministically by calling `tick()` itself, with a seeded `random`.
 *
 * Faithful quirk kept from the design: `t`, the ms clock the aim sweeps read,
 * is a single counter that starts at 0 and never resets mid-round (not even
 * between shots or during the kick/result pause) -- only `start()` in the
 * design zeroes it, once, for the whole round. Each shot's sweep is simply
 * faster (`aimXPeriodMs`/`aimYPeriodMs` shrink with `shot`); its phase is
 * whatever `t` has reached by the time the Player acts, exactly as the
 * design computes `vx`/`hy`.
 *
 * One Minigame round (one `record_round` call) is one round of five shots.
 */

/** The design's `setInterval(this.tick, 16)`. */
export const TICK_MS = 16;

/** How long the ball takes to reach the goal once a shot is taken (design: `bp` reaches 1 over 700 ms). */
export const KICK_DURATION_MS = 700;

/** How long a shot's result (toast + Coach line) holds before the next shot, or FULL TIME (design: `rt >= 1200`). */
export const RESULT_PAUSE_MS = 1200;

/** Shots in a round. */
export const SHOTS_PER_ROUND = 5;

/** The aim-side sweep's one-way period in ms, per shot index 0-4 (design: `520 - shot * 55`). */
export function aimXPeriodMs(shot: number): number {
  return 520 - shot * 55;
}

/** The aim-height sweep's one-way period in ms, per shot index 0-4 (design: `640 - shot * 70`). */
export function aimYPeriodMs(shot: number): number {
  return 640 - shot * 70;
}

/** A triangle wave, period 2, range [0, 1] (design's own `tri`). */
function tri(x: number): number {
  const m = ((x % 2) + 2) % 2;
  return 1 - Math.abs(m - 1);
}

export type PenaltyKickStage = 'aim-x' | 'aim-y' | 'kick' | 'result' | 'done';

export type PenaltyOutcome = 'goal' | 'golazo' | 'save' | 'wide' | 'over';

/** The keeper's dive, left/centre/right, matching the aim side's own thirds. */
export type KeeperZone = 0 | 1 | 2;

/** One round's stats, exactly `MinigameStatsMap['penalty-kick']`. */
export interface PenaltyKickStats {
  goals: number;
  golazos: number;
  saved: number;
  wide: number;
  over: number;
}

const OUTCOME_COPY: Record<PenaltyOutcome, { toast: string; toastBg: string; coachLine: string }> =
  {
    goal: { toast: 'GOOOL! +30', toastBg: '#00BDFF', coachLine: 'Clean finish.' },
    golazo: { toast: 'GOLAÇO! +50', toastBg: '#FFD23F', coachLine: 'Top bins. Frame that one.' },
    save: { toast: 'SAVED', toastBg: '#F4F4F4', coachLine: 'The keeper read it.' },
    wide: { toast: 'WIDE', toastBg: '#F4F4F4', coachLine: 'Aim inside the post next time.' },
    over: { toast: 'OVER THE BAR', toastBg: '#F4F4F4', coachLine: 'Too much power. Aim lower.' },
  };

/** The coach line shown the moment a round starts (design `start()`). */
export const INTRO_COACH_LINE = 'Breathe. Pick a corner.';
/** The coach line shown the instant the aim side locks (design `act()`'s aimX branch). */
const AFTER_AIM_X_COACH_LINE = 'Now the height.';

export interface PenaltyKickView {
  stage: PenaltyKickStage;
  /** 0-4: the shot in progress (or, once `stage === 'done'`, the last one taken). */
  shot: number;
  /** The aim-side sweep/lock, 0 (left post) to 1 (right post). */
  aimX: number;
  /** The aim-height sweep/lock, 0 (ground) to 1 (bar). */
  aimY: number;
  /** This shot's outcome, set once the aim-height locks (the kick is already decided, just animating). */
  outcome: PenaltyOutcome | null;
  /** The keeper's dive once decided, `-1` before then. */
  keeperZone: KeeperZone | -1;
  /** The kick's flight, 0-1 (design `bp`). */
  kickProgress: number;
  /** Each of the 5 shots' outcome so far, `null` for a shot not yet taken. */
  results: ReadonlyArray<PenaltyOutcome | null>;
  goals: number;
  golazos: number;
  saved: number;
  wide: number;
  over: number;
  toast: string | null;
  toastBg: string;
  coachLine: string;
}

export interface PenaltyKickEngine {
  readonly view: Readonly<PenaltyKickView>;
  /** Advances the round by one `TICK_MS` step. */
  tick(): void;
  /** SPACE or click: locks the aim side, then the aim height and shoots. A no-op once the round is done. */
  act(): void;
  /**
   * Test-only: skips the aim entirely and takes the current shot as
   * `outcome`, exactly as if the sweep and the keeper's read had landed
   * there -- for e2e specs, which drive real wall-clock time and have no
   * reason to fight the sweep's timing. A no-op once the round is done.
   */
  debugForceShot(outcome: PenaltyOutcome): void;
  stats(): PenaltyKickStats;
}

/** Representative aim values `debugForceShot` renders with; cosmetic only -- `outcome` alone drives every stat. */
const FORCE_SHOT_AIM: Record<PenaltyOutcome, { x: number; y: number; zone: KeeperZone }> = {
  goal: { x: 0.5, y: 0.5, zone: 0 },
  golazo: { x: 0.2, y: 0.85, zone: 2 },
  save: { x: 0.5, y: 0.5, zone: 1 },
  wide: { x: 0.02, y: 0.5, zone: 1 },
  over: { x: 0.5, y: 0.96, zone: 1 },
};

export interface PenaltyKickEngineOptions {
  /** The keeper's zone guess and the low-shot save roll (design: two
   *  `Math.random()` call sites in `act()`'s aim-height branch, in that
   *  order); defaults to `Math.random`. */
  random?: () => number;
}

export function createPenaltyKickEngine(options: PenaltyKickEngineOptions = {}): PenaltyKickEngine {
  const random = options.random ?? Math.random;

  const view: PenaltyKickView = {
    stage: 'aim-x',
    shot: 0,
    aimX: 0,
    aimY: 0,
    outcome: null,
    keeperZone: -1,
    kickProgress: 0,
    results: [null, null, null, null, null],
    goals: 0,
    golazos: 0,
    saved: 0,
    wide: 0,
    over: 0,
    toast: null,
    toastBg: '#00BDFF',
    coachLine: INTRO_COACH_LINE,
  };

  // The design's single continuous match clock (see this file's header
  // comment): never reset once the round starts.
  let t = 0;
  let lockX = 0.5;
  let lockY = 0.5;
  let resultTicksElapsed = 0;

  function syncAim(): void {
    if (view.stage === 'aim-x') {
      view.aimX = tri(t / aimXPeriodMs(view.shot));
      view.aimY = lockY;
    } else if (view.stage === 'aim-y') {
      view.aimX = lockX;
      view.aimY = tri(t / aimYPeriodMs(view.shot));
    } else {
      view.aimX = lockX;
      view.aimY = lockY;
    }
  }

  /** Resolves the current shot's stats/toast/coach line from `view.outcome` (design's own `T` table + counters). */
  function applyOutcome(outcome: PenaltyOutcome): void {
    const copy = OUTCOME_COPY[outcome];
    const results = [...view.results];
    results[view.shot] = outcome;
    view.results = results;
    if (outcome === 'goal') view.goals += 1;
    else if (outcome === 'golazo') view.golazos += 1;
    else if (outcome === 'save') view.saved += 1;
    else if (outcome === 'wide') view.wide += 1;
    else view.over += 1;
    view.toast = copy.toast;
    view.toastBg = copy.toastBg;
    view.coachLine = copy.coachLine;
  }

  /** Decides this shot's outcome from the locked aim (design `act()`'s aim-height branch, verbatim). */
  function resolveShot(): { outcome: PenaltyOutcome; keeperZone: KeeperZone } {
    const zone: KeeperZone = lockX < 0.34 ? 0 : lockX > 0.66 ? 2 : 1;
    const keeperZone: KeeperZone =
      random() < 0.45 ? zone : (Math.floor(random() * 3) as KeeperZone);

    let outcome: PenaltyOutcome = 'goal';
    if (lockX < 0.06 || lockX > 0.94) outcome = 'wide';
    else if (lockY > 0.92) outcome = 'over';
    else if (lockY > 0.78 && zone !== 1) outcome = 'golazo';
    else if (zone === keeperZone || (lockY < 0.3 && random() < 0.5)) outcome = 'save';

    return { outcome, keeperZone };
  }

  function startNextShotOrFinish(): void {
    if (view.shot >= SHOTS_PER_ROUND - 1) {
      view.stage = 'done';
      view.toast = null;
      return;
    }
    view.shot += 1;
    view.stage = 'aim-x';
    view.outcome = null;
    view.keeperZone = -1;
    view.kickProgress = 0;
    view.toast = null;
    syncAim();
  }

  return {
    view,

    tick() {
      if (view.stage === 'done') return;
      t += TICK_MS;

      if (view.stage === 'kick') {
        view.kickProgress = Math.min(1, view.kickProgress + TICK_MS / KICK_DURATION_MS);
        if (view.kickProgress >= 1 && view.outcome) {
          applyOutcome(view.outcome);
          view.stage = 'result';
          resultTicksElapsed = 0;
        }
        return;
      }

      if (view.stage === 'result') {
        resultTicksElapsed += TICK_MS;
        if (resultTicksElapsed >= RESULT_PAUSE_MS) startNextShotOrFinish();
        return;
      }

      syncAim();
    },

    act() {
      if (view.stage === 'aim-x') {
        lockX = tri(t / aimXPeriodMs(view.shot));
        view.coachLine = AFTER_AIM_X_COACH_LINE;
        view.stage = 'aim-y';
        syncAim();
        return;
      }
      if (view.stage === 'aim-y') {
        lockY = tri(t / aimYPeriodMs(view.shot));
        const { outcome, keeperZone } = resolveShot();
        view.outcome = outcome;
        view.keeperZone = keeperZone;
        view.kickProgress = 0;
        view.toast = null;
        view.stage = 'kick';
        syncAim();
      }
      // 'kick' / 'result' / 'done': the design ignores SPACE/click mid-flight too.
    },

    debugForceShot(outcome) {
      if (view.stage !== 'aim-x' && view.stage !== 'aim-y') return;
      const rep = FORCE_SHOT_AIM[outcome];
      lockX = rep.x;
      lockY = rep.y;
      view.outcome = outcome;
      view.keeperZone = rep.zone;
      view.kickProgress = 0;
      view.toast = null;
      view.stage = 'kick';
      syncAim();
    },

    stats() {
      return {
        goals: view.goals,
        golazos: view.golazos,
        saved: view.saved,
        wide: view.wide,
        over: view.over,
      };
    },
  };
}

/** `goals + golazos`: the round's score, personal best, and the Goleador threshold. */
export function scored(stats: PenaltyKickStats): number {
  return stats.goals + stats.golazos;
}

/** The done screen's title (design `renderVals`). */
export function resultTitle(
  stats: PenaltyKickStats,
): 'GOLEADOR' | 'SOLID STRIKER' | 'NEEDS PRACTICE' {
  const total = scored(stats);
  if (total >= 4) return 'GOLEADOR';
  if (total >= 2) return 'SOLID STRIKER';
  return 'NEEDS PRACTICE';
}

/**
 * The done screen's closing line (design `renderVals`'s `resultLine`,
 * verbatim, minus its own "Coach: " prefix): the design draws a generic
 * COACH, but the owner's host is Chrystian Rissoli, a real LATAM JGer
 * (ticket #220), so the DOM layer (`penalty-kick.ts`) prepends his name
 * instead of this engine hard-coding "Coach" for a person it has no idea
 * is hosting.
 */
export function resultLine(stats: PenaltyKickStats): string {
  const total = scored(stats);
  if (total >= 4) return 'Cinco estrelas. The keeper is still looking for the ball.';
  if (total >= 2) return 'Decent. The corners are where the goals live.';
  return 'Back to the training pitch. Bring water.';
}
