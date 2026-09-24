/**
 * STUB for #15 (room:enter). Stands in for real World/Room navigation: every
 * `enter(roomId)` spawns at the same fixed entry tile. Replace wholesale
 * when #15 lands.
 */
import type { GameEmitter } from '../contracts/game-events';
import type { RoomId } from '../contracts/rooms';
import type { Tile } from '../contracts/penguin';

/** The fixed spawn tile every stub Room entry lands on. */
export const ENTRY_TILE: Tile = { col: 5, row: 5 };

export interface StubRoomDriver {
  /** Emits `room:leave` for the current Room (if any) before emitting `room:enter` for `roomId`. A no-op when `roomId` is already the current Room. */
  enter(roomId: RoomId): void;
  currentRoom(): RoomId | null;
  /** Forgets the current Room without emitting any event (for sign-out cleanup, after the Presence channel has already been left). */
  reset(): void;
}

export function createStubRoomDriver(events: GameEmitter): StubRoomDriver {
  let current: RoomId | null = null;

  return {
    enter(roomId: RoomId): void {
      if (roomId === current) return;
      if (current) {
        events.emit('room:leave', { roomId: current });
      }
      current = roomId;
      events.emit('room:enter', { roomId, entryTile: ENTRY_TILE });
    },
    currentRoom(): RoomId | null {
      return current;
    },
    reset(): void {
      current = null;
    },
  };
}
