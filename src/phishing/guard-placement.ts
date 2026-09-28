import type { RoomId, Tile } from '../contracts';
import { doorApproachTile, npcInteractionTile } from '../game/movement/targets';
import type { RoomDefinition, RoomDoor } from '../game/rooms/room-definition';
import type { NpcId } from '../npcs/npcs';
import { GUARD_NPC_ID, type GuardWindow, type PhishingState } from './phishing-client';

/**
 * Where Anthony stands in the Room being shown (#146), for
 * `RoomScene.setGuard`. `doorLabel` names the door he guards (he stands on
 * its approach tile); `null` puts him next to the Player instead (the
 * Security Training lockout). `blocking` shuts that door for this Player:
 * using it starts his challenge instead of the Room change.
 */
export interface RoomGuard {
  roomId: RoomId;
  npcId: NpcId;
  doorLabel: string | null;
  blocking: boolean;
}

/**
 * Anthony's placement for `roomId`, from the server's guard window and the
 * Player's quiz state: at his scheduled door, shut until this window is
 * passed; while locked out, also next to the Player in any other Room.
 */
export function planGuard(
  roomId: RoomId,
  window: GuardWindow | null,
  state: PhishingState,
): RoomGuard | null {
  if (window && window.roomId === roomId) {
    return {
      roomId,
      npcId: GUARD_NPC_ID,
      doorLabel: window.doorLabel,
      blocking: !state.passedGuardWindow,
    };
  }
  if (state.locked) {
    return { roomId, npcId: GUARD_NPC_ID, doorLabel: null, blocking: false };
  }
  return null;
}

/** Whether using `door` should start Anthony's challenge instead of leaving the Room. */
export function isGuardedDoor(guard: RoomGuard | null, door: RoomDoor): boolean {
  return guard !== null && guard.blocking && guard.doorLabel === door.label;
}

/**
 * The Tile Anthony stands on: the guarded door's approach tile (the tile a
 * Penguin walks to in order to use it), or, when he isn't at a door, the
 * walkable tile nearest `playerTile` that is clear of the Room's NPCs.
 * `null` for a door `room` doesn't have.
 */
export function guardTile(
  room: RoomDefinition,
  guard: Pick<RoomGuard, 'doorLabel'>,
  playerTile: Tile,
): Tile | null {
  if (guard.doorLabel !== null) {
    const door = room.doors.find((candidate) => candidate.label === guard.doorLabel);
    return door ? doorApproachTile(room.walkable, door, room.grid.origin) : null;
  }
  // Clear of the Room's own NPCs where there's room (not on or next to one,
  // so he and his click zone don't overlap theirs), else just not on one.
  const npcTiles = room.npcSlots.map((slot) => slot.tile);
  const without = (blocked: (tile: Tile) => boolean) =>
    room.walkable.map((row, rowIndex) =>
      row.map((cell, col) => cell && !blocked({ col, row: rowIndex })),
    );
  for (const blocked of [
    (tile: Tile) => npcTiles.some((npc) => isNextTo(npc, tile)),
    (tile: Tile) => npcTiles.some((npc) => npc.col === tile.col && npc.row === tile.row),
  ]) {
    const tile = npcInteractionTile(without(blocked), { npcId: GUARD_NPC_ID, tile: playerTile });
    if (tile.col !== playerTile.col || tile.row !== playerTile.row) return tile;
  }
  return npcInteractionTile(room.walkable, { npcId: GUARD_NPC_ID, tile: playerTile });
}

/** Whether two Tiles touch (the same tile or one of its eight neighbours). */
export function isNextTo(a: Tile, b: Tile): boolean {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}

/**
 * "Bumping into" Anthony: finishing a walk next to him after having been
 * away from him. Walking away and coming back bumps him again.
 */
export interface BumpTracker {
  /** Starts over, e.g. when he's placed; `near` is whether the Player is next to him now. */
  reset(near: boolean): void;
  /** A walk ended; `near` is whether it ended next to him. True for a bump. */
  arrived(near: boolean): boolean;
}

export function createBumpTracker(): BumpTracker {
  let wasNear = false;
  return {
    reset(near) {
      wasNear = near;
    },
    arrived(near) {
      const bumped = near && !wasNear;
      wasNear = near;
      return bumped;
    },
  };
}
