import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * LATAM Disco Hall's six dancers (#<issue>), from `design/Latam Disco
 * Hall.dc.html`'s `#latam-people` group. Each stands in an outer
 * `<g transform="translate(x y)">` holding, in order: a ground shadow, a
 * static nameplate (a sibling of the dance, so it does *not* move with it),
 * then a bounce group (`animateTransform type="translate"
 * values="0 0;0 -10;0 0"`) wrapping a sway group (`type="rotate"
 * values="-7 0 0;7 0 0;-7 0 0"`) wrapping the figure itself, drawn at
 * `scale(0.58) translate(-60 -122)`.
 *
 * Both SMIL animations default to `calcMode="linear"` and evenly spaced
 * `values` (stops at 0%/50%/100%), and the rotate's `dur` is always exactly
 * twice the translate's, with the same `begin`: over one rotate cycle the
 * bounce completes two full cycles. Sampled by hand (mechanically, as
 * the-mullet.ts's ports are) at the quarter-points of that shared period:
 *
 *   0%   translateY(0)   rotate(-7deg)   -- feet planted, leaning left
 *   25%  translateY(-10) rotate(0deg)    -- mid-bounce, upright
 *   50%  translateY(0)   rotate(7deg)    -- feet planted, leaning right
 *   75%  translateY(-10) rotate(0deg)    -- mid-bounce, upright
 *  100%  = 0%
 *
 * which collapses the pair into one 4-stop `figure` keyframe per NPC,
 * `animation-delay` set to that NPC's own (already-negative, i.e.
 * already-elapsed) SMIL `begin`.
 *
 * Units: the bounce/sway are Stage-px transforms *outside* the design's own
 * `scale(0.58)` figure placement, so a `figure` track (figure-viewBox units,
 * inside the engine's own scale wrapper) needs the translate divided by that
 * same 0.58 -- `fig()` below, the Remote Lounge motions' own convention.
 * Rotate degrees don't scale. `transformOrigin` is the design's own pivot,
 * `(0,0)` in Stage px before the figure's own `translate(-60,-122)` recentre,
 * i.e. figure-viewBox point `(60,122)`, the feet.
 */

const SCALE = 0.58;
const FEET = '60px 122px';

/** Stage px to figure units at the design's 0.58 draw scale. */
function fig(stagePx: number): string {
  return `${+(stagePx / SCALE).toFixed(6)}px`;
}

/** The shared 4-stop dance cycle (see file doc), at this NPC's own SMIL `dur`/`begin`. */
function dance(name: string, durS: number, delayS: number): NpcMotionSpec {
  const keyframes = `@keyframes ${name} { 0%,100% { transform: translateY(0) rotate(-7deg);} 25%,75% { transform: translateY(${fig(-10)}) rotate(0deg);} 50% { transform: translateY(0) rotate(7deg);} }`;
  const delay = delayS === 0 ? '' : ` ${delayS}s`;
  return {
    figure: {
      keyframes,
      animation: `${name} ${durS.toFixed(2)}s linear${delay} infinite`,
      transformOrigin: FEET,
    },
  };
}

export const LATAM_DISCO_HALL_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'lucas-varani': dance('danceLucas', 1.0, 0),
  'hector-grecco': dance('danceHector', 1.32, -0.46),
  'jose-acosta': dance('danceJose', 1.16, -0.23),
  'fernando-possebon': dance('dancePossebon', 1.0, -0.69),
  'fernando-garagnani': dance('danceGaragnani', 1.32, -1.15),
  'ricardo-cordeiro': dance('danceRicardo', 1.16, -0.92),
};
