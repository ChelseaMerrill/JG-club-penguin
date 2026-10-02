import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * Team Room 2's NPC motions (owner request, 2026-10-02, Track D). The Room
 * design animates none of its NPCs; these are the two new people sitting at
 * desks, who only bob, each at their Characters card's own pace (`bob`,
 * translateY(-5px) on the card's 176 px-wide render: 3.41 figure units here,
 * as the Dev Pit's new people). Chris Pence has none: he leans toward the
 * Player instead (`watchesPlayer`, `game/npcs/watch.ts`).
 */
export const TEAM_ROOM_2_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'nick-brown': {
    figure: {
      keyframes:
        '@keyframes bobNick { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobNick 2.2s ease-in-out infinite',
    },
  },
  'frank-nardone': {
    figure: {
      keyframes:
        '@keyframes bobFrank { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobFrank 1.9s ease-in-out infinite',
    },
  },
};
