import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Roof Deck's NPC motions (#113), copied verbatim from `design/Room 05
 * Roof Deck.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Left out, because they don't belong to an NPC: `hop` (the Hexles
 * bouncing on Kevin's counter, and the Hexle pet following the design's
 * sample "You" Penguin), `mkYou` (that sample Player Penguin), `idle` (the
 * vendors' bob, which #36's own idle bob already covers), `say` (#36's
 * bubbles) and `blink` (the HUD/door arrow). Also left out: `mkTristin`,
 * since Tristin is a Penguin in the design and so isn't placed (#133: only
 * Players appear as Penguins), and `mkAnthony` with his casting rod: #146
 * took Anthony off the Roof Deck to stand still at the door he guards (his
 * figure keeps its static `fishingRod` prop).
 */
export const ROOF_DECK_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Brandon gallops a loop around the deck on his hobby horse. The horse is
  // his `npcs.ts` figure's own `hobbyhorse` prop, so `gallop` (on the whole
  // figure, horse included, pivoting on the feet) rocks it with him.
  brandon: {
    path: {
      keyframes:
        '@keyframes mkBrandonGallop { 0% { transform: translate(0,0);} 20% { transform: translate(150px,75px);} 40% { transform: translate(250px,0);} 60% { transform: translate(50px,-100px);} 80% { transform: translate(-100px,-50px);} 100% { transform: translate(0,0);} }',
      animation: 'mkBrandonGallop 26s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes gallop { 0%,100% { transform: translateY(0) rotate(-4deg);} 50% { transform: translateY(-9px) rotate(4deg);} }',
      animation: 'gallop .45s ease-in-out infinite',
      transformOrigin: '60px 120px',
    },
  },
  millie: {
    path: {
      keyframes:
        '@keyframes mkMillie { 0% { transform: translate(0,0);} 44.0%,56.0% { transform: translate(25.00000000000002px, 67.5px);} 100% { transform: translate(0,0);} }',
      animation: 'mkMillie 20s ease-in-out infinite',
    },
  },
};
