/**
 * The single producer of `room:leave`/`room:enter` (#26 D6, #15 D1). Every
 * Room change — a door, `changeRoom` from the HUD/debug overlay/Map (#33),
 * the spawn on sign-in, and the leave on sign-out — goes through this
 * module. Replaces `stub-rooms.ts` (#28's placeholder) wholesale (#15 A1).
 *
 * Its dependencies are injected (`RoomNavigatorDeps`) so it can be unit
 * tested with a fake scene and a fresh emitter, with no Phaser involved.
 */
import {
  SPAWN_ROOM_ID,
  type RoomEventMap,
  type RoomId,
  type Tile,
  type TypedEmitter,
} from '../../contracts';
import { getRoomDefinition } from './registry';
import type { RoomDoor } from './room-definition';

/**
 * The scene-facing half of a Room change. `RoomScene` implements this
 * directly; tests inject a fake. `onDoorReached`'s handler is registered
 * exactly once, at navigator construction: the real `RoomScene`'s `events`
 * emitter survives every `scene.restart()`, so re-registering per Room
 * change would only stack duplicate listeners (#15 A4).
 */
export interface RoomNavigatorScene {
  /**
   * Restarts to show `roomId` at `entryTile` (or the Room's own
   * `spawnTile` when omitted); returns whether it actually switched (`false`
   * for the already-shown Room or one with no `RoomDefinition` yet).
   */
  showRoom(roomId: RoomId, entryTile?: Tile): boolean;
  /** Resolves once the *next* restart's `create()` finishes; a fresh promise every call. */
  whenNextReady(): Promise<void>;
  /** Registers `handler` for every door the local Penguin reaches, enabled or disabled alike. */
  onDoorReached(handler: (door: RoomDoor) => void): void;
  /** Shows the "COMING SOON" hint for a disabled door; fire-and-forget. */
  showComingSoonHint(door: RoomDoor): void;
}

export interface RoomNavigatorDeps {
  scene: RoomNavigatorScene;
  /** The shared `gameEvents` bus in production; a fresh `TypedEmitter` in tests. */
  events: TypedEmitter<RoomEventMap>;
  /** Whether a Player is currently registered (`registry.player`, #26 D6). */
  hasPlayer: () => boolean;
}

export interface RoomNavigator {
  /**
   * Changes to `roomId` at `entryTile` (or its `spawnTile`): emits
   * `room:leave` for the current Room, restarts the Scene, waits for it to
   * finish, then emits `room:enter` — unless `roomId` is already current (a
   * no-op) or no Player is registered (no `room:enter`, #26 D6).
   */
  changeRoom(roomId: RoomId, entryTile?: Tile): Promise<void>;
  /** Enters `SPAWN_ROOM_ID` at its `spawnTile`, with no preceding `room:leave` (#26 D6: the first Room of a Session). */
  enterSpawnRoom(): Promise<void>;
  /** Emits `room:leave` for the current Room (if any) and forgets it. Call before `bindPlayer(null)` on sign-out. */
  leaveForSignOut(): void;
  /** The Room this navigator last entered, or `null` before the first entry / after `leaveForSignOut`. */
  currentRoomId(): RoomId | null;
}

/** `entryTile ?? getRoomDefinition(roomId).spawnTile` (#15 D1). */
function resolveEntryTile(roomId: RoomId, entryTile: Tile | undefined): Tile {
  return entryTile ?? getRoomDefinition(roomId).spawnTile;
}

export function createRoomNavigator(deps: RoomNavigatorDeps): RoomNavigator {
  const { scene, events, hasPlayer } = deps;
  let current: RoomId | null = null;

  /**
   * Restarts to `roomId` (unless already shown) and emits `room:enter`. A
   * complete no-op — no restart, no `room:enter` — while no Player is
   * registered (#26 D6): before a Session exists, a door reached by
   * `click-to-move`'s own always-on local movement (`room-framework`,
   * `click-to-move` specs boot with no Player at all) must not actually
   * change the shown Room. Never emits `room:leave` itself: callers that
   * need one emit it first.
   */
  async function enterRoom(roomId: RoomId, entryTile?: Tile): Promise<void> {
    if (!hasPlayer()) return;
    current = roomId;
    const switched = scene.showRoom(roomId, entryTile);
    if (switched) await scene.whenNextReady();
    events.emit('room:enter', { roomId, entryTile: resolveEntryTile(roomId, entryTile) });
  }

  async function changeRoom(roomId: RoomId, entryTile?: Tile): Promise<void> {
    if (roomId === current) return;
    const leaving = current;
    if (leaving) events.emit('room:leave', { roomId: leaving });
    await enterRoom(roomId, entryTile);
  }

  scene.onDoorReached((door) => {
    if (door.targetRoomId) {
      void changeRoom(door.targetRoomId, door.entryTile);
    } else {
      scene.showComingSoonHint(door);
    }
  });

  return {
    changeRoom,
    enterSpawnRoom(): Promise<void> {
      return enterRoom(SPAWN_ROOM_ID);
    },
    leaveForSignOut(): void {
      const leaving = current;
      current = null;
      if (leaving) events.emit('room:leave', { roomId: leaving });
    },
    currentRoomId(): RoomId | null {
      return current;
    },
  };
}
