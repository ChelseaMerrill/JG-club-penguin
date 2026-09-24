import type { RoomId, Tile } from '../../contracts';

/**
 * A Room's art. `procedural` is drawn by `RoomScene` from `walkable` in the
 * design's room-surface colours until #16 exports the real design art as
 * `image`.
 */
export type RoomBackground = { kind: 'procedural' } | { kind: 'image'; key: string; url: string };

/**
 * Pixel origin (the screen position of tile `{ col: 0, row: 0 }`'s north
 * corner) plus the 2:1 tile size, per `design/build/isolib.js` and the Room
 * design files. `columns`/`rows` size the `walkable` mask.
 */
export interface RoomGrid {
  origin: { x: number; y: number };
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
}

/** The clickable/drawable region for a door sign, in stage pixel coordinates. */
export interface DoorHotspot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `targetRoomId: null` means the door is disabled (its destination Room has
 * no `RoomDefinition` yet); `validate.ts` requires a non-null target to name
 * a Room that is actually registered.
 */
export interface RoomDoor {
  label: string;
  hotspot: DoorHotspot;
  targetRoomId: RoomId | null;
  entryTile: Tile;
}

/** A placeholder slot for an NPC (#14, #36 fill in behavior). */
export interface RoomNpcSlot {
  npcId: string;
  tile: Tile;
}

/** A placeholder slot for interactive furniture. */
export interface RoomFurnitureSlot {
  id: string;
  tile: Tile;
}

/** A non-interactive decorative prop position. */
export interface RoomProp {
  id: string;
  tile: Tile;
}

/**
 * A Room is data: everything `RoomScene` needs to render and validate one
 * Room, and everything #14/#15/#16/#28 need to place Penguins, NPCs and
 * furniture in it.
 */
export interface RoomDefinition {
  id: RoomId;
  title: string;
  subtitle: string;
  background: RoomBackground;
  grid: RoomGrid;
  /** `walkable[row][col]`; `true` where a Penguin may stand. */
  walkable: readonly (readonly boolean[])[];
  doors: readonly RoomDoor[];
  spawnTile: Tile;
  npcSlots: readonly RoomNpcSlot[];
  furnitureSlots?: readonly RoomFurnitureSlot[];
  props?: readonly RoomProp[];
}
