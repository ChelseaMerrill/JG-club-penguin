import { describe, expect, it } from 'vitest';
import { depthForTile, screenToTile, tileToScreen, TILE_HEIGHT, TILE_WIDTH } from './iso';

const ORIGIN = { x: 800, y: 250 };

describe('tileToScreen / screenToTile', () => {
  it('places the origin tile at the grid origin', () => {
    expect(tileToScreen({ col: 0, row: 0 }, ORIGIN)).toEqual({ x: 800, y: 250 });
  });

  it('moves right and down by half a tile per column', () => {
    expect(tileToScreen({ col: 1, row: 0 }, ORIGIN)).toEqual({
      x: 800 + TILE_WIDTH / 2,
      y: 250 + TILE_HEIGHT / 2,
    });
  });

  it('moves left and down by half a tile per row', () => {
    expect(tileToScreen({ col: 0, row: 1 }, ORIGIN)).toEqual({
      x: 800 - TILE_WIDTH / 2,
      y: 250 + TILE_HEIGHT / 2,
    });
  });

  it('reaches the east grid corner at { col: columns, row: 0 }', () => {
    const columns = 12;
    expect(tileToScreen({ col: columns, row: 0 }, ORIGIN)).toEqual({
      x: 800 + columns * (TILE_WIDTH / 2),
      y: 250 + columns * (TILE_HEIGHT / 2),
    });
  });

  it('round-trips every tile in a 12x10 grid through screenToTile', () => {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const tile = { col, row };
        expect(screenToTile(tileToScreen(tile, ORIGIN), ORIGIN)).toEqual(tile);
      }
    }
  });

  it('uses a fresh origin independently of a previous call', () => {
    const otherOrigin = { x: 100, y: 100 };
    expect(tileToScreen({ col: 2, row: 2 }, otherOrigin)).toEqual({ x: 100, y: 200 });
  });
});

describe('depthForTile', () => {
  it('sorts a later row in front of an earlier row, regardless of column', () => {
    expect(depthForTile({ col: 0, row: 1 })).toBeGreaterThan(depthForTile({ col: 99, row: 0 }));
  });

  it('sorts a later column in front of an earlier column within the same row', () => {
    expect(depthForTile({ col: 5, row: 3 })).toBeGreaterThan(depthForTile({ col: 2, row: 3 }));
  });

  it('is stable for the same tile', () => {
    expect(depthForTile({ col: 4, row: 6 })).toBe(depthForTile({ col: 4, row: 6 }));
  });
});
