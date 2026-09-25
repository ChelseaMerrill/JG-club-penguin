import type { NpcId } from './npcs';
import { DEV_PIT_MOTIONS } from './motions/dev-pit';
import { ROOF_DECK_MOTIONS } from './motions/roof-deck';
import { THE_ICEBOX_MOTIONS } from './motions/the-icebox';
import { THE_MELT_MOTIONS } from './motions/the-melt';
import { TOWN_CENTER_MOTIONS } from './motions/town-center';
import type { NpcMotionSpec } from './motions/types';

export type { NpcMotionSpec, NpcPropLayer } from './motions/types';

/**
 * Every NPC's signature motion from its Room design (#113), keyed by
 * `NpcId`, one data file per Room under `./motions/`. An NPC with no entry
 * keeps #36's idle bob. Client-side only: never part of Presence.
 */
const NPC_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  ...TOWN_CENTER_MOTIONS,
  ...DEV_PIT_MOTIONS,
  ...THE_MELT_MOTIONS,
  ...ROOF_DECK_MOTIONS,
  ...THE_ICEBOX_MOTIONS,
};

/** The NPC's designed motion, looked up by a Room slot's loosely-typed `npcId`. */
export function getNpcMotion(id: string): NpcMotionSpec | undefined {
  return Object.prototype.hasOwnProperty.call(NPC_MOTIONS, id)
    ? NPC_MOTIONS[id as NpcId]
    : undefined;
}
