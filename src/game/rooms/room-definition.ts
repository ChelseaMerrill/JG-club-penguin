import type { HexColor, RoomId, Tile } from '../../contracts';

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
 * A non-door clickable target (#16 D5): the Igloo's `trophy-case` and the
 * Roof Deck's `igloo-gear-stall`. `rect` reuses `DoorHotspot`'s shape (stage
 * pixel coordinates); `validate.ts` checks `id` is unique within the Room and
 * `rect` lies within the 1600x900 Stage.
 */
export interface RoomHotspot {
  id: string;
  label: string;
  rect: DoorHotspot;
}

/**
 * DOM-rendered Room signage text (#77 D2): drawn as live `<span>`s in `#ui`
 * (`src/ui/wall-text/wall-text.ts`) instead of baked into the Room's exported
 * PNG, so it always renders sharp with the page's own web fonts regardless of
 * window size -- unlike an SVG-as-image texture, which can't use a web font
 * once flattened to a raster background.
 *
 * `x`/`y` are the Stage pixel anchor the design's own
 * `<text transform="matrix(1 skewY 0 1 x y)" text-anchor="middle">` used, so
 * `wall-text.ts` centres the DOM text on this same anchor both axes. `skewY`
 * is that same matrix's shear factor (the wall's own isometric slant).
 * `maxWidth` is the widest (Stage px) this label may measure before it
 * overflows its backing shape -- see each Room definition's own comment for
 * how it derived that number from the design's hexagon/backing polygon.
 */
export interface RoomWallText {
  id: string;
  text: string;
  x: number;
  y: number;
  colour: HexColor;
  maxWidth: number;
  skewY: number;
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
  /** Non-door clickable targets (#16 D5): e.g. the Igloo's `trophy-case`. */
  hotspots?: readonly RoomHotspot[];
  /** DOM-rendered wall/signage text (#77 D2): e.g. Town Center's Core Values poster. */
  wallText?: readonly RoomWallText[];
}
