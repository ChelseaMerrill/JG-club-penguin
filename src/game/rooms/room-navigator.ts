/**
 * The single producer of `room:leave`/`room:enter` (#26 D6, #15 D1). Every
 * Room change — a door, `changeRoom` from the HUD/debug overlay/Map (#33),
 * the spawn on sign-in, and the leave on sign-out — goes through this
 * module. Replaces `stub-rooms.ts` (#28's placeholder) wholesale (#15 A1).
 *
 * Its dependencies are injected (`RoomNavigatorScene`/emitter/`hasPlayer`) so
 * it can be unit tested with a fake scene and a fresh emitter, with no
 * Phaser involved.
 */
import {
  SPAWN_ROOM_ID,
  type RoomEventMap,
  type RoomId,
  type Tile,
  type TypedEmitter,
} from '../../contracts';
import { floorsDiffer, ROOM_FLOORS } from './floors';
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
   * Restarts to show `roomId` at `entryTile` (or the Room's own `spawnTile`
   * when omitted); returns whether it actually switched/restarted. Normally
   * a no-op for the already-shown Room (`false`) or one with no
   * `RoomDefinition` yet; `force` (used only by `enterSpawnRoom`) bypasses
   * the already-shown check so a repeat Session start still truly restarts
   * and respawns.
   */
  showRoom(roomId: RoomId, entryTile?: Tile, force?: boolean): boolean;
  /**
   * Resolves once the *next* restart's `create()` finishes; a fresh promise
   * every call, satisfied only by that restart's own ready signal (never by
   * one that already fired for an earlier call).
   */
  whenNextReady(): Promise<void>;
  /** Registers `handler` for every door the local Penguin reaches, enabled or disabled alike. */
  onDoorReached(handler: (door: RoomDoor) => void): void;
  /** Shows the "COMING SOON" hint for a disabled door; fire-and-forget. */
  showComingSoonHint(door: RoomDoor): void;
}

/**
 * The Elevator overlay's own navigator-facing seam (#52 D3/D6):
 * `src/ui/elevator-screen.ts`'s `createElevatorScreen` return value. `begin`
 * shows it (or retargets/restarts it if already visible); `ready` lets it
 * hide once the target Room's `create()` has actually finished, no sooner
 * than its own minimum duration; `cancel` hides it immediately (sign-out).
 */
export interface RoomTransitionScreen {
  begin(from: RoomId, to: RoomId): void;
  ready(): void;
  cancel(): void;
}

export interface RoomNavigatorDeps {
  scene: RoomNavigatorScene;
  /** The shared `gameEvents` bus in production; a fresh `TypedEmitter` in tests. */
  events: TypedEmitter<RoomEventMap>;
  /**
   * Whether a Player is currently registered (`registry.player`, #26 D6). A
   * final, defensive check only, at the moment a transition would otherwise
   * emit `room:enter`: `active` (below) is the primary Session gate for
   * `changeRoom` and doors.
   */
  hasPlayer: () => boolean;
  /**
   * Optional (#52 D3): when given, `changeRoom` shows it for any transition
   * that crosses a floor (`floorsDiffer(ROOM_FLOORS[from], ROOM_FLOORS[to])`).
   * `enterSpawnRoom` never shows it (the first Room of a Session has no
   * "from" floor to leave), and `leaveForSignOut` always `cancel()`s it.
   */
  transitionScreen?: RoomTransitionScreen;
}

export interface RoomNavigator {
  /**
   * Changes to `roomId` at `entryTile` (or its `spawnTile`): emits
   * `room:leave` for the current Room, restarts the Scene, waits for it to
   * finish, then emits `room:enter` — unless `roomId` is already current (a
   * no-op), no Session is active yet, or no Player is registered (no
   * `room:enter`, #26 D6). While an earlier transition's restart is still in
   * flight, a new call is dropped rather than queued (see `createRoomNavigator`).
   */
  changeRoom(roomId: RoomId, entryTile?: Tile): Promise<void>;
  /**
   * Enters `SPAWN_ROOM_ID` at its own `spawnTile`, with no preceding
   * `room:leave` in the normal case (#26 D6: the first Room of a Session) —
   * unless `current` is somehow already set, in which case it leaves that
   * Room first, defensively. Always forces a real restart/respawn, even if
   * the Scene already happens to show Town Center.
   */
  enterSpawnRoom(): Promise<void>;
  /** Emits `room:leave` for the current Room (if any), forgets it, and ends the Session (`active` becomes `false`). Call before `bindPlayer(null)` on sign-out. */
  leaveForSignOut(): void;
  /** The Room this navigator last entered (or is entering), or `null` before the first entry / after `leaveForSignOut`. */
  currentRoomId(): RoomId | null;
}

/** `entryTile ?? getRoomDefinition(roomId).spawnTile` (#15 D1). */
function resolveEntryTile(roomId: RoomId, entryTile: Tile | undefined): Tile {
  return entryTile ?? getRoomDefinition(roomId).spawnTile;
}

export function createRoomNavigator(deps: RoomNavigatorDeps): RoomNavigator {
  const { scene, events, hasPlayer, transitionScreen } = deps;
  let current: RoomId | null = null;
  /**
   * Set by `enterSpawnRoom`, cleared by `leaveForSignOut` (#15 review round
   * 1 D2). The Session gate `changeRoom` and doors check, instead of
   * `hasPlayer()`: `hasPlayer()` alone can't distinguish the window after
   * `bindPlayer(player)` from before `startSession`/`enterSpawnRoom` has
   * actually run — `registry.player` is already set, but no Session (Room
   * channel, navigator state) truly exists yet.
   */
  let active = false;
  /**
   * Bumped by every `enterRoom` call and by `leaveForSignOut`. An in-flight
   * transition only emits its `room:enter` if this still matches the token
   * it captured when it started; a later transition or a sign-out silently
   * supersedes it, so its own `whenNextReady()` resolving — possibly for a
   * *different*, superseding restart's ready signal — never produces a
   * stale `room:enter`.
   */
  let transitionToken = 0;
  /** `true` while a transition's scene restart is awaiting its ready signal. */
  let transitionInFlight = false;

  /**
   * Restarts to `roomId` (unless already shown, unless `force`) and emits
   * `room:enter`, unless superseded by a later transition (a stale `token`)
   * or the Session ended mid-flight (`active`/`hasPlayer()` no longer hold).
   * `current` updates optimistically, before the restart's ready signal, so
   * a sign-out mid-transition still reports the Room it was headed to as the
   * one it leaves. Never emits `room:leave` itself: callers emit it first.
   *
   * `showTransition` (#52 D3/D4) is `true` only for a `changeRoom` that
   * crossed a floor and therefore called `transitionScreen.begin()` first:
   * it's what makes this call also responsible for `transitionScreen.ready()`
   * once the Room is actually ready (or straight away if `showRoom` returned
   * `false`) -- but only while this is still the current transition, exactly
   * the same stale-`token` guard `room:enter` itself uses below, so a
   * superseded transition's `ready()` never fires after a newer transition or
   * a sign-out has already moved on.
   */
  async function enterRoom(
    roomId: RoomId,
    entryTile?: Tile,
    force = false,
    showTransition = false,
  ): Promise<void> {
    const token = ++transitionToken;
    transitionInFlight = true;
    current = roomId;
    const switched = scene.showRoom(roomId, entryTile, force);
    if (switched) await scene.whenNextReady();
    transitionInFlight = false;
    if (showTransition && token === transitionToken) transitionScreen?.ready();
    if (token !== transitionToken) return;
    if (!active || !hasPlayer()) return;
    events.emit('room:enter', { roomId, entryTile: resolveEntryTile(roomId, entryTile) });
  }

  /**
   * A no-op while inactive, already showing `roomId`, or — while another
   * transition's scene restart is still in flight — dropped rather than
   * queued: back-to-back inputs (e.g. a door arrival and an IGLOO click in
   * the same frame) keep only the first transition; the second is ignored
   * outright rather than compounding restarts or interleaving their
   * leave/enter pairs. `leave` is still emitted synchronously for whatever
   * `current` already is before the drop check, so a dropped call never
   * itself violates leave-before-enter (it simply never enters at all).
   */
  async function changeRoom(roomId: RoomId, entryTile?: Tile): Promise<void> {
    if (!active) return;
    if (transitionInFlight) return;
    if (roomId === current) return;
    const leaving = current;
    if (leaving) events.emit('room:leave', { roomId: leaving });
    // #52 D3: only a real floor crossing shows the Elevator -- never a
    // same-floor move, and never when either Room (e.g. the Igloo) has no
    // floor at all. `leaving` is non-null here whenever there's a floor to
    // leave from; the very first `changeRoom` of a Session always goes
    // through `enterSpawnRoom` instead, so `leaving` is never null on a real
    // floor-crossing call in practice, but the `leaving !== null` check below
    // stays anyway as the direct source of truth. The condition lives
    // directly in the `if` (rather than a separately-computed boolean
    // dereferenced with `!`) so TypeScript narrows `transitionScreen` and
    // `leaving` on its own (#52 review standards nit).
    let showTransition = false;
    if (
      transitionScreen !== undefined &&
      leaving !== null &&
      floorsDiffer(ROOM_FLOORS[leaving], ROOM_FLOORS[roomId])
    ) {
      showTransition = true;
      transitionScreen.begin(leaving, roomId);
    }
    await enterRoom(roomId, entryTile, false, showTransition);
  }

  scene.onDoorReached((door) => {
    // Doors do nothing while inactive (#15 review round 1 D2): before a
    // Session exists, `click-to-move`'s own always-on local movement
    // (`room-framework`/`click-to-move` specs boot with no Session at all)
    // must not actually change the shown Room or show a hint.
    if (!active) return;
    if (door.targetRoomId) {
      void changeRoom(door.targetRoomId, door.entryTile);
    } else {
      scene.showComingSoonHint(door);
    }
  });

  return {
    changeRoom,
    async enterSpawnRoom(): Promise<void> {
      active = true;
      // #52 review MINOR: cancel any transitionScreen state first, so a
      // transition superseded by this spawn entry (e.g. a sign-out and a
      // fresh sign-in racing a still-in-flight floor crossing) can never
      // leave the Elevator overlay stuck up over the freshly spawned Room.
      transitionScreen?.cancel();
      // Defensive: the normal path always calls `leaveForSignOut` first, so
      // `current` is already `null` here. If it somehow isn't, leave that
      // Room before forcing the fresh spawn entry.
      if (current) events.emit('room:leave', { roomId: current });
      await enterRoom(SPAWN_ROOM_ID, undefined, true);
    },
    leaveForSignOut(): void {
      active = false;
      transitionToken += 1;
      transitionInFlight = false;
      transitionScreen?.cancel();
      const leaving = current;
      current = null;
      if (leaving) events.emit('room:leave', { roomId: leaving });
    },
    currentRoomId(): RoomId | null {
      return current;
    },
  };
}
