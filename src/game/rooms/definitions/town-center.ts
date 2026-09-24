import type { RoomDefinition } from '../room-definition';

// Grid size from `design/build/isolib.js`'s defaults (`W=12, D=10`); origin
// from `OX=800, OY=250`. Rough art per #13 D3 until #16 exports the design.
const COLUMNS = 12;
const ROWS = 10;

function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}

/**
 * Approximated from `design/Room 01 Town Center.dc.html`: doors to Dev Pit
 * (real) and the Roof Deck (disabled; #16 hasn't defined that Room yet).
 */
export const townCenter: RoomDefinition = {
  id: 'town-center',
  title: 'Town Center',
  subtitle: 'JG HQ · 108 State St · Floor 5',
  background: { kind: 'procedural' },
  grid: {
    origin: { x: 800, y: 250 },
    tileWidth: 100,
    tileHeight: 50,
    columns: COLUMNS,
    rows: ROWS,
  },
  walkable: fullyWalkable(COLUMNS, ROWS),
  spawnTile: { col: 6, row: 8 },
  doors: [
    {
      label: 'DEV PIT',
      hotspot: { x: 1180, y: 340, width: 150, height: 90 },
      targetRoomId: 'dev-pit',
      entryTile: { col: 6, row: 1 },
    },
    {
      label: 'ROOF DECK',
      hotspot: { x: 480, y: 300, width: 150, height: 90 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
  ],
  npcSlots: [{ npcId: 'darrin', tile: { col: 5, row: 8 } }],
  furnitureSlots: [{ id: 'planter', tile: { col: 3, row: 3 } }],
};
