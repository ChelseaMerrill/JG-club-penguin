import { describe, expect, it } from 'vitest';
import { TILE_HEIGHT, TILE_WIDTH } from '../rooms/iso';
import type { RoomDoor, RoomNpcSlot } from '../rooms/room-definition';
import { doorApproachTile, npcInteractionTile } from './targets';

function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}

// Same grid convention as `iso.test.ts`.
const ORIGIN = { x: 800, y: 250 };

describe('npcInteractionTile', () => {
  it('picks a walkable tile adjacent to the NPC, never the NPC tile itself', () => {
    const walkable = fullyWalkable(6, 6);
    const npc: RoomNpcSlot = { npcId: 'darrin', tile: { col: 3, row: 3 } };

    const target = npcInteractionTile(walkable, npc);

    expect(target).not.toEqual(npc.tile);
    expect(Math.abs(target.col - npc.tile.col) + Math.abs(target.row - npc.tile.row)).toBe(1);
  });

  it('excludes the NPC tile even when the mask itself marks it walkable', () => {
    const walkable = fullyWalkable(5, 5);
    const npc: RoomNpcSlot = { npcId: 'ashley', tile: { col: 2, row: 2 } };

    // Ties among the 4 neighbors break to lowest row then column, same as
    // `nearestWalkable`'s own tie-break.
    expect(npcInteractionTile(walkable, npc)).toEqual({ col: 2, row: 1 });
  });
});

describe('doorApproachTile', () => {
  it('resolves the door hotspot centre to a tile and returns it when walkable', () => {
    const walkable = fullyWalkable(12, 10);
    // A hotspot centred exactly on tile (6, 1)'s screen centre.
    const centerX = ORIGIN.x + (6 - 1) * (TILE_WIDTH / 2);
    const centerY = ORIGIN.y + (6 + 1) * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
    const door: RoomDoor = {
      label: 'DEV PIT',
      hotspot: { x: centerX - 75, y: centerY - 45, width: 150, height: 90 },
      targetRoomId: 'dev-pit',
      entryTile: { col: 6, row: 1 },
    };

    expect(doorApproachTile(walkable, door, ORIGIN)).toEqual({ col: 6, row: 1 });
  });

  it('falls back to the nearest walkable tile when the hotspot centre is unwalkable', () => {
    const walkable = fullyWalkable(12, 10);
    walkable[1][6] = false;
    const centerX = ORIGIN.x + (6 - 1) * (TILE_WIDTH / 2);
    const centerY = ORIGIN.y + (6 + 1) * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
    const door: RoomDoor = {
      label: 'DEV PIT',
      hotspot: { x: centerX - 75, y: centerY - 45, width: 150, height: 90 },
      targetRoomId: 'dev-pit',
      entryTile: { col: 6, row: 1 },
    };

    const target = doorApproachTile(walkable, door, ORIGIN);

    expect(target).not.toEqual({ col: 6, row: 1 });
    expect(walkable[target.row]?.[target.col]).toBe(true);
  });
});
