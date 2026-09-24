import { describe, expect, it } from 'vitest';
import {
  depthForTile,
  screenToTile,
  tileCornerToScreen,
  tileToScreen,
  TILE_HEIGHT,
  TILE_WIDTH,
} from './iso';

// Design reference: `design/build/isolib.js`'s `P(x,y)` with `OX=800,
// OY=250, S=50`; the Room designs put tile (0,0)'s floor diamond at
// 800,250 (north) / 850,275 (east) / 800,300 (south) / 750,275 (west).
const ORIGIN = { x: 800, y: 250 };

describe('tileCornerToScreen', () => {
  it("places tile (0,0) at the grid origin — the design diamond's north corner", () => {
    expect(tileCornerToScreen({ col: 0, row: 0 }, ORIGIN)).toEqual({ x: 800, y: 250 });
  });

  it('moves right and down by half a tile per column', () => {
    expect(tileCornerToScreen({ col: 1, row: 0 }, ORIGIN)).toEqual({
      x: 800 + TILE_WIDTH / 2,
      y: 250 + TILE_HEIGHT / 2,
    });
  });

  it('moves left and down by half a tile per row', () => {
    expect(tileCornerToScreen({ col: 0, row: 1 }, ORIGIN)).toEqual({
      x: 800 - TILE_WIDTH / 2,
      y: 250 + TILE_HEIGHT / 2,
    });
  });

  it('reaches the east grid corner at { col: columns, row: 0 }', () => {
    const columns = 12;
    expect(tileCornerToScreen({ col: columns, row: 0 }, ORIGIN)).toEqual({
      x: 800 + columns * (TILE_WIDTH / 2),
      y: 250 + columns * (TILE_HEIGHT / 2),
    });
  });

  it('uses a fresh origin independently of a previous call', () => {
    const otherOrigin = { x: 100, y: 100 };
    expect(tileCornerToScreen({ col: 2, row: 2 }, otherOrigin)).toEqual({ x: 100, y: 200 });
  });
});

describe('tileToScreen (tile centre)', () => {
  it("matches the design diamond's centre for tile (0,0): the average of its four corners", () => {
    // (800,250) + (850,275) + (800,300) + (750,275), averaged, is (800,275).
    expect(tileToScreen({ col: 0, row: 0 }, ORIGIN)).toEqual({ x: 800, y: 275 });
  });

  it("is tileCornerToScreen's north corner, shifted down by half the tile height", () => {
    const tile = { col: 3, row: 2 };
    const corner = tileCornerToScreen(tile, ORIGIN);
    expect(tileToScreen(tile, ORIGIN)).toEqual({ x: corner.x, y: corner.y + TILE_HEIGHT / 2 });
  });
});

describe('screenToTile', () => {
  it('recovers each tile from its own design-diamond centre', () => {
    const tiles = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 5, row: 3 },
      { col: 11, row: 9 },
    ];
    for (const tile of tiles) {
      expect(screenToTile(tileToScreen(tile, ORIGIN), ORIGIN)).toEqual(tile);
    }
  });

  it("maps a point just inside each of tile (0,0)'s design-diamond edges to that tile", () => {
    const epsilon = 0.01;
    const justInsideNorth = { x: 800, y: 250 + epsilon };
    const justInsideEast = { x: 850 - epsilon, y: 275 };
    const justInsideSouth = { x: 800, y: 300 - epsilon };
    const justInsideWest = { x: 750 + epsilon, y: 275 };

    for (const point of [justInsideNorth, justInsideEast, justInsideSouth, justInsideWest]) {
      expect(screenToTile(point, ORIGIN)).toEqual({ col: 0, row: 0 });
    }
  });

  it('round-trips every tile centre in a 12x10 grid', () => {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const tile = { col, row };
        expect(screenToTile(tileToScreen(tile, ORIGIN), ORIGIN)).toEqual(tile);
      }
    }
  });

  it('extrapolates past the grid instead of clamping: one tile north of the origin is negative', () => {
    expect(screenToTile({ x: 800, y: 200 }, ORIGIN)).toEqual({ col: -1, row: -1 });
  });
});

describe('depthForTile', () => {
  it('sorts by screen row (col + row), not the raw grid row, for the same screen position', () => {
    // Screen row 2 (col+row=2) draws in front of screen row 1, even though
    // { col: 0, row: 1 } has the larger raw grid `row`.
    expect(depthForTile({ col: 2, row: 0 })).toBeGreaterThan(depthForTile({ col: 0, row: 1 }));
  });

  it('sorts a later screen row in front of an earlier one', () => {
    expect(depthForTile({ col: 0, row: 5 })).toBeGreaterThan(depthForTile({ col: 3, row: 1 }));
  });

  it('breaks a tie within the same screen row by column', () => {
    // { col: 5, row: 3 } and { col: 2, row: 6 } are both screen row 8.
    expect(depthForTile({ col: 5, row: 3 })).toBeGreaterThan(depthForTile({ col: 2, row: 6 }));
  });

  it('accepts fractional tiles (an in-flight tween position, #14) and keeps them ordered', () => {
    expect(depthForTile({ col: 2.5, row: 0.5 })).toBeGreaterThan(depthForTile({ col: 0, row: 1 }));
  });

  it('is stable for the same tile', () => {
    expect(depthForTile({ col: 4, row: 6 })).toBe(depthForTile({ col: 4, row: 6 }));
  });
});
