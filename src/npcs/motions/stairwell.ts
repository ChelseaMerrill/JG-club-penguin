import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Stairwell's NPC motions (#182, carried over from #51 slice 4/#149):
 * `design/Stairwell.dc.html`'s `<style>` block defines `domRun` and
 * `jasonPace` once and reuses them verbatim on every one of its six Stages
 * (same duration, easing and keyframe stops on every floor), so one spec per
 * role covers all 12 placements -- `stairwell.ts`'s own `npcSlotsFor` already
 * stands every floor's Dom/Jason on the tile that reproduces the
 * design's rest point (checked against each floor's own shadow ellipse).
 *
 * Left out:
 * - `domFace` (a `scaleX` flip on a group *between* `domRun`'s outer group
 *   and `hop2`'s inner one) has no layer to play on: `NpcMotionSpec` has only
 *   `path`/`figure`/`stage`, one designed transform per layer, and `domRun`
 *   and `hop2` already take the two that exist for Dom. Waived: it only
 *   flips which way Dom faces mid-run, not his route, outfit or placement.
 * - `domRun`'s own `opacity` fade (hidden before 5% and after 88%, so the
 *   loop's wrap from its last stop back to its first is invisible) is
 *   dropped: `css-keyframes.ts` documents that only a `props` layer's
 *   opacity is sampled, `path`/`figure`/`stage` ignore it. Dom stays visible
 *   through the wrap instead of fading, a known, accepted engine limit (not
 *   new to this ticket).
 *
 * `hop2` (Dom's running hop) sits on a `<g>` *inside* the figure's own scaled
 * `<svg width="74.4" viewBox="0 0 120 130">`, the same nesting as every
 * other Room's `figure`-channel keyframe (e.g. Dev Pit's own `idle`), so
 * it is ported verbatim with no scale conversion: every Stairwell figure
 * draws at the Human default (0.62), matching the design's own `width`.
 */

/**
 * Dom's run up the flight (`domRun`), Stage px relative to his rest point
 * (`npcSlotsFor`'s `dom-stairwell-${floor}` tile (1,4) + offset (-10,12) =
 * (640,522), the design's own first *visible* point): every stop below is
 * the design's own `translate()` minus its 0%/5% stop (40,2), so 0% lines up
 * with our rest point instead of the design's hidden true rest (600,520).
 */
const DOM_RUN_PATH: NpcMotionSpec['path'] = {
  keyframes:
    '@keyframes domRun { 0%,5% { transform: translate(0px,0px);} 8.0% { transform: translate(18px,-49px);} 16.9% { transform: translate(43px,-82px);} 25.8% { transform: translate(68px,-116px);} 34.7% { transform: translate(93px,-149px);} 43.6% { transform: translate(160px,-183px);} 52.4% { transform: translate(228px,-170px);} 61.3% { transform: translate(253px,-179px);} 70.2% { transform: translate(278px,-187px);} 79.1% { transform: translate(303px,-196px);} 88.0%,100% { transform: translate(360px,-216px);} }',
  animation: 'domRun 9s linear infinite',
};

/** Dom's running hop (`hop2`), verbatim: pre-scale figure px, nested the same way as every other Room's `idle`. */
const DOM_HOP_FIGURE: NpcMotionSpec['figure'] = {
  keyframes:
    '@keyframes hop2 { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-10px);} }',
  animation: 'hop2 .3s ease-in-out infinite',
};

const DOM_MOTION: NpcMotionSpec = { path: DOM_RUN_PATH, figure: DOM_HOP_FIGURE };

/**
 * Jason's pacing (`jasonPace`), verbatim Stage px relative to his rest point
 * (tile (2,6) + offset (20,5) = (620,590), exactly the design's own rest
 * ellipse, so no baseline subtraction is needed here). The design plays no
 * figure-level motion on him (`still: true` in `npcs.ts` already matches).
 */
const JASON_MOTION: NpcMotionSpec = {
  path: {
    keyframes:
      '@keyframes jasonPace { 0%,20% { transform: translate(0,0);} 45%,70% { transform: translate(170px, -65px);} 95%,100% { transform: translate(0,0);} }',
    animation: 'jasonPace 14s ease-in-out infinite',
  },
};

export const STAIRWELL_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'dom-stairwell-0': DOM_MOTION,
  'dom-stairwell-1': DOM_MOTION,
  'dom-stairwell-2': DOM_MOTION,
  'dom-stairwell-3': DOM_MOTION,
  'dom-stairwell-4': DOM_MOTION,
  'dom-stairwell-5': DOM_MOTION,
  'jason-stairwell-0': JASON_MOTION,
  'jason-stairwell-1': JASON_MOTION,
  'jason-stairwell-2': JASON_MOTION,
  'jason-stairwell-3': JASON_MOTION,
  'jason-stairwell-4': JASON_MOTION,
  'jason-stairwell-5': JASON_MOTION,
};
