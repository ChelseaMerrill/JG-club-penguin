import type { RoomGrid } from './room-definition';

/**
 * Builds a `RoomGrid` of `columns` x `rows` tiles anchored at `origin` (the
 * screen position of tile `{ col: 0, row: 0 }`'s north corner). Tile size is
 * not part of a `RoomGrid`; it comes from `iso.ts`'s `TILE_WIDTH`/
 * `TILE_HEIGHT`, the single source for tile size (#13 fix 5). Shared by every
 * Room definition instead of each one building this object by hand.
 */
export function createGrid(origin: RoomGrid['origin'], columns: number, rows: number): RoomGrid {
  return { origin, columns, rows };
}

// The grid every one of the five prototype Rooms uses (#16 D2): 12x10 tiles
// anchored at `design/build/isolib.js`'s default origin (`OX=800, OY=250`,
// `S=50`) -- confirmed against each design file by inverting its baked
// floor-tile polygon corners back to grid coordinates. Kept here, not
// repeated as local `COLUMNS`/`ROWS`/`ORIGIN` constants in every definitions
// file, so the shared convention has exactly one source (#16 fix 6).
const STANDARD_COLUMNS = 12;
const STANDARD_ROWS = 10;
const STANDARD_ORIGIN = { x: 800, y: 250 };

/** The shared 12x10 grid used by every one of the five prototype Rooms. */
export function createStandardRoomGrid(): RoomGrid {
  return createGrid(STANDARD_ORIGIN, STANDARD_COLUMNS, STANDARD_ROWS);
}

/** A `columns` x `rows` walkable mask with every tile walkable. */
export function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}
