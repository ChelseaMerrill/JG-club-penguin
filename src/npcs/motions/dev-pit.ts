import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * This Room's NPC motions (#113), copied verbatim from `design/Room 02 Dev Pit.dc.html`.
 * Not ported yet: see `roof-deck.ts` for a complete example.
 */
export const DEV_PIT_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {};
