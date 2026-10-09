import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The LATAM Futebol Field's six JGers, ported from
 * `design/Latam Futebol Field.dc.html`'s own `<animateTransform>`s (SMIL, not
 * CSS keyframes, so there is no design `@keyframes` name to read off --
 * mechanically re-expressed here the way `the-mullet.ts`'s header describes:
 * each person's outer group plays one ping-pong `type="translate"` with
 * `values="start;end;start"`, no `keyTimes` (SMIL's default, evenly spaced:
 * 0%/50%/100%), and a `begin` written as the same phase offset as a negative
 * `animation-delay`. These are Stage px absolute positions with no other
 * transform on the group, so a `path` track's `translate()`s are simply
 * `end - start`, relative to each person's own `npcSlots` tile+offset
 * (`src/game/rooms/definitions/latam-futebol-field.ts`).
 *
 * Every person also plays the same `type="translate"` `values="0 0;0 -4;0
 * 0"` walk-bob, `dur=".6s"`, un-staggered: a `figure` track, 4 Stage px
 * divided by the design's own 0.58 draw scale (`npcs.ts`'s `scale: 0.58`,
 * Team Room 3's/Remote Lounge's precedent for `fig(px) = px / scale`) =
 * 6.897 figure px.
 */
const WALK_BOB_FIGURE_PX = 6.897;

function walkBob(name: string): NpcMotionSpec['figure'] {
  return {
    keyframes: `@keyframes ${name} { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-${WALK_BOB_FIGURE_PX}px);} }`,
    animation: `${name} .6s linear infinite`,
  };
}

/** `dx`/`dy` are the design's `end - start`, in Stage px; `begin` is the SMIL phase (0 or negative), written as a CSS `animation-delay`. */
function pingPong(
  name: string,
  dx: number,
  dy: number,
  durS: number,
  beginS: number,
): NpcMotionSpec['path'] {
  const delay = beginS === 0 ? '' : ` ${beginS}s`;
  return {
    keyframes: `@keyframes ${name} { 0% { transform: translate(0,0);} 50% { transform: translate(${dx}px,${dy}px);} 100% { transform: translate(0,0);} }`,
    animation: `${name} ${durS}s linear${delay} infinite`,
  };
}

export const LATAM_FUTEBOL_FIELD_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'thalles-stakonski': {
    path: pingPong('thallesWalk', 305, 162.5, 17, 0),
    figure: walkBob('bobThallesWalk'),
  },
  'bruno-amado': {
    path: pingPong('brunoWalk', -340, -150, 19, -4.1),
    figure: walkBob('bobBrunoWalk'),
  },
  'washington-marino': {
    path: pingPong('washingtonWalk', -310, 165, 22, -12.3),
    figure: walkBob('bobWashingtonWalk'),
  },
  'chrystian-rissoli': {
    path: pingPong('chrystianWalk', -60, 210, 20, -16.4),
    figure: walkBob('bobChrystianWalk'),
  },
  'paulo-ponciano': {
    path: pingPong('pauloWalk', -200, -210, 24, -20.5),
    figure: walkBob('bobPauloWalk'),
  },
  'gustavo-barska': {
    path: pingPong('gustavoWalk', 365, 167.5, 21, -8.2),
    figure: walkBob('bobGustavoWalk'),
  },
};
