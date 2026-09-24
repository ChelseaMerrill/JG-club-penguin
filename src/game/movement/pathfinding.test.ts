import { describe, expect, it } from 'vitest';
import { findPath, nearestReachable, nearestWalkable } from './pathfinding';

function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}

describe('findPath', () => {
  it('finds the shortest path on an open grid', () => {
    const walkable = fullyWalkable(6, 6);
    const from = { col: 0, row: 0 };
    const to = { col: 3, row: 2 };

    const path = findPath(walkable, from, to);

    expect(path).not.toBeNull();
    // Manhattan distance 5, so the shortest path has 6 tiles (start included).
    expect(path).toHaveLength(6);
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
    // Every consecutive pair is a single 4-way step.
    for (let i = 1; i < path!.length; i += 1) {
      const a = path![i - 1];
      const b = path![i];
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
  });

  it('returns a single-tile path when start equals goal', () => {
    const walkable = fullyWalkable(4, 4);
    const tile = { col: 2, row: 1 };

    expect(findPath(walkable, tile, tile)).toEqual([tile]);
  });

  it('returns null when a wall fully separates start and goal', () => {
    const walkable = fullyWalkable(5, 5);
    // Block every tile in row 2, splitting the grid top from bottom.
    walkable[2] = walkable[2].map(() => false);

    const from = { col: 0, row: 0 };
    const to = { col: 0, row: 4 };

    expect(findPath(walkable, from, to)).toBeNull();
  });

  it('returns null when the goal tile itself is unwalkable', () => {
    const walkable = fullyWalkable(4, 4);
    walkable[1][1] = false;

    expect(findPath(walkable, { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull();
  });

  it('routes around an obstacle to find the shortest available path (#14 review fix 8)', () => {
    const walkable = fullyWalkable(5, 5);
    // A wall across row 2, except a single gap at col 4.
    for (let col = 0; col < 4; col += 1) walkable[2][col] = false;

    const from = { col: 0, row: 0 };
    const to = { col: 0, row: 4 };
    const path = findPath(walkable, from, to);

    expect(path).not.toBeNull();
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
    // Must detour through the only gap in the wall.
    expect(path!.some((tile) => tile.col === 4 && tile.row === 2)).toBe(true);
    // Shortest possible: Manhattan distance to the gap (4+2=6) plus from the
    // gap to the goal (4+2=6) = 12 steps, 13 tiles including both ends.
    expect(path).toHaveLength(13);
  });
});

describe('nearestWalkable', () => {
  it('returns the tile itself when already walkable', () => {
    const walkable = fullyWalkable(4, 4);
    const tile = { col: 2, row: 2 };

    expect(nearestWalkable(walkable, tile)).toEqual(tile);
  });

  it('finds the nearest walkable tile outward from an unwalkable one', () => {
    const walkable = fullyWalkable(4, 4);
    walkable[1][1] = false;
    // Only { col: 1, row: 0 } is walkable at distance 1 from (1,1) in this setup.
    walkable[0][1] = true;
    walkable[1][0] = false;
    walkable[1][2] = false;
    walkable[2][1] = false;

    expect(nearestWalkable(walkable, { col: 1, row: 1 })).toEqual({ col: 1, row: 0 });
  });

  it('breaks ties between equidistant walkable tiles by lowest row then lowest column', () => {
    const walkable = fullyWalkable(5, 5);
    walkable[2][2] = false;
    // Every 4-way neighbor of (2,2) stays walkable, so all four are tied at
    // distance 1: (2,1), (1,2), (3,2), (2,3). Lowest row wins: (2,1).
    expect(nearestWalkable(walkable, { col: 2, row: 2 })).toEqual({ col: 2, row: 1 });
  });

  it('extrapolates outward from an out-of-grid tile toward the walkable mask', () => {
    const walkable = fullyWalkable(4, 4);

    const result = nearestWalkable(walkable, { col: -3, row: 0 });

    expect(result.col).toBeGreaterThanOrEqual(0);
    expect(result.row).toBeGreaterThanOrEqual(0);
  });
});

describe('nearestReachable', () => {
  it('returns the target itself when it is reachable from `from`', () => {
    const walkable = fullyWalkable(5, 5);

    expect(nearestReachable(walkable, { col: 0, row: 0 }, { col: 3, row: 3 })).toEqual({
      col: 3,
      row: 3,
    });
  });

  it('returns `from` unchanged when `from` equals `target`', () => {
    const walkable = fullyWalkable(5, 5);
    const tile = { col: 2, row: 2 };

    expect(nearestReachable(walkable, tile, tile)).toEqual(tile);
  });

  it('returns the nearest reachable tile when a wall fully separates `from` from `target` (#14 review fix 2)', () => {
    const walkable = fullyWalkable(6, 6);
    // A wall across row 3 splits the grid top from bottom, same split as
    // `findPath`'s "wall fully separates start and goal" test above, so
    // `moveTo` this target would otherwise return `null` and leave the
    // Penguin stuck walking in place toward nowhere.
    walkable[3] = walkable[3].map(() => false);

    const from = { col: 2, row: 0 };
    const target = { col: 2, row: 5 };

    // Every tile in rows 0-2 is reachable from `from`; row 2, col 2 is the
    // closest of those to (2, 5) (Manhattan distance 3).
    expect(nearestReachable(walkable, from, target)).toEqual({ col: 2, row: 2 });
  });
});
