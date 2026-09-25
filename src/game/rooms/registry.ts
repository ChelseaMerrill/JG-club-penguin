import type { RoomId } from '../../contracts';
import { bathroom } from './definitions/bathroom';
import { devPit } from './definitions/dev-pit';
import { igloo } from './definitions/igloo';
import { officeHallway } from './definitions/office-hallway';
import { roofDeck } from './definitions/roof-deck';
import { teamRoom1 } from './definitions/team-room-1';
import { teamRoom2 } from './definitions/team-room-2';
import { teamRoom3 } from './definitions/team-room-3';
import { teamRoom4 } from './definitions/team-room-4';
import { theIcebox } from './definitions/the-icebox';
import { theMelt } from './definitions/the-melt';
import { townCenter } from './definitions/town-center';
import type { RoomDefinition } from './room-definition';
import { assertValidRoomDefinitions } from './validate';

/** Every Room, traced from the designs: #16's five prototype Rooms, then #51's. */
export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [
  townCenter,
  devPit,
  theMelt,
  roofDeck,
  igloo,
  theIcebox,
  officeHallway,
  teamRoom1,
  teamRoom2,
  teamRoom3,
  teamRoom4,
  bathroom,
];

// Fails fast on a broken RoomDefinition in dev (`npm run dev`) and test
// (`npm test`) builds; skipped in the Vercel production build, matching the
// dev/test-only pattern `dev-room-hook.ts` uses for its own hooks (#13 fix
// 4). `validate.test.ts` also exercises `assertValidRoomDefinitions`
// directly, so the check is covered by a test regardless of this guard.
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  assertValidRoomDefinitions(ROOM_DEFINITIONS);
}

const BY_ID: ReadonlyMap<RoomId, RoomDefinition> = new Map(
  ROOM_DEFINITIONS.map((room) => [room.id, room]),
);

/** Whether `id` has a registered `RoomDefinition` (only some Rooms are built so far). */
export function hasRoomDefinition(id: RoomId): boolean {
  return BY_ID.has(id);
}

/** Throws if `id` has no registered `RoomDefinition` (e.g. not built yet). */
export function getRoomDefinition(id: RoomId): RoomDefinition {
  const room = BY_ID.get(id);
  if (!room) {
    throw new Error(`No RoomDefinition registered for room id "${id}"`);
  }
  return room;
}
