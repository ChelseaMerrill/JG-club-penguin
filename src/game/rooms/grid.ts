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

/** A `columns` x `rows` walkable mask with every tile walkable. */
export function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}
