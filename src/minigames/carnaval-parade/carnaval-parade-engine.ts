/**
 * The pure, DOM-free Carnaval Parade engine: a solo, 45 s, three-lane parade
 * runner, ported rule for rule from `design/Minigame Carnaval Parade.dc.html`'s
 * `class Component extends DCLogic` block. No timers: the DOM layer
 * (`carnaval-parade.ts`) calls `tick()` once per `TICK_MS`, exactly the
 * design's own `setInterval(this.tick, 16)`, so a test drives a whole round
 * deterministically by calling `tick()` itself. An injectable `rng` stands in
 * for the design's `Math.random()` (the ticket's "seeded spawner"), the same
 * shape as `bug-squash-engine.ts`'s own `rng` option.
 *
 * `rng()` is called in exactly the design's own `Math.random()` order, once a
 * spawn roll fires: (1) the next spawn's interval jitter, (2) the spawned
 * item's lane, (3) its kind, (4) only when (3) rolled a barrier: whether a
 * second barrier also spawns, (5) only when (4) is true: that second
 * barrier's lane. The design also spends one more `Math.random()` per item on
 * `id`, used only to pick a feather's cosmetic color in its `renderVals` --
 * that's a rendering concern, not game logic, so it isn't reproduced here;
 * the DOM layer assigns its own cosmetic color without touching the engine's
 * `rng` sequence.
 */

/** The design's own `setInterval(this.tick, 16)`. */
export const TICK_MS = 16;
/** The design's `DUR`. */
export const DURATION_MS = 45_000;
/** The design's `LY`: the three lanes' y positions (cosmetic; carried on
 *  `CarnavalParadeView.playerY` for the DOM layer). */
export const LANE_Y: readonly [number, number, number] = [590, 700, 810];
export const LIVES_START = 3;
/** The multiplier curve's ceiling (design: `Math.min(4, ...)`). */
export const MAX_MULTIPLIER = 4;
/** Every this many in a row raises the multiplier by one (design: `streak/5`). */
const STREAK_PER_MULTIPLIER = 5;
/** The collision window the design checks items against (`i.x<345&&i.x>255`),
 *  exclusive at both ends, centered on the Penguin's fixed x (design: 300). */
const COLLISION_MIN_X = 255;
const COLLISION_MAX_X = 345;
/** An item this far past the Penguin is gone (design: `i.x<-60`). */
const OFFSCREEN_X = -60;
/** Where a freshly spawned item appears (design: `x:1700`). */
const SPAWN_X = 1700;
/** The gap between the three feathers in a burst (design: `x:1700+n*95`). */
const FEATHER_BURST_GAP_X = 95;
/** How much of the way to the target lane the player eases per tick
 *  (design: `py+(LY[lane]-py)*0.25`). */
const PLAYER_EASE = 0.25;
/** How long a pickup/hit toast stays up (design: `this.tt=t+700`). */
const TOAST_MS = 700;

export type ItemKind = 'feather' | 'star' | 'barrier';
export type Lane = 0 | 1 | 2;

export interface CarnavalParadeItem {
  readonly id: number;
  readonly x: number;
  readonly lane: Lane;
  readonly kind: ItemKind;
}

export interface CarnavalParadeToast {
  readonly text: string;
  readonly kind: 'pickup' | 'hit';
}

/** Exactly `MinigameStatsMap['carnaval-parade']`. */
export interface CarnavalParadeStats {
  feathers: number;
  stars: number;
  barriersHit: number;
  bestStreak: number;
}

export type CarnavalParadeEndReason = 'time' | 'lives';

export interface CarnavalParadeView {
  phase: 'play' | 'done';
  score: number;
  lives: number;
  streak: number;
  bestStreak: number;
  /** The live multiplier the next pickup would score at (design: `mult`). */
  multiplier: number;
  lane: Lane;
  /** The Penguin's eased y position, for the DOM layer (design: `py`). */
  playerY: number;
  elapsedMs: number;
  items: readonly CarnavalParadeItem[];
  toast: CarnavalParadeToast | null;
  /** `null` while playing; set once `phase` becomes `'done'`. */
  ended: CarnavalParadeEndReason | null;
}

export interface CarnavalParadeEngineOptions {
  /** Returns a float in `[0, 1)`, called in the order this file's own doc
   *  comment lists. Defaults to `Math.random`; tests inject a deterministic
   *  sequence instead. */
  rng?: () => number;
}

export interface CarnavalParadeEngine {
  readonly view: Readonly<CarnavalParadeView>;
  /** Advances the round by one `TICK_MS` step. A no-op once `phase` is `'done'`. */
  tick(): void;
  /** Moves one lane up (`-1`) or down (`1`), clamped to `[0, 2]`. A no-op
   *  once `phase` is `'done'`. */
  moveLane(delta: -1 | 1): void;
  /** The `MinigameStatsMap['carnaval-parade']` shape, off the live state. */
  stats(): CarnavalParadeStats;
  /** Test-only: sets the score and feather/star counts directly, bypassing
   *  real pickups (mirrors `bug-squash-engine.ts`'s `debugSetScore`), for
   *  shell-level tests that need a particular score without precisely timing
   *  the spawner. */
  debugSetScore(score: number, feathers: number, stars: number): void;
}

/** The multiplier a pickup at `streak` (pickups in a row before this one)
 *  scores at (design: `Math.min(4, 1 + Math.floor(streak / 5))`). */
export function multiplierForStreak(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / STREAK_PER_MULTIPLIER));
}

/** The parade's scroll speed in px/ms at `elapsedMs` into the round (design:
 *  `0.45 + Math.min(t / DUR, 1) * 0.6`): 0.45 at the start, ramping to 1.05
 *  by the finish and staying there. */
export function paradeSpeed(elapsedMs: number): number {
  return 0.45 + Math.min(elapsedMs / DURATION_MS, 1) * 0.6;
}

/** The next spawn's base interval in ms, before the rng's jitter (design:
 *  `Math.max(300, 700 - t * 0.011)`): 700 ms at the start, floored at 300 ms
 *  from about 36.4 s in. */
export function spawnIntervalBaseMs(elapsedMs: number): number {
  return Math.max(300, 700 - elapsedMs * 0.011);
}

export function createCarnavalParadeEngine(
  options: CarnavalParadeEngineOptions = {},
): CarnavalParadeEngine {
  const rng = options.rng ?? Math.random;

  let nextItemId = 0;
  // The design's own `this.sp`: ms left until the next spawn roll.
  let spawnCountdownMs = 700;
  // The design's own `this.tt`: the elapsedMs the current toast clears at.
  let toastUntilMs = 0;
  let feathers = 0;
  let stars = 0;
  let barriersHit = 0;

  const view: CarnavalParadeView = {
    phase: 'play',
    score: 0,
    lives: LIVES_START,
    streak: 0,
    bestStreak: 0,
    multiplier: multiplierForStreak(0),
    lane: 1,
    playerY: LANE_Y[1],
    elapsedMs: 0,
    items: [],
    toast: null,
    ended: null,
  };

  function spawnOne(lane: Lane, kind: ItemKind, x: number): CarnavalParadeItem {
    nextItemId += 1;
    return { id: nextItemId, x, lane, kind };
  }

  /** One spawn roll (design: the `if(this.sp<=0){...}` block), in the rng
   *  call order this file's doc comment lists. */
  function rollSpawn(elapsedMs: number, items: CarnavalParadeItem[]): void {
    spawnCountdownMs = spawnIntervalBaseMs(elapsedMs) + rng() * 220;
    const lane = Math.floor(rng() * 3) as Lane;
    const r = rng();
    if (r < 0.22) {
      items.push(spawnOne(lane, 'barrier', SPAWN_X));
    } else if (r < 0.34) {
      items.push(spawnOne(lane, 'star', SPAWN_X));
    } else if (r < 0.52) {
      for (let n = 0; n < 3; n++) {
        items.push(spawnOne(lane, 'feather', SPAWN_X + n * FEATHER_BURST_GAP_X));
      }
    } else {
      items.push(spawnOne(lane, 'feather', SPAWN_X));
    }
    // A second barrier, a lane or two over, sometimes rides along with the first.
    if (r < 0.22 && rng() < 0.4) {
      const secondLane = ((lane + 1 + Math.floor(rng() * 2)) % 3) as Lane;
      items.push(spawnOne(secondLane, 'barrier', SPAWN_X));
    }
  }

  function tick(): void {
    if (view.phase !== 'play') return;

    const elapsedMs = view.elapsedMs + TICK_MS;
    const speed = paradeSpeed(elapsedMs);
    const items = view.items.map((item) => ({ ...item, x: item.x - speed * TICK_MS }));

    spawnCountdownMs -= TICK_MS;
    if (spawnCountdownMs <= 0) rollSpawn(elapsedMs, items);

    let { score, lives, streak, bestStreak } = view;
    let toast = view.toast;
    let hitThisTick = false;

    const survivors = items.filter((item) => {
      if (item.x < COLLISION_MAX_X && item.x > COLLISION_MIN_X && item.lane === view.lane) {
        hitThisTick = true;
        if (item.kind === 'barrier') {
          lives -= 1;
          streak = 0;
          barriersHit += 1;
          toast = { text: 'OUCH -1 LIFE', kind: 'hit' };
        } else {
          const multiplier = multiplierForStreak(streak);
          streak += 1;
          bestStreak = Math.max(bestStreak, streak);
          const points = (item.kind === 'star' ? 25 : 10) * multiplier;
          score += points;
          if (item.kind === 'star') stars += 1;
          else feathers += 1;
          toast = { text: `+${points}${multiplier > 1 ? ` x${multiplier}` : ''}`, kind: 'pickup' };
        }
        return false;
      }
      if (item.x < OFFSCREEN_X) {
        // Missing a feather breaks the streak; a missed star or barrier doesn't.
        if (item.kind === 'feather') streak = 0;
        return false;
      }
      return true;
    });

    if (hitThisTick) {
      toastUntilMs = elapsedMs + TOAST_MS;
    } else if (toast !== null && elapsedMs > toastUntilMs) {
      toast = null;
    }

    view.elapsedMs = elapsedMs;
    view.items = survivors;
    view.score = score;
    view.lives = lives;
    view.streak = streak;
    view.bestStreak = bestStreak;
    view.multiplier = multiplierForStreak(streak);
    view.playerY = view.playerY + (LANE_Y[view.lane] - view.playerY) * PLAYER_EASE;
    view.toast = toast;

    if (elapsedMs >= DURATION_MS || lives <= 0) {
      view.phase = 'done';
      view.toast = null;
      view.ended = lives <= 0 ? 'lives' : 'time';
    }
  }

  function moveLane(delta: -1 | 1): void {
    if (view.phase !== 'play') return;
    view.lane = Math.max(0, Math.min(2, view.lane + delta)) as Lane;
  }

  return {
    view,
    tick,
    moveLane,
    stats() {
      return { feathers, stars, barriersHit, bestStreak: view.bestStreak };
    },
    debugSetScore(score, f, s) {
      view.score = score;
      feathers = f;
      stars = s;
    },
  };
}
