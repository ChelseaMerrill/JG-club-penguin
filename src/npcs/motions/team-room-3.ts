import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * Team Room 3's NPC motions: none (owner request, 2026-09-30, Track D:
 * "update Team Room 3 to match Team Room 3 in Claude Design").
 *
 * `design/Team Room 3.dc.html` draws Millie, Casey and Sydney without any
 * `animation:` on their groups, figures or props, so each keeps its
 * `npcs.ts` `still` pose. Its `<style>` block has three keyframes, none an
 * NPC motion: `rats` (Casey's speech bubble, her `npcs.ts` `idleLines`),
 * `blink` (the "HALLWAY ↓" HUD nav pill) and `bob`, which nothing in the
 * file references (dead CSS in the design itself). The design's "You" is the
 * local Player's own Penguin, never an NPC. The Room's decorations (the
 * dashboards, the hologram table, the server rack's lights) don't move, and
 * are baked into the Room art.
 */
export const TEAM_ROOM_3_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {};
