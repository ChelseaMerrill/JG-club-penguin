import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';
import { BOB_KEYFRAMES, BOB_ORIGIN } from './team-room-1';

/**
 * Team Room 2's NPC motions (#149), from `design/Team Room 2.dc.html`: Ian
 * sways on the same `bob 2.4s ease-in-out -0.6s` as Team Room 1's Jethro
 * (the Room's one NPC animation; its other `animation:`s are the HUD's
 * `blink` pills), so it reuses that file's keyframes, which are scaled to
 * move 6 Stage px at the 70/120 both Rooms draw their Humans at.
 */
export const TEAM_ROOM_2_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'ian-team-room-2': {
    figure: {
      keyframes: BOB_KEYFRAMES,
      animation: 'bob 2.4s ease-in-out -0.6s infinite',
      transformOrigin: BOB_ORIGIN,
    },
  },
};
