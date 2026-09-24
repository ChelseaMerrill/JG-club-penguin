import type { RoomDefinition } from './room-definition';

export interface RoomValidationError {
  roomId: RoomDefinition['id'];
  message: string;
}

function isWalkable(room: RoomDefinition, tile: { col: number; row: number }): boolean {
  return room.walkable[tile.row]?.[tile.col] === true;
}

/**
 * Checks the invariants #13's acceptance criteria name: unique ids, a
 * walkable spawn tile, and doors that either point at a Room actually
 * present in `rooms` or are disabled (`targetRoomId: null`). Returns every
 * violation found; an empty array means `rooms` is valid.
 */
export function validateRoomDefinitions(rooms: readonly RoomDefinition[]): RoomValidationError[] {
  const errors: RoomValidationError[] = [];
  const seenIds = new Set<RoomDefinition['id']>();
  const definedIds = new Set(rooms.map((room) => room.id));

  for (const room of rooms) {
    if (seenIds.has(room.id)) {
      errors.push({ roomId: room.id, message: `duplicate room id "${room.id}"` });
    }
    seenIds.add(room.id);

    if (!isWalkable(room, room.spawnTile)) {
      errors.push({
        roomId: room.id,
        message: `spawn tile { col: ${room.spawnTile.col}, row: ${room.spawnTile.row} } is not walkable`,
      });
    }

    for (const door of room.doors) {
      if (door.targetRoomId !== null && !definedIds.has(door.targetRoomId)) {
        errors.push({
          roomId: room.id,
          message: `door "${door.label}" targets undefined room "${door.targetRoomId}"`,
        });
      }
    }
  }

  return errors;
}

/** Throws with every violation's message if `rooms` is invalid. */
export function assertValidRoomDefinitions(rooms: readonly RoomDefinition[]): void {
  const errors = validateRoomDefinitions(rooms);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `[${error.roomId}] ${error.message}`).join('\n'));
  }
}
