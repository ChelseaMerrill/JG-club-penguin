import type { Tile } from '../../contracts';

/**
 * A 2:1 isometric tile is 100x50 (per `design/build/isolib.js`'s `S=50` tile
 * radius and `design/design_handoff_club_jenguin/README.md`'s "tiles
 * 100x50px"): 100px wide, 50px tall from its north corner to its south
 * corner.
 */
export const TILE_WIDTH = 100;
export const TILE_HEIGHT = 50;

/** The screen position of a Room's tile `{ col: 0, row: 0 }` north corner. */
export interface GridOrigin {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Converts a Room-local tile coordinate to a screen point (the tile's
 * center), relative to the Room's grid `origin`. Increasing `col` moves
 * right and down; increasing `row` moves left and down, matching
 * `isolib.js`'s `P(x,y)=[OX+(x-y)*S, OY+(x+y)*S/2]` with `S = TILE_WIDTH/2`.
 */
export function tileToScreen(tile: Tile, origin: GridOrigin): ScreenPoint {
  return {
    x: origin.x + (tile.col - tile.row) * (TILE_WIDTH / 2),
    y: origin.y + (tile.col + tile.row) * (TILE_HEIGHT / 2),
  };
}

/**
 * Inverts `tileToScreen`, rounding to the nearest tile. Not a lossless round
 * trip for every point in a tile's diamond (many screen points map to the
 * same tile), but `screenToTile(tileToScreen(tile, origin), origin)` always
 * recovers `tile` exactly.
 */
export function screenToTile(point: ScreenPoint, origin: GridOrigin): Tile {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const colMinusRow = dx / (TILE_WIDTH / 2);
  const colPlusRow = dy / (TILE_HEIGHT / 2);
  return {
    col: Math.round((colMinusRow + colPlusRow) / 2),
    row: Math.round((colPlusRow - colMinusRow) / 2),
  };
}

/**
 * Row-major draw-order depth: a tile's row dominates, so anything on a later
 * row always draws in front of anything on an earlier row regardless of
 * column, and a later column breaks ties within the same row (matching the
 * left-to-right, back-to-front draw order of the isometric grid).
 */
export function depthForTile(tile: Tile): number {
  return tile.row * 1000 + tile.col;
}
