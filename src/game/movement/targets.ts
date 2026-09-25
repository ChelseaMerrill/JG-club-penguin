import type { Tile } from '../../contracts';
import type { GridOrigin } from '../rooms/iso';
import { screenToTile } from '../rooms/iso';
import type { RoomDoor, RoomNpcSlot } from '../rooms/room-definition';
import { nearestWalkable, tilesEqual, type WalkableGrid } from './pathfinding';

/** `walkable` with `blocked` forced unwalkable, regardless of its own mask value. */
function withTileBlocked(walkable: WalkableGrid, blocked: Tile): WalkableGrid {
  return walkable.map((row, rowIndex) =>
    rowIndex === blocked.row
      ? row.map((cell, colIndex) => (colIndex === blocked.col ? false : cell))
      : row,
  );
}

/**
 * The tile a Penguin walks to in order to interact with `npc` (#14 D2): the
 * nearest walkable tile to the NPC's own slot tile, excluding that tile
 * itself even when the mask marks it walkable (the NPC occupies it).
 */
export function npcInteractionTile(walkable: WalkableGrid, npc: RoomNpcSlot): Tile {
  const masked = withTileBlocked(walkable, npc.tile);
  const target = nearestWalkable(masked, npc.tile);
  // `nearestWalkable` only ever returns the input tile unchanged when its
  // search radius is exhausted (no walkable tile found at all); guard the
  // (should-never-happen) case where that fallback would be the NPC's own
  // now-blocked tile.
  return tilesEqual(target, npc.tile) ? npc.tile : target;
}

/**
 * The tile a Penguin walks to in order to use `door` (#14 D2): the nearest
 * walkable tile to the door hotspot's centre, converted to a tile via
 * `screenToTile`.
 */
export function doorApproachTile(walkable: WalkableGrid, door: RoomDoor, origin: GridOrigin): Tile {
  const centre = {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
  return nearestWalkable(walkable, screenToTile(centre, origin));
}
