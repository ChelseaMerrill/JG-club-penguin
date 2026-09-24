import type { RoomId, Tile } from '../../contracts';

/**
 * A Room's art. `procedural` is drawn by `RoomScene` from `walkable` in the
 * design's room-surface colours until #16 exports the real design art as
 * `image`.
 */
export type RoomBackground = { kind: 'procedural' } | { kind: 'image'; key: string; url: string };

/**
 * Pixel origin: the screen position of tile `{ col: 0, row: 0 }`'s north
 * corner, per `design/build/isolib.js` and the Room design files.
 * `columns`/`rows` size the `walkable` mask. Tile size is not a `RoomGrid`
 * field; it lives in `iso.ts`'s `TILE_WIDTH`/`TILE_HEIGHT`, the single
 * source for tile size shared by every Room (#13 fix 5). Build one with
 * `grid.ts`'s `createGrid` rather than by hand.
 */
export interface RoomGrid {
  origin: { x: number; y: number };
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
 *
 * `entryTile` is a tile in the **target** Room, not this one: the tile a
 * Player arrives on after passing through this door. `validate.ts` checks it
 * is walkable in the target Room's own `walkable` mask.
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

/**
 * A placeholder slot for interactive Furniture. Reserved for the Igloo (#16):
 * Furniture is CONTEXT.md's term for items a Player buys at the Igloo Gear
 * stall and places in their own Igloo, so no other Room populates this.
 */
export interface RoomFurnitureSlot {
  id: string;
  tile: Tile;
}

/**
 * A non-interactive decorative prop position (e.g. Town Center's planter,
 * Dev Pit's desk) — not Furniture, which CONTEXT.md reserves for Igloo items
 * a Player buys and owns (#13 fix 6).
 */
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
