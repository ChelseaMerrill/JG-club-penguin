import { GameObjects, Scene, Scenes, Textures, type Input, type Tweens } from 'phaser';
import {
  DEFAULT_LOOK,
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
import { nearestWalkable } from '../movement/pathfinding';
import { doorApproachTile, npcInteractionTile } from '../movement/targets';
import { createPenguin, type Penguin, type PenguinAnim } from '../penguin';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import { planBackgroundDraw } from './background';
import { exposeRoomDebug, HOOKS_ENABLED, resolveRoomIdFromLocation } from './dev-room-hook';
import {
  depthForTile,
  screenToTile,
  tileCornerToScreen,
  tileToScreen,
  TILE_HEIGHT,
  TILE_WIDTH,
} from './iso';
import { getRoomDefinition } from './registry';
import type { RoomDefinition, RoomDoor, RoomNpcSlot } from './room-definition';

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

/**
 * Placeholder `PenguinState.playerId` for the local Penguin. #28/#43
 * substitute the real signed-in Player id once Presence/broadcast land;
 * #14 only needs a stable local identity.
 */
const LOCAL_PLAYER_ID = 'local';

/**
 * The minimal shape #14 needs from `game.registry.get('player')` (see
 * `src/auth/player.ts`'s `Player`), declared locally so `RoomScene` doesn't
 * import the auth module.
 */
interface RegisteredPlayer {
  look: PenguinLook;
}

/** One entry in an interactive hit-area lookup table (`onPointerDown`). */
interface HitArea<T> {
  object: GameObjects.GameObject;
  data: T;
}

function countActiveTextureListeners(scene: Scene): number {
  const prefix = Textures.Events.ADD_KEY;
  return scene.textures
    .eventNames()
    .filter((name): name is string => typeof name === 'string' && name.startsWith(prefix))
    .reduce((total, name) => total + scene.textures.listenerCount(name), 0);
}

export interface RoomSceneData {
  roomId?: RoomId;
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
 * #14 also spawns the local Penguin at the Room's `spawnTile` and drives
 * click-to-move: a pointer click resolves to a walkable tile (`iso.ts`'s
 * `screenToTile`, snapped to the nearest walkable tile when the click lands
 * off the mask), an NPC's interaction tile, or a door's approach tile, and
 * `LocalPenguinController` walks it there tile by tile.
 */
export class RoomScene extends Scene {
  private roomId: RoomId = SPAWN_ROOM_ID;
  private room: RoomDefinition | null = null;
  private controller: LocalPenguinController | null = null;
  private penguin: Penguin | null = null;
  private currentLook: PenguinLook = DEFAULT_LOOK;
  private currentAnim: PenguinAnim = DEFAULT_LOOK.emote;
  private activeTween: Tweens.Tween | null = null;
  private pendingArrival: (() => void) | null = null;
  private npcHitAreas: HitArea<RoomNpcSlot>[] = [];
  private doorHitAreas: HitArea<RoomDoor>[] = [];
  private npcArrivedLog: string[] = [];
  private doorReachedLog: string[] = [];
  private localPenguinMoveLog: Tile[] = [];

  /** A stable reference so `cleanup` can `off` exactly what `create` `on`'d. */
  private readonly handlePointerDown = (
    pointer: Input.Pointer,
    currentlyOver: GameObjects.GameObject[],
  ): void => {
    this.onPointerDown(pointer, currentlyOver);
  };

  /** A stable reference so a scene restart's fresh `create()` re-registers cleanly. */
  private readonly cleanup = (): void => {
    this.input.off('pointerdown', this.handlePointerDown);
    if (this.activeTween) {
      this.activeTween.stop();
      this.activeTween = null;
    }
    this.penguin?.destroy();
    this.penguin = null;
    this.controller = null;
    this.pendingArrival = null;
  };

  constructor() {
    super(ROOM_SCENE_KEY);
  }

  init(data: RoomSceneData = {}): void {
    this.roomId = data.roomId ?? resolveRoomIdFromLocation(window.location);
    this.room = null;
    this.controller = null;
    this.penguin = null;
    this.activeTween = null;
    this.pendingArrival = null;
    this.npcHitAreas = [];
    this.doorHitAreas = [];
    this.npcArrivedLog = [];
    this.doorReachedLog = [];
    this.localPenguinMoveLog = [];
  }

  preload(): void {
    const room = getRoomDefinition(this.roomId);
    if (room.background.kind === 'image') {
      this.load.image(room.background.key, room.background.url);
    }
  }

  create(): void {
    const room = getRoomDefinition(this.roomId);
    this.room = room;
    this.cameras.main.setBackgroundColor(STAGE_BACKGROUND_COLOR);
    this.cameras.main.setScroll(0, 0);

    this.drawWalls(room);
    this.drawBackground(room);
    this.drawDoors(room);
    this.drawProps(room);
    this.drawFurniture(room);
    this.drawNpcs(room);
    this.spawnLocalPenguin(room);

    this.input.on('pointerdown', this.handlePointerDown);
    this.events.once(Scenes.Events.SHUTDOWN, this.cleanup);

    if (HOOKS_ENABLED) this.publishRoomDebug();
  }

  update(): void {
    if (HOOKS_ENABLED) this.publishRoomDebug();
  }

  private publishRoomDebug(): void {
    exposeRoomDebug({
      roomId: this.roomId,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      localPenguin: this.controller
        ? {
            tile: this.controller.state.tile,
            target: this.controller.state.target,
            anim: this.currentAnim,
            facing: this.controller.state.facing,
            moving: this.controller.isMoving(),
          }
        : undefined,
      textureListenerCount: countActiveTextureListeners(this),
      npcArrivedLog: this.npcArrivedLog,
      doorReachedLog: this.doorReachedLog,
      localPenguinMoveLog: this.localPenguinMoveLog,
      restartRoom: () => this.scene.restart(),
    });
  }

  // --- Local Penguin & click-to-move --------------------------------------

  private spawnLocalPenguin(room: RoomDefinition): void {
    const registered = this.registry.get('player') as RegisteredPlayer | undefined;
    const look = registered?.look ?? DEFAULT_LOOK;
    const spawnPoint = tileToScreen(room.spawnTile, room.grid.origin);

    this.controller = createLocalPenguinController(room.walkable, {
      playerId: LOCAL_PLAYER_ID,
      roomId: room.id,
      tile: room.spawnTile,
    });
    this.currentLook = look;
    this.currentAnim = look.emote;
    this.penguin = createPenguin(this, spawnPoint.x, spawnPoint.y, look);
    this.penguin.container.setDepth(depthForTile(room.spawnTile));
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

  private startMoveTo(target: Tile, onArrive?: () => void): void {
    const controller = this.controller;
    if (!controller) return;

    if (controller.isMoving()) {
      this.snapToNextTileBoundary();
    }

    const path = controller.moveTo(target);
    if (!path) return; // unreachable target (shouldn't happen post-nearestWalkable); ignore the click

    this.pendingArrival = onArrive ?? null;
    this.localPenguinMoveLog.push(target);
    const event: LocalPenguinMoveEvent = { target };
    this.events.emit(LOCAL_PENGUIN_MOVE_EVENT, event);
    this.advanceStep();
  }

  /**
   * Cancels the in-flight tween and snaps the controller/Penguin to the tile
   * it was walking toward, so a new click mid-walk re-routes from that tile
   * boundary rather than the tile the walk started from (#14 D3).
   */
  private snapToNextTileBoundary(): void {
    const controller = this.controller;
    const penguin = this.penguin;
    const room = this.room;
    if (!controller || !penguin || !room) return;

    if (this.activeTween) {
      this.activeTween.stop();
      this.activeTween = null;
    }
    const arrived = controller.arriveAtNextTile();
    const point = tileToScreen(arrived, room.grid.origin);
    penguin.container.setPosition(point.x, point.y);
    penguin.container.setDepth(depthForTile(arrived));
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

  private drawDoors(room: RoomDefinition): void {
    for (const door of room.doors) {
      const centerX = door.hotspot.x + door.hotspot.width / 2;
      const centerY = door.hotspot.y + door.hotspot.height / 2;
      const rect = this.add.rectangle(
        centerX,
        centerY,
        door.hotspot.width,
        door.hotspot.height,
        DOOR_COLOR,
      );
      rect.setStrokeStyle(DOOR_BORDER_WIDTH, DOOR_BORDER_COLOR);
      rect.setDepth(DOOR_DEPTH);
      rect.setInteractive({ useHandCursor: true });
      this.doorHitAreas.push({ object: rect, data: door });
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
