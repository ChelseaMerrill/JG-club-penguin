import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Same grid convention as Town Center (#16 D2): see that file's comment.
const COLUMNS = 12;
const ROWS = 10;
const ORIGIN = { x: 800, y: 250 };

// Traced from `design/Room 02 Dev Pit.dc.html`'s furniture: the "SPRINT 42"
// whiteboard/desk cluster (cols 1-4, rows 1-3) and a small pedestal by THE
// ICEBOX elevator (col 11, row 3).
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, true, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, true, true, true, true, true, true],
  [true, true, false, false, false, true, true, true, true, true, true, false],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 02 Dev Pit.dc.html`: a real door back to Town
 * Center, and THE ICEBOX disabled (not one of this prototype's five Rooms).
 * The design has no in-scene door or elevator toward The Melt/Kitchen at
 * all (confirmed: no "MELT"/"KITCHEN" text anywhere in the file), so this
 * Room defines no door to The Melt.
 */
export const devPit: RoomDefinition = {
  id: 'dev-pit',
  title: 'DEV PIT',
  subtitle: 'TEAM RMS 1–4 · FLOOR 5',
  background: { kind: 'image', key: 'room-dev-pit', url: 'rooms/dev-pit.png' },
  grid: createGrid(ORIGIN, COLUMNS, ROWS),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 1 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 830, y: 135, width: 70, height: 165 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'TOWN CENTER',
      hotspot: { x: 700, y: 135, width: 70, height: 165 },
      targetRoomId: 'town-center',
      entryTile: { col: 6, row: 8 },
    },
  ],
  npcSlots: [
    { npcId: 'ashley', tile: { col: 3, row: 9 } },
    { npcId: 'ian', tile: { col: 3, row: 5 } },
    // Steven has no ground-shadow ellipse in the design markup (his figure
    // is a custom illustration without one, unlike the shared `peng()`
    // sprite); this tile is estimated from his nameplate position and the
    // typical nameplate-to-shadow offset seen on other characters in this
    // Room — a judgment call reported on the #16 execution plan.
    { npcId: 'steven', tile: { col: 10, row: 8 } },
    { npcId: 'dom', tile: { col: 2, row: 6 } },
    { npcId: 'ryan', tile: { col: 7, row: 2 } },
    { npcId: 'sam', tile: { col: 8, row: 2 } },
  ],
};
