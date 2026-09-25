import type { CssAnimationSource } from '../../game/npcs/css-keyframes';

/**
 * An extra piece of an NPC's figure that moves on its own (#113), e.g.
 * Anthony's fishing rod: markup copied verbatim from the Room design's
 * inline figure SVG, in the figure's own 120x130 viewBox units (the same
 * box `render-npc-svg.ts` draws the figure in), drawn in front of the
 * figure. `motion` is the design's CSS animation on that part (with its
 * `transform-origin`), and `children` are parts nested inside it in the
 * design (they inherit this part's motion, then add their own).
 */
export interface NpcPropLayer {
  svg: string;
  motion?: CssAnimationSource;
  children?: readonly NpcPropLayer[];
}

/**
 * One NPC's signature motion, ported from its Room design (#113). Every
 * field is optional; an NPC with no entry keeps #36's idle bob.
 *
 * - `path`: the design's roaming keyframes on the NPC's outer group (a
 *   `mk…`/`…Walk`/`…Roam` animation). Its `translate()`s are design pixels
 *   relative to where the NPC stands; the design canvas is the 1600x900
 *   Stage, so they are Stage pixels relative to the NPC's slot-tile point.
 *   The name tag, speech bubble and click target follow it.
 * - `figure`: an in-place motion on the whole figure (gallop, cartwheel,
 *   spin, hop, dance, sip...), in figure viewBox units, with the design's
 *   `transform-origin` (e.g. `60px 120px`, the feet). The name tag doesn't
 *   take part, as in the designs.
 * - `props`: extra moving parts drawn in front of the figure.
 * - `replaceFigureProp`: draw the figure without its `npcs.ts` `prop`, for
 *   when a `props` layer is the design's version of what that hand holds.
 * - `replaceFigureRestPose`: draw the figure without the static resting pose
 *   of a designed prop (`cards`, `marker`, from issue #137), for when a
 *   `props` layer animates that same prop, so it isn't drawn twice.
 *
 * Any NPC with a `path` or `figure` drops #36's idle bob: the designed
 * motion replaces it. Under `prefers-reduced-motion` none of this runs and
 * the NPC looks exactly as it did before #113.
 */
export interface NpcMotionSpec {
  path?: CssAnimationSource;
  figure?: CssAnimationSource;
  props?: readonly NpcPropLayer[];
  replaceFigureProp?: boolean;
  replaceFigureRestPose?: boolean;
}
