import { IDLE_EMOTES, type IdleEmote } from '../../contracts';
import { DESIGN_TO_VIEWBOX_SCALE } from './design-scale';

/**
 * The five idle animations from `IdleEmote`, plus `WALK` for #14's movement
 * and four Emote-only poses for #47's picker (Thumbs Up, BRB, JG Flash, Ship
 * It — never part of `IdleEmote`, since the Creator's idle-animation list
 * stays untouched by #47). `WALK` has no design keyframes (the Creator never
 * walks); its two frames are this renderer's own invention, in the spirit of
 * the idle poses. The four Emote-only poses likewise have no Creator
 * keyframes to bake; each takes a visual cue from its HUD-EMOTE picker icon
 * (`design/Club JenGuin HUD Menus.dc.html`) rendered as a held prop
 * (`renderProp` in `render-svg.ts`) rather than attempting a literal flipper
 * gesture.
 */
export type PenguinAnim = IdleEmote | 'WALK' | 'THUMBS_UP' | 'BRB' | 'JG_FLASH' | 'SHIP_IT';

/** Every `PenguinAnim` value, the single source `texture.ts` and callers use
 * to enumerate the full set (#31 review fix 9; extended for #47's four
 * Emote-only poses, so they get pretextured on Penguin creation exactly like
 * every other anim). */
export const PENGUIN_ANIMS: readonly PenguinAnim[] = [
  ...IDLE_EMOTES,
  'WALK',
  'THUMBS_UP',
  'BRB',
  'JG_FLASH',
  'SHIP_IT',
];

/**
 * A single static frame to render: one extreme of `anim`'s CSS keyframe
 * cycle (`design/Penguin Creator.dc.html`'s `<style>`), baked into fixed
 * body/arm transforms since Phaser textures cannot animate a CSS keyframe.
 */
export interface PenguinPose {
  anim: PenguinAnim;
  frame: number;
}

/**
 * Frame counts per anim (#31 D3). The four #47 Emote-only poses are mostly
 * one static frame (like SIT, no design cycle to bake); `JG_FLASH` gets a
 * second frame so its radiating burst can blink.
 */
export const PENGUIN_FRAMES: Record<PenguinAnim, number> = {
  WADDLE: 2,
  WAVE: 2,
  DANCE: 2,
  LAUGH: 2,
  SIT: 1,
  WALK: 2,
  THUMBS_UP: 1,
  BRB: 1,
  JG_FLASH: 2,
  SHIP_IT: 1,
};

/**
 * Per-frame duration in milliseconds, derived from each keyframe's CSS cycle
 * duration divided by its frame count (#31 D3). `SIT` never advances, but
 * still carries a duration so a caller can treat every anim uniformly.
 * `WALK` has no design cycle to derive from; 300ms/frame matches the design's
 * quicker idle cycles (DANCE, LAUGH) rather than the slower WADDLE saunter.
 * `THUMBS_UP`/`BRB`/`SHIP_IT` are one static frame each (#47), so their
 * duration is never read by `penguin-sprite.ts`'s frame timer; `JG_FLASH`'s
 * 250ms blinks its burst at the same pace as `LAUGH`.
 */
export const PENGUIN_FRAME_MS: Record<PenguinAnim, number> = {
  WADDLE: 1200,
  WAVE: 400,
  DANCE: 350,
  LAUGH: 250,
  SIT: 1000,
  WALK: 300,
  THUMBS_UP: 1000,
  BRB: 1000,
  JG_FLASH: 250,
  SHIP_IT: 1000,
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
  /** The held prop `render-svg.ts`'s `renderProp` draws for a #47 Emote-only pose, or `null` for every other anim. */
  prop: 'THUMBS_UP' | 'BRB' | 'JG_FLASH' | 'SHIP_IT' | null;
  /** Whether `JG_FLASH`'s radiating burst lines show on this frame (its blink); meaningless for every other `prop`. */
  flashBurst: boolean;
}

/**
 * The design's `@keyframes` lift each idle animation's body by a CSS
 * `translateY` in px (`design/Penguin Creator.dc.html`'s `<style>`:
 * `waddle`'s 25%/75% extremes, `dance`'s 50% extreme, `laugh`'s 30%/60%
 * extremes). Converted to this renderer's viewBox units via
 * `DESIGN_TO_VIEWBOX_SCALE` (#31 review fix 2).
 */
const WADDLE_LIFT = -6 / DESIGN_TO_VIEWBOX_SCALE; // -6px -> ~-2.12
const DANCE_LIFT = -14 / DESIGN_TO_VIEWBOX_SCALE; // -14px -> ~-4.94
const LAUGH_LIFT = -4 / DESIGN_TO_VIEWBOX_SCALE; // -4px -> ~-1.41

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
  prop: null,
  flashBurst: false,
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
 *   for the whole LAUGH animation regardless of frame.
 * - SIT: one static frame with the seat shown, no arm or body motion.
 * - WALK: not in the design; a small alternating tilt with the trailing
 *   foot lifted, to read as a step.
 * - THUMBS_UP/BRB/JG_FLASH/SHIP_IT: #47's four Emote-only poses, not in the
 *   Creator's design; each raises an arm and shows a held prop
 *   (`render-svg.ts`'s `renderProp`), taking its visual cue from the
 *   matching HUD-EMOTE picker icon rather than a literal flipper gesture.
 *   JG_FLASH's second frame drops the prop's radiating burst lines (a blink)
 *   while keeping the badge itself shown in both frames.
 */
export function resolvePenguinFramePose(pose: PenguinPose): PenguinFramePose {
  const frameCount = PENGUIN_FRAMES[pose.anim];
  const frame = ((pose.frame % frameCount) + frameCount) % frameCount;

  switch (pose.anim) {
    case 'WADDLE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -5 }
        : { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: 4, bodyTranslateY: WADDLE_LIFT };
    case 'WAVE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: 0 }
        : { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: -40 };
    case 'DANCE':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -8, rightArmRotateDeg: -40 }
        : {
            ...NEUTRAL_FRAME_POSE,
            bodyRotateDeg: 8,
            bodyTranslateY: DANCE_LIFT,
            leftArmRotateDeg: -40,
          };
    case 'LAUGH':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, forceSleepyEyes: true, showHaha: true }
        : {
            ...NEUTRAL_FRAME_POSE,
            bodyRotateDeg: -3,
            bodyTranslateY: LAUGH_LIFT,
            forceSleepyEyes: true,
            showHaha: true,
          };
    case 'SIT':
      return { ...NEUTRAL_FRAME_POSE, sitting: true };
    case 'WALK':
      return frame === 0
        ? { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: -3, leftFootLift: -4 }
        : { ...NEUTRAL_FRAME_POSE, bodyRotateDeg: 3, rightFootLift: -4 };
    case 'THUMBS_UP':
      return { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: -50, prop: 'THUMBS_UP' };
    case 'BRB':
      return { ...NEUTRAL_FRAME_POSE, leftArmRotateDeg: -40, prop: 'BRB' };
    case 'JG_FLASH':
      return {
        ...NEUTRAL_FRAME_POSE,
        leftArmRotateDeg: -30,
        rightArmRotateDeg: -30,
        prop: 'JG_FLASH',
        flashBurst: frame === 0,
      };
    case 'SHIP_IT':
      return { ...NEUTRAL_FRAME_POSE, rightArmRotateDeg: -60, prop: 'SHIP_IT' };
    default:
      return NEUTRAL_FRAME_POSE;
  }
}
