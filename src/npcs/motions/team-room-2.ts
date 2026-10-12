import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/** A Characters card's own `bob`: translateY(-5px) on its 176 px-wide render, 3.41 figure units here. */
function cardBob(name: string, period: string): NpcMotionSpec['figure'] {
  return {
    keyframes: `@keyframes ${name} { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }`,
    animation: `${name} ${period} ease-in-out infinite`,
  };
}

/**
 * Chris Pence's binoculars and the hands holding them up to his eyes, from
 * his Characters card's own binoculars (owner request, 2026-10-02, Track D).
 */
const CHRIS_BINOCULARS =
  '<rect x="43" y="34" width="13" height="15" rx="4" fill="#2a2d31" stroke="#0C4B5F" stroke-width="2"/><rect x="64" y="34" width="13" height="15" rx="4" fill="#2a2d31" stroke="#0C4B5F" stroke-width="2"/><rect x="56" y="38" width="8" height="6" fill="#494949" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="49.5" cy="41.5" r="4" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.2"/><circle cx="70.5" cy="41.5" r="4" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.2"/><circle cx="43.5" cy="51.5" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/><circle cx="76.5" cy="51.5" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/>';

/**
 * Team Room 2's NPC motions (owner requests, 2026-10-02, Track D). The Room
 * design animates none of its NPCs, so every motion here is authored. Nick
 * Brown, Frank Nardone and Aleksandr Molchagin sit working at desks, so they
 * only bob, each at their Characters card's own pace.
 */
export const TEAM_ROOM_2_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'nick-brown': { figure: cardBob('bobNick', '2.2s') },
  'frank-nardone': { figure: cardBob('bobFrank', '1.9s') },
  'aleksandr-molchagin': { figure: cardBob('bobAleksandr', '2.3s') },
  // Chris Pence looks round the Room through his binoculars: his figure
  // turns slowly from his feet to one side of the Room, holds while he looks,
  // swings back through the middle to the other side and holds again, 14s a
  // sweep. The binoculars and his hands move on their own as well, a little
  // further the way he turns, and lift and settle while he holds each look,
  // as if he were refocusing.
  'chris-pence': {
    figure: {
      keyframes:
        '@keyframes chrisScan { 0%,10% { transform: rotate(0deg);} 22%,38% { transform: rotate(-9deg);} 50%,58% { transform: rotate(0deg);} 70%,86% { transform: rotate(9deg);} 100% { transform: rotate(0deg);} }',
      animation: 'chrisScan 14s ease-in-out infinite',
      transformOrigin: '60px 120px',
    },
    props: [
      {
        svg: CHRIS_BINOCULARS,
        motion: {
          keyframes:
            '@keyframes chrisGlasses { 0%,10% { transform: translate(0,0);} 22% { transform: translate(-2.5px,0);} 28% { transform: translate(-2.5px,-1.5px);} 33% { transform: translate(-1.5px,0);} 38% { transform: translate(-2.5px,0);} 50%,58% { transform: translate(0,0);} 70% { transform: translate(2.5px,0);} 76% { transform: translate(2.5px,-1.5px);} 81% { transform: translate(1.5px,0);} 86% { transform: translate(2.5px,0);} 100% { transform: translate(0,0);} }',
          animation: 'chrisGlasses 14s ease-in-out infinite',
        },
      },
    ],
  },
};
