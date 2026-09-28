import { NPC_TEXT_PATHS } from '../../game/npcs/text-paths';
import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/** The bait's "FREE $$$" as outlined paths, as the static rod draws it (#137). */
const FREE_BAIT = NPC_TEXT_PATHS.freeBait;

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
 * Players appear as Penguins).
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
  // Anthony strolls with a phishing rod: the design draws him casting a rod
  // ("FREE $$$" bait on the line). His Roof Deck figure's own `prop` is that
  // rod at rest (`fishingRod`, #137, shown under reduced motion), so this
  // casting rod replaces it while he moves: one rod either way. The bait's
  // text is the same outlined paths the static rod uses (an SVG texture
  // can't load the design's Anton font), not the design's `<text>`.
  anthony: {
    path: {
      keyframes:
        '@keyframes mkAnthony { 0% { transform: translate(0,0);} 29.3%,37.3% { transform: translate(-155px, -157.50000000000003px);} 62.7%,70.7% { transform: translate(-144.99999999999994px, 137.5px);} 100% { transform: translate(0,0);} }',
      animation: 'mkAnthony 28s ease-in-out infinite',
    },
    replaceFigureProp: true,
    props: [
      {
        svg: '<path d="M92 96 L118 10" stroke="#C9A366" stroke-width="3.5" stroke-linecap="round"/><circle cx="95" cy="92" r="4" fill="#161719" stroke="#0C4B5F" stroke-width="1.5"/>',
        motion: {
          keyframes:
            '@keyframes cast { 0%,100% { transform: rotate(-35deg);} 40% { transform: rotate(25deg);} 60% { transform: rotate(20deg);} }',
          animation: 'cast 3s ease-in-out infinite',
          transformOrigin: '92px 96px',
        },
        children: [
          {
            svg: `<path d="M118 10 L118 70" stroke="#F4F4F4" stroke-width="1.2"/><path d="M118 70 q0 8 -6 6" stroke="#B3B6C9" stroke-width="1.5" fill="none"/><rect x="108" y="72" width="20" height="14" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5"/><path d="M108 72 L118 80 L128 72" stroke="#0C4B5F" stroke-width="1.5" fill="none"/><path d="${FREE_BAIT.d}" fill="${FREE_BAIT.fill}"/>`,
            motion: {
              keyframes:
                '@keyframes line { 0%,100% { transform: rotate(20deg);} 40% { transform: rotate(-30deg);} 60% { transform: rotate(-24deg);} }',
              animation: 'line 3s ease-in-out infinite',
              transformOrigin: '118px 10px',
            },
          },
        ],
      },
    ],
  },
  millie: {
    path: {
      keyframes:
        '@keyframes mkMillie { 0% { transform: translate(0,0);} 44.0%,56.0% { transform: translate(25.00000000000002px, 67.5px);} 100% { transform: translate(0,0);} }',
      animation: 'mkMillie 20s ease-in-out infinite',
    },
  },
};
