import type { RoomDefinition } from '../room-definition';

// Same grid convention as Town Center; see that file's comment.
const COLUMNS = 12;
const ROWS = 10;

function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}

/**
 * Approximated from `design/Room 02 Dev Pit.dc.html`: a door back to Town
 * Center (real) and one toward The Melt (disabled; #16 hasn't defined that
 * Room yet). Its Town-Center-facing spawn/entry tile matches Town Center's
 * `DEV PIT` door `entryTile`, and its own `TOWN CENTER` door `entryTile`
 * matches Town Center's `spawnTile`.
 */
export const devPit: RoomDefinition = {
  id: 'dev-pit',
  title: 'Dev Pit',
  subtitle: 'Team RMs 1-4 · Floor 5',
  background: { kind: 'procedural' },
  grid: {
    origin: { x: 800, y: 250 },
    tileWidth: 100,
    tileHeight: 50,
    columns: COLUMNS,
    rows: ROWS,
  },
  walkable: fullyWalkable(COLUMNS, ROWS),
  spawnTile: { col: 6, row: 1 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 1180, y: 340, width: 150, height: 90 },
      targetRoomId: 'town-center',
      entryTile: { col: 6, row: 8 },
    },
    {
      label: 'THE MELT',
      hotspot: { x: 480, y: 300, width: 150, height: 90 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
  ],
  npcSlots: [{ npcId: 'ashley', tile: { col: 7, row: 7 } }],
  furnitureSlots: [{ id: 'desk', tile: { col: 4, row: 5 } }],
};
