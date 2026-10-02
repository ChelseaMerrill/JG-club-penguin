import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Hallway's NPC motions. `design/Room 11 Office Hallway.dc.html` animates
 * none of its NPCs: Emily Smith's walk is authored (owner request,
 * 2026-10-02, Track D).
 */
export const OFFICE_HALLWAY_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Emily Smith ("Ever thought about joining JG?") walks laps of the
  // corridor: from her (4,3) slot north to (4,1), east along the back of the
  // corridor to (10,1), one tile south to (10,2), back west to (4,2), then
  // home, over walkable tiles clear of the planter at (12,0). She pauses only
  // on open floor, never on the TEAM ROOM 7-9 floor markers along the front
  // edge. `translate()`s are `tileToScreen` deltas (`TILE_WIDTH`/
  // `TILE_HEIGHT` 100/50) from her own tile, timed in proportion to each
  // leg's length (2, 6, 1, 6, 1 tiles), with a short pause at each corner.
  // `figure` is the designs' own generic `idle` bob, as the Dev Pit's Ian.
  emily: {
    path: {
      keyframes:
        '@keyframes emilyLap { 0%,3% { transform: translate(0,0);} 15%,18% { transform: translate(100px,-50px);} 51%,54% { transform: translate(400px,100px);} 59%,62% { transform: translate(350px,125px);} 94%,97% { transform: translate(50px,-25px);} 100% { transform: translate(0,0);} }',
      animation: 'emilyLap 32s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out infinite',
    },
  },
};
