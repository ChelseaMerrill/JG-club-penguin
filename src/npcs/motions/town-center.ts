import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * This Room's NPC motions (#113), copied verbatim from `design/Room 01 Town Center.dc.html`.
 * Not ported yet: see `roof-deck.ts` for a complete example.
 */
export const TOWN_CENTER_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {};
