import type { Tile } from '../../contracts';

/**
 * A Room's walkable mask, `walkable[row][col]`, exactly `RoomDefinition`'s
 * shape (kept as a structural type here so this module stays Phaser-free and
 * import-free of `room-definition.ts`).
 */
export type WalkableGrid = readonly (readonly boolean[])[];

function isWalkable(walkable: WalkableGrid, tile: Tile): boolean {
  return walkable[tile.row]?.[tile.col] === true;
}

function tileKey(tile: Tile): string {
  return `${tile.col},${tile.row}`;
}

// The isometric grid's 4 tile edges (#14 D1): up/right/down/left in
// col/row-space, matching `iso.ts`'s "increasing col moves right and down;
// increasing row moves left and down".
const NEIGHBOR_OFFSETS: readonly Tile[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

function neighborsOf(tile: Tile): Tile[] {
  return NEIGHBOR_OFFSETS.map((offset) => ({
    col: tile.col + offset.col,
    row: tile.row + offset.row,
  }));
}

function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/**
 * A* over `walkable`'s 4-way tile edges with a Manhattan heuristic (#14 D1).
 * Returns the tile path from `from` to `to` inclusive, ordered start-first,
 * or `null` when either endpoint isn't walkable or no walkable path connects
 * them. `from` equal to `to` (by value) returns the single-tile path
 * `[from]` without searching.
 */
export function findPath(walkable: WalkableGrid, from: Tile, to: Tile): Tile[] | null {
  if (!isWalkable(walkable, from) || !isWalkable(walkable, to)) return null;
  if (from.col === to.col && from.row === to.row) return [from];

  const startKey = tileKey(from);
  const goalKey = tileKey(to);

  const tileByKey = new Map<string, Tile>([[startKey, from]]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const open = new Set<string>([startKey]);

  function fScore(key: string): number {
    return (gScore.get(key) ?? Infinity) + manhattan(tileByKey.get(key)!, to);
  }

  function reconstructPath(goalOnlyKey: string): Tile[] {
    const path: Tile[] = [tileByKey.get(goalOnlyKey)!];
    let key = goalOnlyKey;
    while (cameFrom.has(key)) {
      key = cameFrom.get(key)!;
      path.unshift(tileByKey.get(key)!);
    }
    return path;
  }

  while (open.size > 0) {
    let currentKey: string | null = null;
    let currentF = Infinity;
    for (const key of open) {
      const f = fScore(key);
      if (f < currentF) {
        currentF = f;
        currentKey = key;
      }
    }
    if (currentKey === null) break;
    if (currentKey === goalKey) return reconstructPath(currentKey);

    open.delete(currentKey);
    const current = tileByKey.get(currentKey)!;
    const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

    for (const next of neighborsOf(current)) {
      if (!isWalkable(walkable, next)) continue;
      const nextKey = tileKey(next);
      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);
        tileByKey.set(nextKey, next);
        open.add(nextKey);
      }
    }
  }

  return null;
}

/**
 * Breadth-first search outward from `tile` (4-way, per `findPath`'s edges)
 * to the nearest walkable tile, returning `tile` itself when it's already
 * walkable. Searches level by level; within a level, candidates are sorted
 * by lowest row then lowest column before being checked, so a tie between
 * two equidistant walkable tiles always resolves to the same one (#14 D1).
 *
 * Bounded to `rows + columns` levels out from `tile` (generous for any Room
 * this prototype defines): if nothing walkable is found within that radius,
 * `tile` is returned unchanged rather than searching forever.
 */
export function nearestWalkable(walkable: WalkableGrid, tile: Tile): Tile {
  if (isWalkable(walkable, tile)) return tile;

  const rows = walkable.length;
  const columns = walkable[0]?.length ?? 0;
  const maxDistance = rows + columns;

  const visited = new Set<string>([tileKey(tile)]);
  let frontier: Tile[] = [tile];

  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const next: Tile[] = [];
    for (const current of frontier) {
      for (const neighbor of neighborsOf(current)) {
        const key = tileKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        next.push(neighbor);
      }
    }
    next.sort((a, b) => a.row - b.row || a.col - b.col);
    const found = next.find((candidate) => isWalkable(walkable, candidate));
    if (found) return found;
    frontier = next;
  }

  return tile;
}
