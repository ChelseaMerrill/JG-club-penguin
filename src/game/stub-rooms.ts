/**
 * STUB for #15 (Room navigation). Stands in for real World/Room navigation:
 * each Player always enters a Room at the same tile, spread per `playerId`
 * so two Penguins do not overlap. Replace wholesale when #15 lands.
 */
import type { RoomEventMap, RoomId, Tile, TypedEmitter } from '../contracts';

const ENTRY_MIN = 3;
const ENTRY_SPAN = 6;

/** FNV-1a: a small, stable string hash. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The stub entry tile for `playerId`: col and row each in 3..8. */
export function entryTileFor(playerId: string): Tile {
  const h = hash(playerId);
  return {
    col: ENTRY_MIN + (h % ENTRY_SPAN),
    row: ENTRY_MIN + (Math.floor(h / ENTRY_SPAN) % ENTRY_SPAN),
  };
}

export interface StubRoomDriver {
  /** Emits `room:leave` for the current Room (if any) before `room:enter` for `roomId`. A no-op when `roomId` is already the current Room. */
  enter(roomId: RoomId, playerId: string): void;
  currentRoom(): RoomId | null;
  /** Emits `room:leave` for the current Room (if any) and forgets it: call on sign-out, before `bindPlayer(null)`. */
  reset(): void;
}

export function createStubRoomDriver(events: TypedEmitter<RoomEventMap>): StubRoomDriver {
  let current: RoomId | null = null;

  return {
    enter(roomId: RoomId, playerId: string): void {
      if (roomId === current) return;
      if (current) {
        events.emit('room:leave', { roomId: current });
      }
      current = roomId;
      events.emit('room:enter', { roomId, entryTile: entryTileFor(playerId) });
    },
    currentRoom(): RoomId | null {
      return current;
    },
    reset(): void {
      const leaving = current;
      current = null;
      if (leaving) events.emit('room:leave', { roomId: leaving });
    },
  };
}
