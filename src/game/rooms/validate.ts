import type { Tile } from '../../contracts';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import type { RoomDefinition } from './room-definition';

export interface RoomValidationError {
  roomId: RoomDefinition['id'];
  message: string;
}

function isWalkable(room: RoomDefinition, tile: Tile): boolean {
  return room.walkable[tile.row]?.[tile.col] === true;
}

function isInBounds(room: RoomDefinition, tile: Tile): boolean {
  return (
    tile.col >= 0 && tile.col < room.grid.columns && tile.row >= 0 && tile.row < room.grid.rows
  );
}

/** The `walkable` mask must be exactly `grid.rows` x `grid.columns` (#13 fix 4). */
function checkWalkableMaskShape(room: RoomDefinition, errors: RoomValidationError[]): void {
  if (room.walkable.length !== room.grid.rows) {
    errors.push({
      roomId: room.id,
      message: `walkable mask has ${room.walkable.length} row(s), grid.rows is ${room.grid.rows}`,
    });
  }
  room.walkable.forEach((rowMask, row) => {
    if (rowMask.length !== room.grid.columns) {
      errors.push({
        roomId: room.id,
        message: `walkable row ${row} has ${rowMask.length} column(s), grid.columns is ${room.grid.columns}`,
      });
    }
  });
}

/** NPC, furniture and prop slots must sit within the Room's own grid (#13 fix 4). */
function checkSlotsInBounds(room: RoomDefinition, errors: RoomValidationError[]): void {
  for (const slot of room.npcSlots) {
    if (!isInBounds(room, slot.tile)) {
      errors.push({
        roomId: room.id,
        message: `NPC "${slot.npcId}" tile { col: ${slot.tile.col}, row: ${slot.tile.row} } is out of bounds`,
      });
    }
  }
  for (const slot of room.furnitureSlots ?? []) {
    if (!isInBounds(room, slot.tile)) {
      errors.push({
        roomId: room.id,
        message: `furniture slot "${slot.id}" tile { col: ${slot.tile.col}, row: ${slot.tile.row} } is out of bounds`,
      });
    }
  }
  for (const prop of room.props ?? []) {
    if (!isInBounds(room, prop.tile)) {
      errors.push({
        roomId: room.id,
        message: `prop "${prop.id}" tile { col: ${prop.tile.col}, row: ${prop.tile.row} } is out of bounds`,
      });
    }
  }
}

/** A hotspot's `rect` must lie entirely within the 1600x900 Stage (#16 D5). */
function checkHotspotsInStage(room: RoomDefinition, errors: RoomValidationError[]): void {
  const seenIds = new Set<string>();
  for (const hotspot of room.hotspots ?? []) {
    if (seenIds.has(hotspot.id)) {
      errors.push({
        roomId: room.id,
        message: `duplicate hotspot id "${hotspot.id}"`,
      });
    }
    seenIds.add(hotspot.id);

    const { x, y, width, height } = hotspot.rect;
    const withinStage = x >= 0 && y >= 0 && x + width <= GAME_WIDTH && y + height <= GAME_HEIGHT;
    if (!withinStage) {
      errors.push({
        roomId: room.id,
        message: `hotspot "${hotspot.id}" rect { x: ${x}, y: ${y}, width: ${width}, height: ${height} } is outside the ${GAME_WIDTH}x${GAME_HEIGHT} Stage`,
      });
    }
  }
}

/**
 * A `wallText` block's anchor must sit within the Stage and its `maxWidth`
 * must be positive (#77 D2) -- a non-positive `maxWidth` could never fit any
 * label, so it's always a mistake.
 */
function checkWallTextInStage(room: RoomDefinition, errors: RoomValidationError[]): void {
  for (const block of room.wallText ?? []) {
    const withinStage =
      block.x >= 0 && block.x <= GAME_WIDTH && block.y >= 0 && block.y <= GAME_HEIGHT;
    if (!withinStage) {
      errors.push({
        roomId: room.id,
        message: `wall text "${block.id}" anchor { x: ${block.x}, y: ${block.y} } is outside the ${GAME_WIDTH}x${GAME_HEIGHT} Stage`,
      });
    }
    if (!(block.maxWidth > 0)) {
      errors.push({
        roomId: room.id,
        message: `wall text "${block.id}" maxWidth ${block.maxWidth} must be greater than 0`,
      });
    }
  }
}

/**
 * Checks the invariants #13's acceptance criteria name: unique ids; a
 * walkable spawn tile; a `walkable` mask shaped exactly `grid.rows` x
 * `grid.columns`; NPC/furniture/prop slots in bounds; and doors that either
 * point at a Room actually present in `rooms` with a walkable `entryTile` in
 * that **target** Room, or are disabled (`targetRoomId: null`). Returns every
 * violation found; an empty array means `rooms` is valid.
 */
export function validateRoomDefinitions(rooms: readonly RoomDefinition[]): RoomValidationError[] {
  const errors: RoomValidationError[] = [];
  const seenIds = new Set<RoomDefinition['id']>();
  const byId = new Map(rooms.map((room) => [room.id, room]));

  for (const room of rooms) {
    if (seenIds.has(room.id)) {
      errors.push({ roomId: room.id, message: `duplicate room id "${room.id}"` });
    }
    seenIds.add(room.id);

    checkWalkableMaskShape(room, errors);
    checkSlotsInBounds(room, errors);
    checkHotspotsInStage(room, errors);
    checkWallTextInStage(room, errors);

    if (!isWalkable(room, room.spawnTile)) {
      errors.push({
        roomId: room.id,
        message: `spawn tile { col: ${room.spawnTile.col}, row: ${room.spawnTile.row} } is not walkable`,
      });
    }

    for (const door of room.doors) {
      if (door.targetRoomId === null) continue;

      const target = byId.get(door.targetRoomId);
      if (!target) {
        errors.push({
          roomId: room.id,
          message: `door "${door.label}" targets undefined room "${door.targetRoomId}"`,
        });
        continue;
      }

      if (!isWalkable(target, door.entryTile)) {
        errors.push({
          roomId: room.id,
          message: `door "${door.label}" entryTile { col: ${door.entryTile.col}, row: ${door.entryTile.row} } is not walkable in target room "${door.targetRoomId}"`,
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
