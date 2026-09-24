import { describe, expect, it } from 'vitest';
import type { Tile } from '../../contracts';
import { screenToTile } from './iso';
import { ROOM_DEFINITIONS } from './registry';
import type { RoomDefinition } from './room-definition';

// Local BFS/nearest-walkable helpers for #16's reachability check. #14's
// `src/game/movement/targets.ts` implements the same two rules (an
// approach/interaction tile is the nearest walkable tile to a target, and a
// Penguin can path to any tile connected to spawn by 4-directional walkable
// steps) for real click-to-move; this test reimplements them locally rather
// than depending on #14's in-progress module, and is expected to be swapped
// for the shared helpers once both land.
const DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const tileKey = (tile: Tile): string => `${tile.col},${tile.row}`;

function isInBounds(room: RoomDefinition, tile: Tile): boolean {
  return (
    tile.col >= 0 && tile.col < room.grid.columns && tile.row >= 0 && tile.row < room.grid.rows
  );
}

function isWalkable(room: RoomDefinition, tile: Tile): boolean {
  return isInBounds(room, tile) && room.walkable[tile.row]?.[tile.col] === true;
}

/** Every tile reachable from `room.spawnTile` by 4-directional walkable steps. */
function reachableFromSpawn(room: RoomDefinition): Set<string> {
  if (!isWalkable(room, room.spawnTile)) {
    throw new Error(`[${room.id}] spawnTile is not walkable`);
  }
  const visited = new Set<string>([tileKey(room.spawnTile)]);
  const queue: Tile[] = [room.spawnTile];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    for (const [dc, dr] of DIRECTIONS) {
      const next = { col: current.col + dc, row: current.row + dr };
      if (!isWalkable(room, next)) continue;
      const key = tileKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * The nearest walkable tile to `origin` (a BFS outward over the full plane,
 * not just this Room's grid, since `origin` itself — a door's approach tile
 * before rounding, or an NPC/furniture tile — may sit outside the grid or on
 * an unwalkable tile). `excludeSelf` skips `origin` itself, for an
 * NPC/furniture tile that is expected to not be walkable (#16 D6).
 */
function nearestWalkableTile(room: RoomDefinition, origin: Tile, excludeSelf: boolean): Tile {
  const visited = new Set<string>([tileKey(origin)]);
  const queue: Tile[] = [origin];
  const MAX_NODES = 5000;
  for (let i = 0; i < queue.length && i < MAX_NODES; i += 1) {
    const current = queue[i];
    const isOrigin = current.col === origin.col && current.row === origin.row;
    if (!(excludeSelf && isOrigin) && isWalkable(room, current)) {
      return current;
    }
    for (const [dc, dr] of DIRECTIONS) {
      const next = { col: current.col + dc, row: current.row + dr };
      const key = tileKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  throw new Error(
    `[${room.id}] no walkable tile found near { col: ${origin.col}, row: ${origin.row} }`,
  );
}

function roundTile(tile: { col: number; row: number }): Tile {
  return { col: Math.round(tile.col), row: Math.round(tile.row) };
}

describe('Room reachability (#16 D6)', () => {
  for (const room of ROOM_DEFINITIONS) {
    describe(room.id, () => {
      const reachable = reachableFromSpawn(room);

      it('reaches the approach tile of every door', () => {
        for (const door of room.doors) {
          const centre = {
            x: door.hotspot.x + door.hotspot.width / 2,
            y: door.hotspot.y + door.hotspot.height / 2,
          };
          const doorTile = roundTile(screenToTile(centre, room.grid.origin));
          const approach = nearestWalkableTile(room, doorTile, false);
          expect(reachable.has(tileKey(approach))).toBe(true);
        }
      });

      it('reaches the interaction tile of every NPC', () => {
        for (const npc of room.npcSlots) {
          const interaction = nearestWalkableTile(room, npc.tile, true);
          expect(reachable.has(tileKey(interaction))).toBe(true);
        }
      });

      it('reaches the nearest walkable neighbour of every furniture slot', () => {
        for (const slot of room.furnitureSlots ?? []) {
          const neighbour = nearestWalkableTile(room, slot.tile, true);
          expect(reachable.has(tileKey(neighbour))).toBe(true);
        }
      });
    });
  }
});
