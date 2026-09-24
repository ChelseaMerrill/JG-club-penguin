import type { IdleEmote } from '../../contracts';

/**
 * The five idle emotes from `IdleEmote`, plus `WALK` for #14's movement.
 * `WALK` has no design keyframes (the Creator never walks); its two frames
 * are this renderer's own invention, in the spirit of the idle poses.
 */
export type PenguinAnim = IdleEmote | 'WALK';

/**
 * A single static frame to render: one extreme of `anim`'s CSS keyframe
 * cycle (`design/Penguin Creator.dc.html`'s `<style>`), baked into fixed
 * body/arm transforms since Phaser textures cannot animate a CSS keyframe.
 */
export interface PenguinPose {
  anim: PenguinAnim;
  frame: number;
}

/** Frame counts per anim (#31 D3). */
export const PENGUIN_FRAMES: Record<PenguinAnim, number> = {
  WADDLE: 2,
  WAVE: 2,
  DANCE: 2,
  LAUGH: 2,
  SIT: 1,
  WALK: 2,
};

/**
 * Per-frame duration in milliseconds, derived from each keyframe's CSS cycle
 * duration divided by its frame count (#31 D3). `SIT` never advances, but
 * still carries a duration so a caller can treat every anim uniformly.
 * `WALK` has no design cycle to derive from; 300ms/frame matches the design's
 * quicker idle cycles (DANCE, LAUGH) rather than the slower WADDLE saunter.
 */
export const PENGUIN_FRAME_MS: Record<PenguinAnim, number> = {
  WADDLE: 1200,
  WAVE: 400,
  DANCE: 350,
  LAUGH: 250,
  SIT: 1000,
  WALK: 300,
};

/** The baked transform values a frame applies to the figure. */
export interface PenguinFramePose {
  bodyRotateDeg: number;
  bodyTranslateY: number;
  leftArmRotateDeg: number;
  rightArmRotateDeg: number;
  leftFootLift: number;
  rightFootLift: number;
  sitting: boolean;
  forceSleepyEyes: boolean;
  showHaha: boolean;
}

const NEUTRAL_FRAME_POSE: PenguinFramePose = {
  bodyRotateDeg: 0,
  bodyTranslateY: 0,
  leftArmRotateDeg: 0,
  rightArmRotateDeg: 0,
  leftFootLift: 0,
  rightFootLift: 0,
  sitting: false,
  forceSleepyEyes: false,
  showHaha: false,
};

/**
 * Resolves `pose` to its baked transform values. `pose.frame` wraps to the
 * anim's frame count, so an out-of-range frame (e.g. a stale counter after
 * `setLook` switches anim) never renders an undefined pose.
 *
 * - WADDLE: the design's `waddle` keyframe alternates a −5°/+4° body tilt
 *   with a lift on the second extreme (`translateY(-6px)`).
 * - WAVE: only the right arm moves, 0°/−40°, matching the design's `wave`
 *   keyframe extremes (the right arm is the design's wave arm).
 * - DANCE: the body rocks ±8° with a lift on the second frame (the design's
 *   `dance` keyframe), while the left/right arms alternate raised/lowered
 *   (the design offsets the right arm's `wave` cycle by half its duration).
 * - LAUGH: the body's `laugh` keyframe extremes (neutral, then −3°/−4px);
 *   both frames force sleepy eyes and the "HA HA" text, as the design does
 *   for the whole LAUGH emote regardless of frame.
 * - SIT: one static frame with the seat shown, no arm or body motion.
 * - WALK: not in the design; a small alternating tilt with the trailing
 *   foot lifted, to read as a step.
 */
export function resolvePenguinFramePose(pose: PenguinPose): PenguinFramePose {
  const frameCount = PENGUIN_FRAMES[pose.anim];
  const frame = ((pose.frame % frameCount) + frameCount) % frameCount;

  switch (pose.anim) {
    case 'WADDLE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -5 }
        : { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: 4, bodyTranslateY: -6 };
    case 'WAVE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: 0 }
        : { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: -40 };
    case 'DANCE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -8, rightArmRotateDeg: -40 }
        : { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: 8, bodyTranslateY: -14, leftArmRotateDeg: -40 };
    case 'LAUGH':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, forceSleepyEyes: true, showHaha: true }
        : {
            ...NEUTRAL_FRAME_POSE,
            bodyRotateDeg: -3,
            bodyTranslateY: -4,
            forceSleepyEyes: true,
            showHaha: true,
          };
    case 'SIT':
      return { ...NEUTRAL_FRAME_POSE, sitting: true };
    case 'WALK':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -3, leftFootLift: -4 }
        : { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: 3, rightFootLift: -4 };
    default:
      return NEUTRAL_FRAME_POSE;
  }
}
