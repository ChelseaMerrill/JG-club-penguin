import { describe, expect, it } from 'vitest';
import { computeDebugOverlay } from './debug-overlay';
import { tileToScreen } from './iso';
import type { RoomDefinition } from './room-definition';

const room: RoomDefinition = {
  id: 'town-center',
  title: 'Fixture',
  subtitle: 'Fixture',
  background: { kind: 'procedural' },
  grid: { origin: { x: 800, y: 250 }, columns: 2, rows: 1 },
  walkable: [[true, false]],
  spawnTile: { col: 0, row: 0 },
  doors: [
    {
      label: 'DOOR',
      hotspot: { x: 10, y: 20, width: 30, height: 40 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
  ],
  npcSlots: [{ npcId: 'darrin', tile: { col: 1, row: 0 } }],
  furnitureSlots: [{ id: 'slot-1', tile: { col: 0, row: 0 } }],
  hotspots: [
    { id: 'trophy-case', label: 'Trophy Case', rect: { x: 1, y: 2, width: 3, height: 4 } },
  ],
};

describe('computeDebugOverlay', () => {
  it('emits one tile marker per walkable-mask cell, flagging walkability', () => {
    const markers = computeDebugOverlay(room).filter((m) => m.kind === 'tile');

    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ walkable: true });
    expect(markers[1]).toMatchObject({ walkable: false });
  });

  it('emits a door marker matching the hotspot rect exactly', () => {
    const [door] = computeDebugOverlay(room).filter((m) => m.kind === 'door');

    expect(door).toEqual({ kind: 'door', x: 10, y: 20, width: 30, height: 40, label: 'DOOR' });
  });

  it('emits an NPC marker at the tile-to-screen projection of its tile', () => {
    const [npc] = computeDebugOverlay(room).filter((m) => m.kind === 'npc');
    const expected = tileToScreen({ col: 1, row: 0 }, room.grid.origin);

    expect(npc).toEqual({ kind: 'npc', x: expected.x, y: expected.y, label: 'darrin' });
  });

  it('emits a furniture marker at the tile-to-screen projection of its tile', () => {
    const [furniture] = computeDebugOverlay(room).filter((m) => m.kind === 'furniture');
    const expected = tileToScreen({ col: 0, row: 0 }, room.grid.origin);

    expect(furniture).toEqual({ kind: 'furniture', x: expected.x, y: expected.y, label: 'slot-1' });
  });

  it('emits a hotspot marker matching the rect exactly', () => {
    const [hotspot] = computeDebugOverlay(room).filter((m) => m.kind === 'hotspot');

    expect(hotspot).toEqual({
      kind: 'hotspot',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      label: 'Trophy Case',
    });
  });
});
