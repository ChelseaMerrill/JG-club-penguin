import { Data, GameObjects, Scene, Scenes, type Input, type Tweens } from 'phaser';
import {
  gameEvents,
  SPAWN_ROOM_ID,
  type PenguinLook,
  type RoomId,
  type Tile,
} from '../../contracts';
import {
  createLocalPenguinController,
  facingForStep,
  type LocalPenguinController,
} from '../movement/controller';
import { nearestReachable, nearestWalkable, tilesEqual } from '../movement/pathfinding';
import {
  resolveRegisteredLook,
  resolveRegisteredPlayerId,
  type RegisteredPlayer,
} from '../movement/registered-player';
import { doorApproachTile, npcInteractionTile } from '../movement/targets';
import { createPenguin, type Penguin, type PenguinAnim } from '../penguin';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import { planBackgroundDraw } from './background';
import {
  countActiveTextureListeners,
  exposeRoomDebug,
  HOOKS_ENABLED,
  resolveRoomIdFromLocation,
} from './dev-room-hook';
import {
  depthForTile,
  screenToTile,
  tileCornerToScreen,
  tileToScreen,
  TILE_HEIGHT,
  TILE_WIDTH,
} from './iso';
import { getRoomDefinition, hasRoomDefinition } from './registry';
import type { RoomDefinition, RoomDoor, RoomNpcSlot } from './room-definition';
import { RoomPenguinView, type PlacePenguin } from './room-penguin-view';

export const ROOM_SCENE_KEY = 'RoomScene';

/**
 * Scene-local event (#14 D5, not a contract event): fired whenever a walk
 * starts or a new click mid-walk re-routes. #43 broadcasts `move` from it.
 */
export const LOCAL_PENGUIN_MOVE_EVENT = 'local-penguin:move';
/**
 * Scene-local event (#14 D5, not a contract event): fired on arrival at a
 * door's approach tile. #15 calls `changeRoom(door.targetRoomId)` from it.
 * A disabled door (`targetRoomId: null`) still fires this; #15 owns the
 * "coming soon" handling for that case.
 */
export const DOOR_REACHED_EVENT = 'door:reached';

export interface LocalPenguinMoveEvent {
  target: Tile;
}

export interface DoorReachedEvent {
  door: RoomDoor;
}

// Room-surface colours from `design/design_handoff_club_jenguin/README.md`'s
// Design Tokens list (`#0a0b0d`, `#121316`, `#17181b`, `#1c1e21`).
const FLOOR_COLOR_A = 0x17181b;
const FLOOR_COLOR_B = 0x1c1e21;
const WALL_LEFT_COLOR = 0x121316;
const WALL_RIGHT_COLOR = 0x17181b;
const DOOR_COLOR = 0x0a0b0d;
const DOOR_BORDER_COLOR = 0x00bdff;
const DOOR_BORDER_WIDTH = 2;

// The Stage's letterbox colour behind the Room (`design`'s `#0E1013` sky/base).
const STAGE_BACKGROUND_COLOR = '#0e1013';

// Draw depths, lowest-first. The exported design image (#13 D3) sits below
// everything, including the procedural walls; doors sit above the floor but
// below their own label.
const IMAGE_BACKGROUND_DEPTH = -2;
const WALL_DEPTH = -1;
const FLOOR_DEPTH = -1;
const DOOR_DEPTH = 0;
const DOOR_LABEL_DEPTH = 1;

const LABEL_FONT_FAMILY = 'sans-serif';
const LABEL_TEXT_COLOR = '#F4F4F4';
const DOOR_LABEL_FONT_SIZE = '14px';
const NPC_LABEL_FONT_SIZE = '12px';
const NPC_LABEL_OFFSET_Y = -30;

const NPC_RADIUS = 18;
const NPC_COLOR = 0x00bdff;

const FURNITURE_WIDTH = 40;
const FURNITURE_HEIGHT = 28;
const FURNITURE_COLOR = 0x0c4b5f;

const PROP_WIDTH = 32;
const PROP_HEIGHT = 32;
const PROP_COLOR = 0x3a3d42;

/** Tiles per second the local Penguin walks at (#14 D3). */
const TILE_SPEED = 4;
const TILE_STEP_MS = 1000 / TILE_SPEED;

/** The registry key #14/`src/auth/player.ts`'s `bindPlayer` sets/removes. */
const PLAYER_REGISTRY_KEY = 'player';

/** The `Container` name `placePenguinsIn` gives each remote Penguin (#28). */
const REMOTE_PENGUIN_NAME = 'remote-penguin';

/** One entry in an interactive hit-area lookup table (`onPointerDown`). */
interface HitArea<T> {
  object: GameObjects.GameObject;
  data: T;
}

/** A click's target, queued mid-walk rather than applied immediately (#14 review fix 3). */
interface QueuedMove {
  target: Tile;
  onArrive?: () => void;
}

export interface RoomSceneData {
  roomId?: RoomId;
  /**
   * The tile to spawn the local Penguin on (#15's door handoff); falls back
   * to `room.spawnTile` when absent, as at the initial boot spawn.
   */
  entryTile?: Tile;
}

/**
 * Loads and renders any `RoomDefinition` by id. One `RoomScene` fills the
 * fixed 1600x900 stage with no camera scrolling (#13 D2): `create()`
 * explicitly pins the camera scroll to `(0, 0)` rather than relying on a
 * fresh Scene's default (also `0`), so scroll stays correct even if a later
 * change nudges the camera; `cameras.main.scrollX/scrollY` are how
 * `exposeRoomDebug` (and `e2e/room-framework.spec.ts`) confirm it.
 *
 * The room id comes from `init(data)` when the caller supplies one (future
 * Room-switching, #15), and otherwise from the `?room=` dev/e2e hook, which
 * itself falls back to `SPAWN_ROOM_ID`.
 *
 * #14 also spawns the local Penguin at the Room's `spawnTile` (or `data`'s
 * `entryTile`, #15) and drives click-to-move: a pointer click resolves to a
 * walkable, connectivity-checked tile (`iso.ts`'s `screenToTile`, snapped to
 * the nearest walkable tile when the click lands off the mask, then to the
 * nearest tile actually reachable from the Penguin's own tile), an NPC's
 * interaction tile, or a door's approach tile, and `LocalPenguinController`
 * walks it there tile by tile.
 *
 * A future consumer that calls `scene.start(ROOM_SCENE_KEY, data)` or
 * `scene.restart(data)` (#15) should treat Phaser's `Scenes.Events.CREATE`
 * (fired once `create()` finishes) as the "Room is ready" signal, not the
 * synchronous return of `start`/`restart` itself. Listeners for
 * `LOCAL_PENGUIN_MOVE_EVENT`/`DOOR_REACHED_EVENT` should be attached to
 * `scene.events` exactly once, right after the Scene is first created: the
 * same `RoomScene` instance (and its `events` emitter) is reused across a
 * `scene.restart()`, so a listener attached once keeps receiving events
 * after every later restart without needing to be re-attached.
 *
 * `penguins` (#28) draws the Room channel's *remote* Penguins with the #31
 * renderer; the local Penguin is this scene's own (#14), not the view's.
 * `penguins` outlives each `create()`: `showRoom()` restarts this scene for
 * another Room, and `penguins` re-places every Penguin it knows once the new
 * Room is drawn. Both sort with `depthForTile`. `whenReady()` resolves after
 * the first `create()`.
 */
export class RoomScene extends Scene {
  private roomId: RoomId = SPAWN_ROOM_ID;
  readonly penguins = new RoomPenguinView();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private entryTile: Tile | undefined;
  private room: RoomDefinition | null = null;
  private controller: LocalPenguinController | null = null;
  private penguin: Penguin | null = null;
  private currentLook: PenguinLook = resolveRegisteredLook(undefined);
  private currentAnim: PenguinAnim = this.currentLook.emote;
  private activeTween: Tweens.Tween | null = null;
  private pendingArrival: (() => void) | null = null;
  private queuedMove: QueuedMove | null = null;
  private npcHitAreas: HitArea<RoomNpcSlot>[] = [];
  private doorHitAreas: HitArea<RoomDoor>[] = [];
  private npcArrivedLog: string[] = [];
  private doorReachedLog: string[] = [];
  private localPenguinMoveLog: Tile[] = [];
  private debugPenguins: Penguin[] = [];
  /** Persists across restarts (never reset in `init()`); see `restartCount` on `RoomDebugInfo`. */
  private restartCount = 0;

  /** A stable reference so `cleanup` can `off` exactly what `create` `on`'d. */
  private readonly handlePointerDown = (
    pointer: Input.Pointer,
    currentlyOver: GameObjects.GameObject[],
  ): void => {
    this.onPointerDown(pointer, currentlyOver);
  };

  /**
   * Fired the very first time the registry's `player` key is ever set.
   * Phaser's `DataManager` only emits a generic `setdata` (no per-key
   * variant) on a key's first `set`; filtered to `player` here. Sign-in
   * normally arrives this way, since `bindPlayer` (`main.ts`) calls
   * `registry.remove('player')` on sign-out, which makes the *next*
   * sign-in "first" again (#14 review fix 1).
   */
  private readonly handleRegistrySetData = (_parent: unknown, key: string): void => {
    if (key === PLAYER_REGISTRY_KEY) this.applyRegisteredPlayer();
  };

  /** Fired on every later `player` update, once the key already exists (review fix 1). */
  private readonly handleRegistryPlayerChanged = (): void => {
    this.applyRegisteredPlayer();
  };

  /** A stable reference so a scene restart's fresh `create()` re-registers cleanly. */
  private readonly cleanup = (): void => {
    this.input.off('pointerdown', this.handlePointerDown);
    this.registry.events.off(Data.Events.SET_DATA, this.handleRegistrySetData);
    this.registry.events.off(
      Data.Events.CHANGE_DATA_KEY + PLAYER_REGISTRY_KEY,
      this.handleRegistryPlayerChanged,
    );
    if (this.activeTween) {
      this.activeTween.stop();
      this.activeTween = null;
    }
    this.penguin?.destroy();
    this.penguin = null;
    this.controller = null;
    this.pendingArrival = null;
    this.queuedMove = null;
    this.debugPenguins.forEach((debugPenguin) => debugPenguin.destroy());
    this.debugPenguins = [];
  };

  constructor() {
    super(ROOM_SCENE_KEY);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  init(data: RoomSceneData = {}): void {
    this.roomId = data.roomId ?? resolveRoomIdFromLocation(window.location);
    this.entryTile = data.entryTile;
    this.room = null;
    this.controller = null;
    this.penguin = null;
    this.activeTween = null;
    this.pendingArrival = null;
    this.queuedMove = null;
    this.npcHitAreas = [];
    this.doorHitAreas = [];
    this.npcArrivedLog = [];
    this.doorReachedLog = [];
    this.localPenguinMoveLog = [];
    this.debugPenguins = [];
  }

  /** Resolves once the first `create()` has run. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** The Room currently shown (or being restarted into). */
  get currentRoomId(): RoomId {
    return this.roomId;
  }

  /**
   * Restarts this scene to show `roomId` (a Room change). A no-op for the
   * Room already shown, and for a Room with no `RoomDefinition` yet (#16),
   * which leaves the current Room's art on screen. Returns whether it switched.
   * The local Penguin spawns at `entryTile` when given, else at the Room's
   * `spawnTile` (#14's `init`).
   */
  showRoom(roomId: RoomId, entryTile?: Tile): boolean {
    if (roomId === this.roomId || !hasRoomDefinition(roomId)) return false;
    this.roomId = roomId;
    this.scene.restart({ roomId, entryTile } satisfies RoomSceneData);
    return true;
  }

  preload(): void {
    const room = getRoomDefinition(this.roomId);
    if (room.background.kind === 'image') {
      this.load.image(room.background.key, room.background.url);
    }
  }

  create(): void {
    this.restartCount += 1;

    const room = getRoomDefinition(this.roomId);
    this.room = room;
    this.cameras.main.setBackgroundColor(STAGE_BACKGROUND_COLOR);
    this.cameras.main.setScroll(0, 0);

    // The exported design art already draws the walls and floor (#16 fix 2);
    // the procedural walls are only for the `procedural` fallback background.
    if (room.background.kind !== 'image') {
      this.drawWalls(room);
    }
    this.drawBackground(room);
    this.drawDoors(room);
    this.drawProps(room);
    this.drawFurniture(room);
    this.drawNpcs(room);
    this.spawnLocalPenguin(room);

    this.input.on('pointerdown', this.handlePointerDown);
    this.registry.events.on(Data.Events.SET_DATA, this.handleRegistrySetData);
    this.registry.events.on(
      Data.Events.CHANGE_DATA_KEY + PLAYER_REGISTRY_KEY,
      this.handleRegistryPlayerChanged,
    );
    // `cleanup` destroys only #14's own Penguins (local and debug).
    this.events.once(Scenes.Events.SHUTDOWN, this.cleanup);

    // The remote Penguins (#28). Phaser destroys them with its display list
    // on shutdown; `detach()` only forgets them, so nothing is destroyed twice.
    this.penguins.attach(placePenguinsIn(this), room.grid.origin);
    this.events.once(Scenes.Events.SHUTDOWN, () => this.penguins.detach());

    if (HOOKS_ENABLED) this.publishRoomDebug();
    this.resolveReady();
  }

  update(): void {
    if (HOOKS_ENABLED) this.publishRoomDebug();
  }

  private publishRoomDebug(): void {
    const controller = this.controller;
    exposeRoomDebug({
      roomId: this.roomId,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      localPenguin: controller
        ? {
            tile: controller.state.tile,
            target: controller.state.target,
            anim: this.currentAnim,
            facing: controller.state.facing,
            moving: controller.isMoving(),
            flipX: this.penguinSprite()?.flipX ?? false,
            lookName: this.currentLook.name,
            lookBody: this.currentLook.body,
            playerId: controller.state.playerId,
          }
        : undefined,
      textureListenerCount: countActiveTextureListeners(this),
      npcArrivedLog: this.npcArrivedLog,
      doorReachedLog: this.doorReachedLog,
      localPenguinMoveLog: this.localPenguinMoveLog,
      restartRoom: () => this.scene.restart(),
      restartCount: this.restartCount,
      penguinCount: this.countPenguinContainers((name) => name !== REMOTE_PENGUIN_NAME),
      remotePenguinCount: this.countPenguinContainers((name) => name === REMOTE_PENGUIN_NAME),
      setRegisteredPlayer: (player) => this.registry.set(PLAYER_REGISTRY_KEY, player),
      spawnDebugPenguin: (tile, look) => this.spawnDebugPenguin(tile, look),
    });
  }

  /** The Penguin's rendered `Sprite`, reached through its `container` (#14 review fix 8's `flipX` check). */
  private penguinSprite(): GameObjects.Sprite | undefined {
    return this.penguin?.container.list.find(
      (child): child is GameObjects.Sprite => child instanceof GameObjects.Sprite,
    );
  }

  /**
   * Penguin `Container`s in the Scene's display list whose name matches
   * (#14 review fix 8's restart-leak check). Remote Penguins (#28) are named
   * `REMOTE_PENGUIN_NAME`; the local and debug Penguins are unnamed.
   */
  private countPenguinContainers(matches: (name: string) => boolean): number {
    return this.children.list.filter(
      (child) => child instanceof GameObjects.Container && matches(child.name),
    ).length;
  }

  // --- Local Penguin & click-to-move --------------------------------------

  /**
   * Shows (or clears, given `null`) a chat speech bubble above the local
   * Penguin (#44). The local Penguin lives here (#14), not in `penguins`, so
   * this replaces `RoomPenguinView.sayLocal`. Returns `false` while no local
   * Penguin is spawned.
   */
  sayLocal(text: string | null): boolean {
    if (!this.penguin) return false;
    this.penguin.say(text);
    return true;
  }

  private spawnLocalPenguin(room: RoomDefinition): void {
    const registered = this.registry.get(PLAYER_REGISTRY_KEY) as RegisteredPlayer | undefined;
    const look = resolveRegisteredLook(registered);
    const playerId = resolveRegisteredPlayerId(registered);
    const spawnTile = this.entryTile ?? room.spawnTile;
    const spawnPoint = tileToScreen(spawnTile, room.grid.origin);

    this.controller = createLocalPenguinController(room.walkable, {
      playerId,
      roomId: room.id,
      tile: spawnTile,
    });
    this.currentLook = look;
    this.currentAnim = look.emote;
    this.penguin = createPenguin(this, spawnPoint.x, spawnPoint.y, look);
    this.penguin.container.setDepth(depthForTile(spawnTile));
  }

  /** Re-applies the registered Player's look/id to the already-spawned Penguin (#14 review fixes 1 and 4). */
  private applyRegisteredPlayer(): void {
    const controller = this.controller;
    const registered = this.registry.get(PLAYER_REGISTRY_KEY) as RegisteredPlayer | undefined;
    const look = resolveRegisteredLook(registered);

    this.currentLook = look;
    if (controller) {
      controller.state.playerId = resolveRegisteredPlayerId(registered);
      if (!controller.isMoving()) this.currentAnim = look.emote;
    }
    this.penguin?.setLook(look);
  }

  private onPointerDown(pointer: Input.Pointer, currentlyOver: GameObjects.GameObject[]): void {
    const room = this.room;
    if (!room) return;

    const npcHit = this.npcHitAreas.find((hit) => currentlyOver.includes(hit.object));
    if (npcHit) {
      this.handleNpcClick(npcHit.data, room);
      return;
    }

    const doorHit = this.doorHitAreas.find((hit) => currentlyOver.includes(hit.object));
    if (doorHit) {
      this.handleDoorClick(doorHit.data, room);
      return;
    }

    const tile = screenToTile({ x: pointer.x, y: pointer.y }, room.grid.origin);
    this.handleTileClick(tile, room);
  }

  private handleTileClick(tile: Tile, room: RoomDefinition): void {
    this.startMoveTo(nearestWalkable(room.walkable, tile));
  }

  private handleNpcClick(npc: RoomNpcSlot, room: RoomDefinition): void {
    const target = npcInteractionTile(room.walkable, npc);
    this.startMoveTo(target, () => {
      this.npcArrivedLog.push(npc.npcId);
      gameEvents.emit('npc:arrived', { npcId: npc.npcId });
    });
  }

  private handleDoorClick(door: RoomDoor, room: RoomDefinition): void {
    const target = doorApproachTile(room.walkable, door, room.grid.origin);
    this.startMoveTo(target, () => {
      this.doorReachedLog.push(door.label);
      const event: DoorReachedEvent = { door };
      this.events.emit(DOOR_REACHED_EVENT, event);
    });
  }

  /**
   * Starts walking toward `target` immediately, or — mid-walk — queues it
   * rather than snapping the Penguin forward (#14 review fix 3): the queued
   * move is applied from `advanceStep`'s tween `onComplete`, once the
   * current step actually reaches its tile, so walking speed stays a steady
   * 4 tiles/s instead of jumping ahead on every re-route click.
   */
  private startMoveTo(target: Tile, onArrive?: () => void): void {
    const controller = this.controller;
    if (!controller) return;

    if (controller.isMoving()) {
      this.queuedMove = { target, onArrive };
      return;
    }

    this.applyMoveTo(target, onArrive);
  }

  /**
   * Resolves `target` against the Penguin's current tile via
   * `nearestReachable` (#14 review fix 2) and either starts walking there,
   * or stops cleanly with no path logged/emitted: either because the
   * resolved target already *is* the tile the Penguin stands on (review fix
   * 6's own-tile click, and fix 2's case where nothing reachable is any
   * closer to an unreachable target than staying put), or — defensively,
   * since `nearestReachable` only ever returns a tile connected to the
   * Penguin's own tile — because `moveTo` still failed.
   */
  private applyMoveTo(target: Tile, onArrive?: () => void): void {
    const controller = this.controller;
    const room = this.room;
    if (!controller || !room) return;

    const reachableTarget = nearestReachable(room.walkable, controller.state.tile, target);

    if (tilesEqual(reachableTarget, controller.state.tile)) {
      this.stopCleanly(controller);
      // Already standing on an NPC's interaction tile or a door's approach
      // tile: that still counts as arriving, so clicking an NPC you're next
      // to opens its dialog (#36) and clicking the door you're at uses it
      // (#15). An unreachable target that merely resolves to here doesn't.
      if (onArrive && tilesEqual(target, controller.state.tile)) onArrive();
      return;
    }

    const path = controller.moveTo(reachableTarget);
    if (!path) {
      this.stopCleanly(controller);
      return;
    }

    this.pendingArrival = onArrive ?? null;
    this.localPenguinMoveLog.push(reachableTarget);
    const event: LocalPenguinMoveEvent = { target: reachableTarget };
    this.events.emit(LOCAL_PENGUIN_MOVE_EVENT, event);
    this.advanceStep();
  }

  /** Cancels any active path/target and returns the Penguin to idle in place. */
  private stopCleanly(controller: LocalPenguinController): void {
    controller.stop();
    this.penguin?.idle();
    this.currentAnim = this.currentLook.emote;
    this.pendingArrival = null;
  }

  private spawnDebugPenguin(tile: Tile, look: PenguinLook): void {
    const room = this.room;
    if (!room) return;
    const point = tileToScreen(tile, room.grid.origin);
    const debugPenguin = createPenguin(this, point.x, point.y, look);
    debugPenguin.container.setDepth(depthForTile(tile));
    this.debugPenguins.push(debugPenguin);
  }

  private advanceStep(): void {
    const controller = this.controller;
    const penguin = this.penguin;
    const room = this.room;
    if (!controller || !penguin || !room) return;

    const next = controller.nextTile();
    if (!next) {
      penguin.idle();
      this.currentAnim = this.currentLook.emote;
      const arrive = this.pendingArrival;
      this.pendingArrival = null;
      arrive?.();
      return;
    }

    const from = controller.state.tile;
    const facing = facingForStep(from, next);
    controller.setFacing(facing);
    penguin.setFacing(facing);
    penguin.walk();
    this.currentAnim = 'WALK';

    const toPoint = tileToScreen(next, room.grid.origin);

    this.activeTween = this.tweens.add({
      targets: penguin.container,
      x: toPoint.x,
      y: toPoint.y,
      duration: TILE_STEP_MS,
      onUpdate: (tween: Tweens.Tween) => {
        const t = tween.progress;
        const fractional: Tile = {
          col: from.col + (next.col - from.col) * t,
          row: from.row + (next.row - from.row) * t,
        };
        penguin.container.setDepth(depthForTile(fractional));
      },
      onComplete: () => {
        this.activeTween = null;
        controller.arriveAtNextTile();

        const queued = this.queuedMove;
        if (queued) {
          this.queuedMove = null;
          this.applyMoveTo(queued.target, queued.onArrive);
          return;
        }

        this.advanceStep();
      },
    });
  }

  // --- Drawing -------------------------------------------------------------

  /** Walls meet at tile corners, so they use `tileCornerToScreen`, not the floor's tile centres. */
  private drawWalls(room: RoomDefinition): void {
    const { origin, columns, rows } = room.grid;
    const north = tileCornerToScreen({ col: 0, row: 0 }, origin);
    const west = tileCornerToScreen({ col: 0, row: rows }, origin);
    const east = tileCornerToScreen({ col: columns, row: 0 }, origin);

    const graphics = this.add.graphics();
    graphics.fillStyle(WALL_LEFT_COLOR, 1);
    graphics.fillPoints([{ x: west.x, y: 0 }, { x: north.x, y: 0 }, north, west], true);
    graphics.fillStyle(WALL_RIGHT_COLOR, 1);
    graphics.fillPoints([{ x: north.x, y: 0 }, { x: east.x, y: 0 }, east, north], true);
    graphics.setDepth(WALL_DEPTH);
  }

  /**
   * Draws the Room's `background` (#13 D3): the exported design image, sized
   * to the whole 1600x900 stage at the lowest depth, when `kind === 'image'`
   * (preloaded in `preload()`); otherwise the procedural isometric floor.
   */
  private drawBackground(room: RoomDefinition): void {
    const plan = planBackgroundDraw(room.background);
    if (plan.kind === 'image') {
      this.add
        .image(0, 0, plan.key)
        .setOrigin(0, 0)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(IMAGE_BACKGROUND_DEPTH);
      return;
    }
    this.drawFloor(room);
  }

  /** Floor tiles are drawn around each tile's centre (`tileToScreen`), not its corner. */
  private drawFloor(room: RoomDefinition): void {
    const { origin, columns, rows } = room.grid;
    const graphics = this.add.graphics();
    graphics.setDepth(FLOOR_DEPTH);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        if (room.walkable[row]?.[col] !== true) continue;
        const center = tileToScreen({ col, row }, origin);
        graphics.fillStyle((row + col) % 2 === 0 ? FLOOR_COLOR_A : FLOOR_COLOR_B, 1);
        graphics.fillPoints(
          [
            { x: center.x, y: center.y - TILE_HEIGHT / 2 },
            { x: center.x + TILE_WIDTH / 2, y: center.y },
            { x: center.x, y: center.y + TILE_HEIGHT / 2 },
            { x: center.x - TILE_WIDTH / 2, y: center.y },
          ],
          true,
        );
      }
    }
  }

  /**
   * Over the exported design art (#16 fix 2), the art itself already draws
   * every door sign/doorway, so a door only needs an invisible interactive
   * hit area for its click, not the procedural rectangle-and-label the
   * `procedural` fallback background still draws.
   */
  private drawDoors(room: RoomDefinition): void {
    const isImageBackground = room.background.kind === 'image';
    for (const door of room.doors) {
      const centerX = door.hotspot.x + door.hotspot.width / 2;
      const centerY = door.hotspot.y + door.hotspot.height / 2;

      // Over exported design art the door is already drawn, so the hit area
      // is an invisible Zone (#16). Not an alpha-0 shape: Phaser drops
      // objects that won't render from input hit-testing, so an alpha-0
      // rectangle can never be clicked.
      if (isImageBackground) {
        const zone = this.add
          .zone(centerX, centerY, door.hotspot.width, door.hotspot.height)
          .setDepth(DOOR_DEPTH)
          .setInteractive({ useHandCursor: true });
        this.doorHitAreas.push({ object: zone, data: door });
        continue;
      }

      // Procedural rough art gets the outlined rectangle and label.
      const rect = this.add.rectangle(
        centerX,
        centerY,
        door.hotspot.width,
        door.hotspot.height,
        DOOR_COLOR,
      );
      rect.setDepth(DOOR_DEPTH);
      rect.setInteractive({ useHandCursor: true });
      this.doorHitAreas.push({ object: rect, data: door });
      rect.setStrokeStyle(DOOR_BORDER_WIDTH, DOOR_BORDER_COLOR);
      this.add
        .text(centerX, centerY, door.label, {
          fontFamily: LABEL_FONT_FAMILY,
          fontSize: DOOR_LABEL_FONT_SIZE,
          color: LABEL_TEXT_COLOR,
        })
        .setOrigin(0.5)
        .setDepth(DOOR_LABEL_DEPTH);
    }
  }

  /** Non-interactive decorative placeholders (e.g. a planter, a desk); Furniture is Igloo-only (#16). */
  private drawProps(room: RoomDefinition): void {
    for (const prop of room.props ?? []) {
      const point = tileToScreen(prop.tile, room.grid.origin);
      this.add
        .rectangle(point.x, point.y, PROP_WIDTH, PROP_HEIGHT, PROP_COLOR)
        .setDepth(depthForTile(prop.tile));
    }
  }

  private drawFurniture(room: RoomDefinition): void {
    for (const slot of room.furnitureSlots ?? []) {
      const point = tileToScreen(slot.tile, room.grid.origin);
      this.add
        .rectangle(point.x, point.y, FURNITURE_WIDTH, FURNITURE_HEIGHT, FURNITURE_COLOR)
        .setDepth(depthForTile(slot.tile));
    }
  }

  private drawNpcs(room: RoomDefinition): void {
    for (const slot of room.npcSlots) {
      const point = tileToScreen(slot.tile, room.grid.origin);
      const depth = depthForTile(slot.tile);
      const circle = this.add.circle(point.x, point.y, NPC_RADIUS, NPC_COLOR).setDepth(depth);
      circle.setInteractive({ useHandCursor: true });
      this.npcHitAreas.push({ object: circle, data: slot });
      this.add
        .text(point.x, point.y + NPC_LABEL_OFFSET_Y, slot.npcId, {
          fontFamily: LABEL_FONT_FAMILY,
          fontSize: NPC_LABEL_FONT_SIZE,
          color: LABEL_TEXT_COLOR,
        })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    }
  }
}

/**
 * Places #31 Penguins (figure, name tag, idle animation) in `scene`, for
 * `RoomPenguinView`'s remote Penguins. Each is named `REMOTE_PENGUIN_NAME`
 * so the debug hook can count remote and local Penguins apart.
 */
function placePenguinsIn(scene: Scene): PlacePenguin {
  return (look, point, depth, facing) => {
    const penguin = createPenguin(scene, point.x, point.y, look, { facing });
    penguin.container.setName(REMOTE_PENGUIN_NAME);
    penguin.container.setDepth(depth);
    return {
      setLook: (next) => penguin.setLook(next),
      setFacing: (next) => penguin.setFacing(next),
      moveTo: (next, nextDepth) => {
        penguin.container.setPosition(next.x, next.y);
        penguin.container.setDepth(nextDepth);
      },
      say: (text) => penguin.say(text),
      destroy: () => penguin.destroy(),
    };
  };
}
