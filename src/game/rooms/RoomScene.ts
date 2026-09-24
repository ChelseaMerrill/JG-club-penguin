import { Scene, Scenes } from 'phaser';
import { SPAWN_ROOM_ID, type RoomId } from '../../contracts';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import { planBackgroundDraw } from './background';
import { exposeRoomDebug, resolveRoomIdFromLocation } from './dev-room-hook';
import { depthForTile, tileCornerToScreen, tileToScreen, TILE_HEIGHT, TILE_WIDTH } from './iso';
import { createPenguin } from '../penguin/penguin-sprite';
import { getRoomDefinition, hasRoomDefinition } from './registry';
import { RoomPenguinView, type PlacePenguin } from './room-penguin-view';
import type { RoomDefinition } from './room-definition';

export const ROOM_SCENE_KEY = 'RoomScene';

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
 * `penguins` (#28) draws the Room channel's Penguins with the #31 renderer.
 * It outlives each `create()`: `showRoom()` restarts this scene for another
 * Room, and `penguins` re-places every Penguin it knows once the new Room is
 * drawn. `whenReady()` resolves after the first `create()`.
 */
export class RoomScene extends Scene {
  private roomId: RoomId = SPAWN_ROOM_ID;
  readonly penguins = new RoomPenguinView();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    super(ROOM_SCENE_KEY);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  init(data: RoomSceneData = {}): void {
    this.roomId = data.roomId ?? resolveRoomIdFromLocation(window.location);
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
   */
  showRoom(roomId: RoomId): boolean {
    if (roomId === this.roomId || !hasRoomDefinition(roomId)) return false;
    this.roomId = roomId;
    this.scene.restart({ roomId } satisfies RoomSceneData);
    return true;
  }

  preload(): void {
    const room = getRoomDefinition(this.roomId);
    if (room.background.kind === 'image') {
      this.load.image(room.background.key, room.background.url);
    }
  }

  create(): void {
    const room = getRoomDefinition(this.roomId);
    this.cameras.main.setBackgroundColor(STAGE_BACKGROUND_COLOR);
    this.cameras.main.setScroll(0, 0);

    this.drawWalls(room);
    this.drawBackground(room);
    this.drawDoors(room);
    this.drawProps(room);
    this.drawFurniture(room);
    this.drawNpcs(room);

    this.penguins.attach(placePenguinsIn(this), room.grid.origin);
    // Phaser destroys this scene's Penguins with its display list on shutdown.
    this.events.once(Scenes.Events.SHUTDOWN, () => this.penguins.detach());

    exposeRoomDebug({
      roomId: this.roomId,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
    });
    this.resolveReady();
  }

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
      this.add.circle(point.x, point.y, NPC_RADIUS, NPC_COLOR).setDepth(depth);
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

/** Places #31 Penguins (figure, name tag, idle animation) in `scene`. */
function placePenguinsIn(scene: Scene): PlacePenguin {
  return (look, point, depth, facing) => {
    const penguin = createPenguin(scene, point.x, point.y, look, { facing });
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
