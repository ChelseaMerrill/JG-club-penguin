import type { RoomId } from '../../contracts';
import { devPit } from './definitions/dev-pit';
import { townCenter } from './definitions/town-center';
import type { RoomDefinition } from './room-definition';
import { assertValidRoomDefinitions } from './validate';

/** Every Room defined so far. Town Center and Dev Pit only; see #13 D1. */
export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [townCenter, devPit];

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

/** Throws if `id` has no registered `RoomDefinition` (e.g. not built yet). */
export function getRoomDefinition(id: RoomId): RoomDefinition {
  const room = BY_ID.get(id);
  if (!room) {
    throw new Error(`No RoomDefinition registered for room id "${id}"`);
  }
  return room;
}
