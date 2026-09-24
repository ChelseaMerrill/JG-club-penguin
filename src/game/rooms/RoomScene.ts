import { Scene } from 'phaser';
import { SPAWN_ROOM_ID, type RoomId } from '../../contracts';
import { exposeRoomDebug, resolveRoomIdFromLocation } from './dev-room-hook';
import { depthForTile, tileToScreen } from './iso';
import { getRoomDefinition } from './registry';
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

export interface RoomSceneData {
  roomId?: RoomId;
}

/**
 * Loads and renders any `RoomDefinition` by id. One `RoomScene` fills the
 * fixed 1600x900 stage with no camera scrolling (#13 D2): it never moves its
 * own camera, so `cameras.main.scrollX/scrollY` stay at their Phaser default
 * of 0.
 *
 * The room id comes from `init(data)` when the caller supplies one (future
 * Room-switching, #15), and otherwise from the `?room=` dev/e2e hook, which
 * itself falls back to `SPAWN_ROOM_ID`.
 */
export class RoomScene extends Scene {
  private roomId: RoomId = SPAWN_ROOM_ID;

  constructor() {
    super(ROOM_SCENE_KEY);
  }

  init(data: RoomSceneData = {}): void {
    this.roomId = data.roomId ?? resolveRoomIdFromLocation(window.location);
  }

  create(): void {
    const room = getRoomDefinition(this.roomId);
    this.cameras.main.setBackgroundColor('#0e1013');
    this.cameras.main.setScroll(0, 0);

    this.drawWalls(room);
    this.drawFloor(room);
    this.drawDoors(room);
    this.drawFurniture(room);
    this.drawNpcs(room);

    exposeRoomDebug({
      roomId: this.roomId,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
    });
  }

  private drawWalls(room: RoomDefinition): void {
    const { origin, columns, rows } = room.grid;
    const north = tileToScreen({ col: 0, row: 0 }, origin);
    const west = tileToScreen({ col: 0, row: rows }, origin);
    const east = tileToScreen({ col: columns, row: 0 }, origin);

    const graphics = this.add.graphics();
    graphics.fillStyle(WALL_LEFT_COLOR, 1);
    graphics.fillPoints([{ x: west.x, y: 0 }, { x: north.x, y: 0 }, north, west], true);
    graphics.fillStyle(WALL_RIGHT_COLOR, 1);
    graphics.fillPoints([{ x: north.x, y: 0 }, { x: east.x, y: 0 }, east, north], true);
    graphics.setDepth(-1);
  }

  private drawFloor(room: RoomDefinition): void {
    const { origin, tileWidth, tileHeight, columns, rows } = room.grid;
    const graphics = this.add.graphics();
    graphics.setDepth(-1);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        if (room.walkable[row]?.[col] !== true) continue;
        const center = tileToScreen({ col, row }, origin);
        graphics.fillStyle((row + col) % 2 === 0 ? FLOOR_COLOR_A : FLOOR_COLOR_B, 1);
        graphics.fillPoints(
          [
            { x: center.x, y: center.y - tileHeight / 2 },
            { x: center.x + tileWidth / 2, y: center.y },
            { x: center.x, y: center.y + tileHeight / 2 },
            { x: center.x - tileWidth / 2, y: center.y },
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
      rect.setStrokeStyle(2, DOOR_BORDER_COLOR);
      rect.setDepth(0);
      this.add
        .text(centerX, centerY, door.label, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#F4F4F4',
        })
        .setOrigin(0.5)
        .setDepth(1);
    }
  }

  private drawFurniture(room: RoomDefinition): void {
    for (const slot of room.furnitureSlots ?? []) {
      const point = tileToScreen(slot.tile, room.grid.origin);
      this.add.rectangle(point.x, point.y, 40, 28, 0x0c4b5f).setDepth(depthForTile(slot.tile));
    }
  }

  private drawNpcs(room: RoomDefinition): void {
    for (const slot of room.npcSlots) {
      const point = tileToScreen(slot.tile, room.grid.origin);
      const depth = depthForTile(slot.tile);
      this.add.circle(point.x, point.y, 18, 0x00bdff).setDepth(depth);
      this.add
        .text(point.x, point.y - 30, slot.npcId, {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#F4F4F4',
        })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    }
  }
}
