import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Kitchen's NPC motions (#113), copied verbatim from `design/Kitchen.dc.html`.
 *
 * `flipArm` and `cakeFly` now drive Chelsea's pancake flip (owner request,
 * 2026-10-06, below). Left out, because it isn't used at all: `sip`. All
 * three `@keyframes` rules exist in
 * the stylesheet, but none is ever referenced by an `animation:` anywhere in
 * the design's markup (confirmed by grepping the design file for each
 * name) -- Chelsea's figure carries no `animation:` of its own. This is
 * dead CSS left over from before #91's Kitchen resync (which replaced the
 * old "Chef Chelsea" with today's simpler, stationary Pancake Flip cook);
 * nothing in the current design applies them.
 *
 * Also left out for the same "not a placed NPC" reason as Roof Deck's own
 * `idle`: Jesse's and Tonya's `idle` bob is #36's own idle bob already, and
 * `say`/`blink` are bubble/HUD animations, not NPC motions.
 */
export const THE_MELT_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Chelsea flips pancakes at the stove (owner request, 2026-10-06). The
  // design's own unused `flipArm` and `cakeFly` keyframes (see above), on
  // her humans.js spatula and pancake: the spatula flicks up about her hand,
  // (30, 101), and the pancake leaves it, turns one full circle and lands back
  // on it. Same shape and timing as the design's, made bigger so it reads at
  // game scale: the flick goes to -55deg (not -40deg), the pancake rises 58
  // (not 34) figure units to head height, and is drawn 10x4 (not 8x3). The figure is drawn without its own spatula
  // (`replaceFigureProp`), so it isn't drawn twice. 1.6 s a flip; the design
  // gives these keyframes no duration of their own.
  chelsea: {
    replaceFigureProp: true,
    props: [
      {
        svg: '<rect x="12" y="74" width="6" height="26" rx="2" fill="#0C4B5F"/><rect x="8" y="64" width="14" height="14" rx="2" fill="#d9dcdf" stroke="#0C4B5F" stroke-width="2"/>',
        motion: {
          keyframes:
            '@keyframes flipArm { 0%,100% { transform: rotate(0);} 40% { transform: rotate(-55deg);} }',
          animation: 'flipArm 1.6s ease-in-out infinite',
          transformOrigin: '30px 101px',
        },
        children: [
          {
            svg: '<ellipse cx="15" cy="62" rx="10" ry="4" fill="#c9a266" stroke="#0C4B5F" stroke-width="1.5"/>',
            motion: {
              keyframes:
                '@keyframes cakeFly { 0%,100% { transform: translateY(0) rotate(0); opacity:1;} 45% { transform: translateY(-58px) rotate(180deg);} 90% { transform: translateY(0) rotate(360deg);} }',
              animation: 'cakeFly 1.6s ease-in-out infinite',
              transformOrigin: '15px 62px',
            },
          },
        ],
      },
    ],
  },
  tom: {
    path: {
      keyframes:
        '@keyframes tomWalk { 0%,15% { transform: translate(0,0);} 35%,60% { transform: translate(-240px, 60px);} 80%,100% { transform: translate(0,0);} }',
      animation: 'tomWalk 16s ease-in-out infinite',
    },
  },
};
