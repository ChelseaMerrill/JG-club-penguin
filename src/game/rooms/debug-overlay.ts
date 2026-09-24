import { tileToScreen, TILE_HEIGHT, TILE_WIDTH } from './iso';
import type { RoomDefinition } from './room-definition';

// A pure, Phaser-free projection of a `RoomDefinition`'s walkable mask,
// doors, NPC slots, furniture slots and hotspots into stage-pixel shapes,
// for `e2e/prototype-rooms.spec.ts`'s debug-grid screenshots (#16 D8). Kept
// framework-agnostic and free of any `RoomScene` import so `RoomScene.ts`
// (owned by #14, out of scope here) never needs to import this file either:
// the e2e spec computes these markers directly and draws them into the page
// itself, rather than this module attaching anything to the live Scene.

export interface DebugTileMarker {
  kind: 'tile';
  /** SVG `points` for the tile's diamond, in stage pixels. */
  points: string;
  walkable: boolean;
}

export interface DebugDoorMarker {
  kind: 'door';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface DebugNpcMarker {
  kind: 'npc';
  x: number;
  y: number;
  label: string;
}

export interface DebugFurnitureMarker {
  kind: 'furniture';
  x: number;
  y: number;
  label: string;
}

export interface DebugHotspotMarker {
  kind: 'hotspot';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export type DebugOverlayMarker =
  DebugTileMarker | DebugDoorMarker | DebugNpcMarker | DebugFurnitureMarker | DebugHotspotMarker;

/** One marker per walkable-mask tile, door, NPC slot, furniture slot and hotspot. */
export function computeDebugOverlay(room: RoomDefinition): DebugOverlayMarker[] {
  const markers: DebugOverlayMarker[] = [];

  for (let row = 0; row < room.grid.rows; row += 1) {
    for (let col = 0; col < room.grid.columns; col += 1) {
      const center = tileToScreen({ col, row }, room.grid.origin);
      const points = [
        { x: center.x, y: center.y - TILE_HEIGHT / 2 },
        { x: center.x + TILE_WIDTH / 2, y: center.y },
        { x: center.x, y: center.y + TILE_HEIGHT / 2 },
        { x: center.x - TILE_WIDTH / 2, y: center.y },
      ]
        .map((p) => `${p.x},${p.y}`)
        .join(' ');
      markers.push({ kind: 'tile', points, walkable: room.walkable[row]?.[col] === true });
    }
  }

  for (const door of room.doors) {
    markers.push({
      kind: 'door',
      x: door.hotspot.x,
      y: door.hotspot.y,
      width: door.hotspot.width,
      height: door.hotspot.height,
      label: door.label,
    });
  }

  for (const npc of room.npcSlots) {
    const point = tileToScreen(npc.tile, room.grid.origin);
    markers.push({ kind: 'npc', x: point.x, y: point.y, label: npc.npcId });
  }

  for (const slot of room.furnitureSlots ?? []) {
    const point = tileToScreen(slot.tile, room.grid.origin);
    markers.push({ kind: 'furniture', x: point.x, y: point.y, label: slot.id });
  }

  for (const hotspot of room.hotspots ?? []) {
    markers.push({
      kind: 'hotspot',
      x: hotspot.rect.x,
      y: hotspot.rect.y,
      width: hotspot.rect.width,
      height: hotspot.rect.height,
      label: hotspot.label,
    });
  }

  return markers;
}
