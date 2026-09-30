import type { ScreenPoint } from '../rooms/iso';

/**
 * The Phaser-free half of Ashley's squeaky-chicken toss in the Dev Pit
 * (owner request, 2026-09-30, Track D): what she throws, when, at whom, and
 * where the chicken is at any moment. `room-chicken-toss.ts` draws it.
 *
 * `design/Room 02 Dev Pit.dc.html` throws it on one fixed path (`chuck`,
 * with a `tumble` spin and three `sq1`-`sq3` "SQUEAK" callouts, one per
 * bounce); here the same toss is aimed at a Penguin in the Room instead: a
 * high arc onto them, then two shrinking bounces on past them, squeaking at
 * each landing, before it settles and fades. Client-side only: each screen
 * picks its own targets, and nothing here touches Presence.
 */

/** The design's `chuck`/`tumble` period: one toss every 9 s. */
export const CHICKEN_TOSS_PERIOD_MS = 9000;

/**
 * Where the chicken leaves Ashley's hand, relative to her feet: the design's
 * `translate(460 445)` against her (1,8) slot's Stage point (450, 500).
 */
export const CHICKEN_HAND_OFFSET: ScreenPoint = { x: 10, y: -55 };

/** How far above a Penguin's feet the chicken lands on them: about their middle. */
export const CHICKEN_HIT_HEIGHT = 30;

/** The design's `tumble`: 230 degrees over the whole flight. */
const TUMBLE_RADIANS = (230 * Math.PI) / 180;

/** Flight speed of the throw onto the target, in Stage pixels per ms, and its time bounds. */
const THROW_SPEED = 0.6;
const THROW_MIN_MS = 650;
const THROW_MAX_MS = 1300;

/** The two bounces after the hit: how far on (px), how high (px) and how long (ms). */
const BOUNCES = [
  { length: 70, height: 40, durationMs: 380 },
  { length: 35, height: 16, durationMs: 260 },
] as const;

/** The design keeps the landed chicken fully shown for ~7% of its 9 s, then fades it. */
const REST_MS = 450;
const FADE_MS = 600;

/** One arc of the chicken's flight, from one landing (or the hand) to the next. */
export interface ChickenHop {
  from: ScreenPoint;
  to: ScreenPoint;
  /** The arc's peak above the straight line between `from` and `to`. */
  height: number;
  durationMs: number;
}

export interface ChickenTossPlan {
  hops: ChickenHop[];
  /** When each hop lands, from the throw, in ms: where each "SQUEAK" pops up. */
  landingsMs: number[];
  /** The tumble's total spin, in radians: clockwise when thrown to the right. */
  spin: number;
  flightMs: number;
  totalMs: number;
}

/** The chicken's pose `elapsedMs` into a toss. */
export interface ChickenPose {
  point: ScreenPoint;
  rotation: number;
  alpha: number;
}

/** Plans a toss from Ashley's `hand` onto a Penguin standing at `targetFeet`. */
export function planChickenToss(hand: ScreenPoint, targetFeet: ScreenPoint): ChickenTossPlan {
  const hit = { x: targetFeet.x, y: targetFeet.y - CHICKEN_HIT_HEIGHT };
  const dx = hit.x - hand.x;
  const dy = hit.y - hand.y;
  const distance = Math.hypot(dx, dy);
  // Bounce on in the throw's direction; straight right for a zero-length throw.
  const unit = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
  const throwMs = Math.min(THROW_MAX_MS, Math.max(THROW_MIN_MS, distance / THROW_SPEED));

  const hops: ChickenHop[] = [
    { from: hand, to: hit, height: Math.max(140, distance * 0.35), durationMs: throwMs },
  ];
  // Then it drops off them and bounces on along the floor, level with their
  // feet (flattened, as the isometric floor is).
  let from: ScreenPoint = hit;
  let floor: ScreenPoint = targetFeet;
  for (const bounce of BOUNCES) {
    floor = { x: floor.x + unit.x * bounce.length, y: floor.y + unit.y * bounce.length * 0.5 };
    hops.push({ from, to: floor, height: bounce.height, durationMs: bounce.durationMs });
    from = floor;
  }

  const landingsMs: number[] = [];
  let clock = 0;
  for (const hop of hops) {
    clock += hop.durationMs;
    landingsMs.push(clock);
  }
  const flightMs = clock;
  return {
    hops,
    landingsMs,
    spin: dx >= 0 ? TUMBLE_RADIANS : -TUMBLE_RADIANS,
    flightMs,
    totalMs: flightMs + REST_MS + FADE_MS,
  };
}

/** Where the chicken is `elapsedMs` into `plan`, or `null` once the toss is over. */
export function sampleChickenToss(plan: ChickenTossPlan, elapsedMs: number): ChickenPose | null {
  if (elapsedMs >= plan.totalMs) return null;
  const t = Math.max(0, elapsedMs);
  const rotation = plan.spin * Math.min(1, t / plan.flightMs);
  let start = 0;
  for (const hop of plan.hops) {
    if (t < start + hop.durationMs) {
      const u = (t - start) / hop.durationMs;
      return {
        point: {
          x: hop.from.x + (hop.to.x - hop.from.x) * u,
          y: hop.from.y + (hop.to.y - hop.from.y) * u - hop.height * 4 * u * (1 - u),
        },
        rotation,
        alpha: 1,
      };
    }
    start += hop.durationMs;
  }
  const last = plan.hops[plan.hops.length - 1]!.to;
  const fadeStart = plan.totalMs - FADE_MS;
  const alpha = t < fadeStart ? 1 : 1 - (t - fadeStart) / FADE_MS;
  return { point: last, rotation, alpha };
}

/** A Penguin the chicken can be thrown at. */
export interface ChickenTarget {
  id: string;
  feet: ScreenPoint;
}

/**
 * Who gets the chicken next: any Penguin in the Room, but not the one hit
 * last time while someone else is there. `null` with nobody to throw at.
 */
export function pickChickenTarget(
  targets: readonly ChickenTarget[],
  lastId: string | null,
  random: () => number = Math.random,
): ChickenTarget | null {
  const fresh = targets.length > 1 ? targets.filter((target) => target.id !== lastId) : targets;
  if (fresh.length === 0) return null;
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))]!;
}

/**
 * The flying chicken, verbatim from the design's `chuck` group (drawn about
 * its own `translate` point, the origin here), inside a 40x32 viewBox
 * centred on its fill box, where the design's `tumble` spins it.
 */
export const CHICKEN_VIEWBOX = { x: -16, y: -21, width: 40, height: 32 } as const;

export function renderChickenSvg(): string {
  const { x, y, width, height } = CHICKEN_VIEWBOX;
  const scale = 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width * scale}" height="${height * scale}">` +
    '<ellipse cx="0" cy="0" rx="12" ry="8" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/>' +
    '<circle cx="10" cy="-6" r="6" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/>' +
    '<path d="M8 -12 q2 -6 6 -2 q2 -6 6 -1" fill="#D63C3C"/>' +
    '<polygon points="14,-4 20,-3 14,-1" fill="#E07A2F"/>' +
    '<circle cx="12" cy="-7" r="1.3" fill="#161719"/>' +
    '</svg>'
  );
}
