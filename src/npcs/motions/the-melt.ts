import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Kitchen's NPC motions (#113), copied verbatim from `design/Kitchen.dc.html`.
 *
 * Left out, because they don't belong to a placed NPC or aren't used at
 * all: `flipArm`, `sip`, `cakeFly`. All three `@keyframes` rules exist in
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
  tom: {
    path: {
      keyframes:
        '@keyframes tomWalk { 0%,15% { transform: translate(0,0);} 35%,60% { transform: translate(-240px, 60px);} 80%,100% { transform: translate(0,0);} }',
      animation: 'tomWalk 16s ease-in-out infinite',
    },
  },
};
