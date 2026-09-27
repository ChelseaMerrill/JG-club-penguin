import { DESIGN_TO_VIEWBOX_SCALE } from './design-scale';
import { PLAYER_PENGUIN_SCALE } from './player-penguin-scale';
import { PENGUIN_FRAME_MS, resolvePenguinFramePose, type PenguinAnim } from './poses';

/**
 * One pose of a Penguin's body motion (#68): the figure's tilt in degrees
 * and its offset in container px, for a right-facing Penguin. Applied to the
 * figure sprite and the snow hat only -- never the container, the name tag
 * or the chat bubble.
 */
export interface BodyKeyframe {
  angle: number;
  x: number;
  y: number;
}

/**
 * A cyclic keyframe track (#68 D1): the body eases `Sine.easeInOut` from
 * each keyframe to the next (the design's per-interval `ease-in-out`), taking
 * `segmentMs` per segment, and wraps from the last keyframe back to the first.
 */
export interface PenguinBodyMotion {
  keyframes: readonly BodyKeyframe[];
  segmentMs: number;
}

/**
 * The design's `@keyframes waddle` (`design/Penguin Creator.dc.html` l.17),
 * in design px and degrees: 0%/100%, 25%, 50%, 75% of a `2.4s ease-in-out`
 * cycle. Its sideways `translateX` sway is the #68 `[SCOPE CHANGE]`; the 0%
 * and 25% tilt and lift are the same extremes `poses.ts` bakes into WADDLE's
 * two frames.
 */
export const DESIGN_WADDLE_KEYFRAMES: readonly BodyKeyframe[] = [
  { x: -26, angle: -5, y: 0 },
  { x: -12, angle: 4, y: -6 },
  { x: 26, angle: 5, y: 0 },
  { x: 12, angle: -4, y: -6 },
];

/** Converts a design px length to this renderer's container px: design px -> viewBox -> scaled sprite. */
function designPxToContainer(px: number): number {
  return (px / DESIGN_TO_VIEWBOX_SCALE) * PLAYER_PENGUIN_SCALE;
}

const WADDLE_MOTION: PenguinBodyMotion = {
  keyframes: DESIGN_WADDLE_KEYFRAMES.map((k) => ({
    angle: k.angle,
    x: designPxToContainer(k.x),
    y: designPxToContainer(k.y),
  })),
  // Four segments over the design's 2.4 s cycle, which is two of
  // `PENGUIN_FRAME_MS.WADDLE`'s 1200 ms frames.
  segmentMs: (2 * PENGUIN_FRAME_MS.WADDLE) / DESIGN_WADDLE_KEYFRAMES.length,
};

/** The anims whose body tilt and lift tween between their two baked frames (no sideways sway). */
const TWO_POSE_ANIMS: readonly PenguinAnim[] = ['DANCE', 'LAUGH', 'WALK'];

function twoPoseMotion(anim: PenguinAnim): PenguinBodyMotion {
  const keyframes = [0, 1].map((frame) => {
    const pose = resolvePenguinFramePose({ anim, frame });
    return {
      angle: pose.bodyRotateDeg,
      x: 0,
      y: pose.bodyTranslateY * PLAYER_PENGUIN_SCALE,
    };
  });
  return { keyframes, segmentMs: PENGUIN_FRAME_MS[anim] };
}

/**
 * The body motion for `anim`, or `null` when `anim` has no body motion
 * (WAVE, SIT and the #47 Emote-only poses keep their baked frames as today).
 * WADDLE follows the design's four keyframes, including its sideways sway;
 * DANCE, LAUGH and WALK tween between their two `poses.ts` frames, with no
 * sideways offset (WALK has no design keyframes at all).
 */
export function penguinMotionFor(anim: PenguinAnim): PenguinBodyMotion | null {
  if (anim === 'WADDLE') return WADDLE_MOTION;
  if (TWO_POSE_ANIMS.includes(anim)) return twoPoseMotion(anim);
  return null;
}

/** Phaser's `Sine.easeInOut`, reimplemented so this module stays Phaser-free. */
export function sineEaseInOut(t: number): number {
  return -0.5 * (Math.cos(Math.PI * t) - 1);
}

/** The full cycle length of `spec`, in ms. */
export function bodyMotionCycleMs(spec: PenguinBodyMotion): number {
  return spec.segmentMs * spec.keyframes.length;
}

/**
 * Samples `spec` at `phase` (the cycle position, wrapped into [0, 1)): the
 * `Sine.easeInOut` interpolation between the two neighbouring keyframes.
 * Pure, and the unit-test surface for sampled values.
 */
export function sampleBodyMotion(spec: PenguinBodyMotion, phase: number): BodyKeyframe {
  const count = spec.keyframes.length;
  const wrapped = ((phase % 1) + 1) % 1;
  const position = wrapped * count;
  const index = Math.min(Math.floor(position), count - 1);
  const from = spec.keyframes[index];
  const to = spec.keyframes[(index + 1) % count];
  const t = sineEaseInOut(position - index);
  return {
    angle: from.angle + (to.angle - from.angle) * t,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/**
 * Whether the viewer asked the OS for reduced motion (#68 D5). Guarded so it
 * returns `false` wherever `matchMedia` is missing (Node, some test
 * environments). Read once per Penguin, when it's built.
 */
export function prefersReducedMotion(): boolean {
  const { matchMedia } = globalThis as { matchMedia?: (query: string) => { matches: boolean } };
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** An object the body motion moves: the figure sprite or the snow hat. */
export interface BodyMotionTarget {
  angle: number;
  x: number;
  y: number;
}

/** The per-Penguin object the single motion tween animates (#68 D3). */
export interface BodyMotionProxy {
  phase: number;
  blend: number;
}

/** The slice of a Phaser tween config this module builds. */
export interface BodyMotionTweenConfig {
  targets: BodyMotionProxy;
  props: {
    phase: { from: number; to: number; duration: number; repeat: number; ease: 'Linear' };
    blend: { from: number; to: number; duration: number; repeat: 0; ease: 'Sine.easeInOut' };
  };
  onUpdate: () => void;
}

/** The slice of Phaser's `TweenManager` this module needs. */
export interface BodyMotionTweens {
  add(config: BodyMotionTweenConfig): { remove(): unknown };
}

export interface BodyMotion {
  /** Stops any running motion, then starts `spec` with a lead-in from neutral. `null` just stops. */
  start(spec: PenguinBodyMotion | null): void;
  /** Mirrors the tilt and sway for a left-facing sprite (#147's flip), from the next tick on. */
  setFlipped(flipped: boolean): void;
  /** Removes the tween and, unless `resetTargets` is `false`, returns every target to neutral. */
  stop(resetTargets?: boolean): void;
}

function applyPose(targets: readonly BodyMotionTarget[], pose: BodyKeyframe): void {
  for (const target of targets) {
    target.angle = pose.angle;
    target.x = pose.x;
    target.y = pose.y;
  }
}

/**
 * The figure's body motion (#68 D3). `start` adds exactly one tween, on
 * `proxy`: `phase` loops 0 -> 1 linearly over the cycle, and `blend` eases
 * 0 -> 1 over one segment, once, so the body fades in from neutral rather
 * than popping into the sway. Every tick applies the sampled pose, scaled by
 * `blend` and mirrored when flipped, to every target. Phaser-free: written
 * against the structural `BodyMotionTweens`.
 */
export function createBodyMotion(
  tweens: BodyMotionTweens,
  targets: readonly BodyMotionTarget[],
  proxy: BodyMotionProxy,
): BodyMotion {
  let tween: { remove(): unknown } | null = null;
  let spec: PenguinBodyMotion | null = null;
  let sign = 1;

  function tick(): void {
    if (spec === null) return;
    const k = sampleBodyMotion(spec, proxy.phase);
    const blend = proxy.blend;
    // `|| 0` folds a `-0` (a zero offset times a negative sign) into a plain 0.
    applyPose(targets, {
      angle: sign * blend * k.angle || 0,
      x: sign * blend * k.x || 0,
      y: blend * k.y || 0,
    });
  }

  function stop(resetTargets = true): void {
    tween?.remove();
    tween = null;
    spec = null;
    if (resetTargets) applyPose(targets, { angle: 0, x: 0, y: 0 });
  }

  return {
    start(next) {
      stop();
      if (next === null) return;
      spec = next;
      proxy.phase = 0;
      proxy.blend = 0;
      tween = tweens.add({
        targets: proxy,
        props: {
          phase: {
            from: 0,
            to: 1,
            duration: bodyMotionCycleMs(next),
            repeat: -1,
            ease: 'Linear',
          },
          blend: { from: 0, to: 1, duration: next.segmentMs, repeat: 0, ease: 'Sine.easeInOut' },
        },
        onUpdate: tick,
      });
    },
    setFlipped(flipped) {
      sign = flipped ? -1 : 1;
    },
    stop,
  };
}
