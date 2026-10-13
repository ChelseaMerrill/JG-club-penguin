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
import type { FloorChoice, RoomDoor } from './room-definition';
import { isStairsMove } from './stairwell';

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
  /**
   * Registers `handler` for every door the local Penguin reaches by a click
   * or by Enter. A locked door is never walked to (#170 D4), so it never
   * arrives: its click shows its hint straight away.
   */
  onDoorReached(handler: (door: RoomDoor) => void): void;
  /** Shows the UNDER CONSTRUCTION hint for a locked door (#170 D4); fire-and-forget. */
  showLockedHint(door: RoomDoor): void;
  /**
   * #170 D7 (#51 n3): if Anthony is guarding `door` for this Player, opens
   * his dialog instead (unless this same arrival already bumped him, which
   * opened it) and returns `true`; otherwise does nothing and returns `false`.
   */
  redirectGuardedDoor(door: RoomDoor): boolean;
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

/**
 * The pointer-blocking fade layer (#170 D5; `src/ui/door-fade.ts`). `out()`
 * fades to the Stage colour and resolves once it's opaque; `clear()` fades
 * back in; `cancel()` hides it at once (sign-out, a spawn, the Elevator
 * taking over).
 */
export interface RoomFade {
  out(): Promise<void>;
  clear(): void;
  cancel(): void;
}

/** How a Room change is made (#170 D5): `fade` only for door, pill, Enter and picker changes. */
export interface ChangeRoomOptions {
  fade?: boolean;
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
  /** Optional (#170 D5): what a `{ fade: true }` change fades through. Without it nothing fades. */
  fade?: RoomFade;
  /**
   * Optional (#170 D9): asks which floor a door with `floorChoices` goes to,
   * resolving the chosen unlocked floor, or `null` for any close. Without
   * it, such a door uses its own `targetRoomId`.
   */
  pickFloor?: (door: RoomDoor) => Promise<FloorChoice | null>;
}

export interface RoomNavigator {
  /**
   * Changes to `roomId` at `entryTile` (or its `spawnTile`): emits
   * `room:leave` for the current Room, restarts the Scene, waits for it to
   * finish, then emits `room:enter` — unless `roomId` is already current (a
   * no-op), no Session is active yet, or no Player is registered (no
   * `room:enter`, #26 D6). While an earlier transition is still in flight, a
   * new call is dropped rather than queued (see `createRoomNavigator`). With
   * `{ fade: true }` (#170 D5) the screen fades out after the leave, before
   * the restart.
   */
  changeRoom(roomId: RoomId, entryTile?: Tile, options?: ChangeRoomOptions): Promise<void>;
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
  /** The Room this navigator last entered (or is entering), or `null` before the first entry, during a fade (#170 D5) and after `leaveForSignOut`. */
  currentRoomId(): RoomId | null;
  /**
   * Uses `door` exactly as the local Penguin reaching it does, with no walk
   * (#51 slice 4, RT2-5): `changeRoom` to its target at its `entryTile`, or
   * its UNDER CONSTRUCTION hint when locked. Anthony's guard comes first
   * (#170 D7). A no-op while inactive or while a transition is in flight
   * (RT170-10). The Stairwell's ↑/↓ keys use their floor's doors through
   * this, unfaded; a door reached by a click or Enter fades.
   */
  useDoor(door: RoomDoor, options?: ChangeRoomOptions): void;
  /** Whether a transition is in flight, from its leave (and any fade) until its Room is ready (a new `changeRoom` would be dropped). */
  isTransitioning(): boolean;
}

/** `entryTile ?? getRoomDefinition(roomId).spawnTile` (#15 D1). */
function resolveEntryTile(roomId: RoomId, entryTile: Tile | undefined): Tile {
  return entryTile ?? getRoomDefinition(roomId).spawnTile;
}

export function createRoomNavigator(deps: RoomNavigatorDeps): RoomNavigator {
  const { scene, events, hasPlayer, transitionScreen, fade, pickFloor } = deps;
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
   * Bumped by every transition entry point itself (#170 RT170-4, RT170-24):
   * `changeRoom`, faded or not, in the same synchronous step as its
   * `room:leave`; `enterSpawnRoom`; and `leaveForSignOut`. An in-flight
   * transition only goes on past its fade, emits its `room:enter`, readies
   * the Elevator or clears its fade while this still matches the token it
   * took; a later transition or a sign-out silently supersedes it, so its own
   * `whenNextReady()` resolving — possibly for a *different*, superseding
   * restart's ready signal — never produces a stale `room:enter`.
   */
  let transitionToken = 0;
  /** `true` from a transition's start (its leave, then any fade) until its scene restart's ready signal. */
  let transitionInFlight = false;

  /**
   * Restarts to `roomId` (unless already shown, unless `force`) and emits
   * `room:enter`, unless superseded by a later transition (a stale `token`)
   * or the Session ended mid-flight (`active`/`hasPlayer()` no longer hold).
   * `token` is the caller's own: this never takes one itself (#170 D5).
   * `current` updates optimistically as the restart starts, before its ready
   * signal, so a sign-out mid-restart still reports the Room it was headed to
   * as the one it leaves. Never emits `room:leave` itself: callers emit it
   * first.
   *
   * `showTransition` (#52 D3/D4) is `true` only for a `changeRoom` that
   * crossed a floor and therefore called `transitionScreen.begin()` first:
   * it's what makes this call also responsible for `transitionScreen.ready()`
   * once the Room is actually ready (or straight away if `showRoom` returned
   * `false`) -- but only while this is still the current transition, exactly
   * the same stale-`token` guard `room:enter` itself uses below, so a
   * superseded transition's `ready()` never fires after a newer transition or
   * a sign-out has already moved on. The fade (#170 D5) clears on the same
   * terms.
   */
  async function enterRoom(
    roomId: RoomId,
    entryTile: Tile | undefined,
    token: number,
    force = false,
    showTransition = false,
  ): Promise<void> {
    transitionInFlight = true;
    current = roomId;
    const switched = scene.showRoom(roomId, entryTile, force);
    if (switched) await scene.whenNextReady();
    if (token !== transitionToken) return;
    transitionInFlight = false;
    if (showTransition) transitionScreen?.ready();
    fade?.clear();
    if (!active || !hasPlayer()) return;
    events.emit('room:enter', { roomId, entryTile: resolveEntryTile(roomId, entryTile) });
  }

  /**
   * A no-op while inactive, already showing `roomId`, or — while another
   * transition is still in flight — dropped rather than queued: back-to-back
   * inputs (e.g. a door arrival and an IGLOO click in the same frame) keep
   * only the first transition; the second is ignored outright rather than
   * compounding restarts or interleaving their leave/enter pairs. `leave` is
   * emitted synchronously, before any fade, so a source tag set around the
   * call (RT2-7) sees it.
   */
  async function changeRoom(
    roomId: RoomId,
    entryTile?: Tile,
    options: ChangeRoomOptions = {},
  ): Promise<void> {
    if (!active) return;
    if (transitionInFlight) return;
    if (roomId === current) return;
    const leaving = current;
    // #170 D5: in the same synchronous step as the leave, so nothing (the
    // Map, the keys, a door, a sign-out) can slip in during a fade unseen;
    // and before it (review MINOR-1), so a `room:leave` listener already sees
    // a transition in flight (the doors' keyboard layer goes inert there).
    transitionInFlight = true;
    const token = ++transitionToken;
    if (leaving) events.emit('room:leave', { roomId: leaving });
    if (options.fade && fade) {
      // The target becomes `current` only once its restart starts
      // (`enterRoom`): a sign-out mid-fade has nothing left to leave.
      current = null;
      await fade.out();
      // RT170-4: superseded during the fade (a sign-out, and maybe a fresh
      // spawn after it), whose own entry point already took the fade down.
      // No restart, no Elevator, no further `room:leave`.
      if (token !== transitionToken || !active) return;
    }
    // #52 D3: only a real floor crossing shows the Elevator -- never a
    // same-floor move, and never when either Room (e.g. the Igloo) has no
    // floor at all. `leaving` is non-null here whenever there's a floor to
    // leave from; the very first `changeRoom` of a Session always goes
    // through `enterSpawnRoom` instead, so `leaving` is never null on a real
    // floor-crossing call in practice, but the `leaving !== null` check below
    // stays anyway as the direct source of truth. The condition lives
    // directly in the `if` (rather than a separately-computed boolean
    // dereferenced with `!`) so TypeScript narrows `transitionScreen` and
    // `leaving` on its own (#52 review standards nit). #51 slice 4 (S4-D6):
    // a move by the stairs (between two Stairwell floors, or floor 5 and the
    // Roof Deck) shows no Elevator, whichever way it was made.
    let showTransition = false;
    if (
      transitionScreen !== undefined &&
      leaving !== null &&
      floorsDiffer(ROOM_FLOORS[leaving], ROOM_FLOORS[roomId]) &&
      !isStairsMove(leaving, roomId)
    ) {
      showTransition = true;
      transitionScreen.begin(leaving, roomId);
      // #170 D5: the Elevator takes over from the fade.
      fade?.cancel();
    }
    await enterRoom(roomId, entryTile, token, false, showTransition);
  }

  /** Whether `door` may be used right now: a Session, no transition in flight, and Anthony not in the way. */
  function canUse(door: RoomDoor): boolean {
    // Doors do nothing while inactive (#15 review round 1 D2): before a
    // Session exists, `click-to-move`'s own always-on local movement
    // (`room-framework`/`click-to-move` specs boot with no Session at all)
    // must not actually change the shown Room or show a hint. Nor while a
    // transition is in flight (#170 RT170-10): not even a hint or Anthony.
    if (!active || transitionInFlight) return false;
    // #170 D7 (#51 n3): Anthony's guard applies to every use of a door, the
    // Stairwell keys included, not only to a click on it.
    return !scene.redirectGuardedDoor(door);
  }

  function useDoor(door: RoomDoor, options: ChangeRoomOptions = {}): void {
    if (!canUse(door)) return;
    if (!door.targetRoomId) {
      scene.showLockedHint(door);
      return;
    }
    if (door.floorChoices && pickFloor) {
      void pickThenChange(door, options);
      return;
    }
    void changeRoom(door.targetRoomId, door.entryTile, options);
  }

  /**
   * #170 D9: a door with `floorChoices` asks for a floor first. On a
   * choice, the door must still be usable from the Room it was used in (the
   * Session, that Room, no transition, Anthony re-checked) before the change.
   */
  async function pickThenChange(door: RoomDoor, options: ChangeRoomOptions): Promise<void> {
    const from = current;
    const choice = await pickFloor?.(door);
    if (!choice?.targetRoomId) return;
    if (current !== from || !canUse(door)) return;
    await changeRoom(choice.targetRoomId, choice.entryTile, options);
  }

  // #170 D5: a door reached by a click or Enter fades.
  scene.onDoorReached((door) => useDoor(door, { fade: true }));

  return {
    changeRoom,
    useDoor,
    isTransitioning: () => transitionInFlight,
    async enterSpawnRoom(): Promise<void> {
      active = true;
      // #52 review MINOR: cancel any transitionScreen state first, so a
      // transition superseded by this spawn entry (e.g. a sign-out and a
      // fresh sign-in racing a still-in-flight floor crossing) can never
      // leave the Elevator overlay stuck up over the freshly spawned Room.
      transitionScreen?.cancel();
      // RT170-24: nor a fade, and this entry takes its own token.
      fade?.cancel();
      const token = ++transitionToken;
      // Defensive: the normal path always calls `leaveForSignOut` first, so
      // `current` is already `null` here. If it somehow isn't, leave that
      // Room before forcing the fresh spawn entry.
      if (current) events.emit('room:leave', { roomId: current });
      await enterRoom(SPAWN_ROOM_ID, undefined, token, true);
    },
    leaveForSignOut(): void {
      active = false;
      transitionToken += 1;
      transitionInFlight = false;
      transitionScreen?.cancel();
      // RT170-24: a sign-out mid-fade takes the pointer-blocking layer down.
      fade?.cancel();
      const leaving = current;
      current = null;
      if (leaving) events.emit('room:leave', { roomId: leaving });
    },
    currentRoomId(): RoomId | null {
      return current;
    },
  };
}
