import type { Tile } from '../../contracts';

/**
 * A 2:1 isometric tile is 100x50 (per `design/build/isolib.js`'s `S=50` tile
 * radius and `design/design_handoff_club_jenguin/README.md`'s "tiles
 * 100x50px"): 100px wide, 50px tall from its north corner to its south
 * corner. This is the single source for tile size (#13 fix 5): `RoomGrid`
 * carries no tile-size fields of its own, and every consumer imports these.
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
 * Converts a Room-local tile coordinate to a screen point (the tile
 * diamond's **north corner**), relative to the Room's grid `origin`.
 * Increasing `col` moves right and down; increasing `row` moves left and
 * down, matching `isolib.js`'s `P(x,y)=[OX+(x-y)*S, OY+(x+y)*S/2]` with
 * `S = TILE_WIDTH/2`. `RoomScene` uses this for the wall polygons, which
 * meet at tile corners, not centres.
 */
export function tileCornerToScreen(tile: Tile, origin: GridOrigin): ScreenPoint {
  return {
    x: origin.x + (tile.col - tile.row) * (TILE_WIDTH / 2),
    y: origin.y + (tile.col + tile.row) * (TILE_HEIGHT / 2),
  };
}

/**
 * Converts a Room-local tile coordinate to a screen point (the tile
 * diamond's **centre**): `tileCornerToScreen`'s north corner, shifted down
 * by half the tile height. `RoomScene` uses this for the floor tiles, doors,
 * NPCs, furniture and props it draws on top of the floor, which should sit
 * in the middle of their tile, not pinned to its north corner.
 */
export function tileToScreen(tile: Tile, origin: GridOrigin): ScreenPoint {
  const corner = tileCornerToScreen(tile, origin);
  return { x: corner.x, y: corner.y + TILE_HEIGHT / 2 };
}

/**
 * Inverts the tile diamond geometry: given any screen point, finds the tile
 * whose diamond contains it (not just a tile's exact centre or corner), by
 * flooring the real-valued inverse of `tileCornerToScreen`'s linear map.
 * `screenToTile(tileToScreen(tile, origin), origin)` always recovers `tile`
 * exactly, since a tile's own centre always lies inside its own diamond.
 *
 * Extrapolates rather than clamping: a point outside `{0,0}..{columns,rows}`
 * still returns the (possibly negative) tile whose diamond it would fall in
 * if the grid extended that far; callers that need an in-bounds tile check
 * the result against the Room's `grid.columns`/`grid.rows` themselves (see
 * `validate.ts`).
 */
export function screenToTile(point: ScreenPoint, origin: GridOrigin): Tile {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const u = dx / (TILE_WIDTH / 2); // col - row, real-valued
  const v = dy / (TILE_HEIGHT / 2); // col + row, real-valued
  return {
    col: Math.floor((u + v) / 2),
    row: Math.floor((v - u) / 2),
  };
}

// Wide enough that a tile's fractional `col`/`row` (in-flight tween
// positions, #14) never spills its tie-break contribution into the next
// screen row's bucket, for any grid this prototype's Rooms use.
const DEPTH_ROW_SCALE = 1000;

/**
 * Draw-order depth for isometric sorting (Penguins, NPCs, furniture, props).
 * "Row" here means the tile's **screen row** (`col + row`, the same
 * combination `tileCornerToScreen`'s `y` is built from) — not the raw grid
 * `row` alone. A tile further down the screen (a higher screen row) always
 * draws in front of one higher up, regardless of how that screen row splits
 * between `col` and `row` (e.g. `{ col: 2, row: 0 }`, screen row 2, draws in
 * front of `{ col: 0, row: 1 }`, screen row 1); a later `col` breaks a tie
 * within the same screen row. Accepts fractional `col`/`row` so an in-flight
 * tween position sorts sensibly against the whole tiles around it.
 */
export function depthForTile(tile: Tile): number {
  const screenRow = tile.col + tile.row;
  return screenRow * DEPTH_ROW_SCALE + tile.col;
}
