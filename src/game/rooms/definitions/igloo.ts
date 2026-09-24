import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Same grid convention as Town Center (#16 D2): see that file's comment.
const COLUMNS = 12;
const ROWS = 10;
const ORIGIN = { x: 800, y: 250 };

// Traced from `design/Room 06 Igloo.dc.html`'s furniture: the elevator
// recess (rows 0-1), a shelf/nightstand (col 8, rows 1-2), the built-in
// bed/coat structure (cols 0-2, rows 3-7), and the trophy-case display unit
// (cols 10-11, rows 7-8).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, true, true, false, false, false, false, false, true, true],
  [false, false, true, true, true, true, true, false, false, false, true, true],
  [true, true, true, true, true, true, true, true, false, true, true, true],
  [false, false, true, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, false, true, true],
  [false, false, false, true, true, true, true, true, true, true, false, false],
  [true, true, true, true, true, true, true, true, true, true, false, false],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 06 Igloo.dc.html`: a real door back to Town
 * Center. Nothing else in the prototype's five Rooms links to the Igloo in
 * this static design — it's reached through the HUD's persistent IGLOO
 * button (#15), not a floor door.
 */
export const igloo: RoomDefinition = {
  id: 'igloo',
  title: 'YOUR IGLOO',
  subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
  background: { kind: 'image', key: 'room-igloo', url: 'rooms/igloo.png' },
  grid: createGrid(ORIGIN, COLUMNS, ROWS),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 9 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 680, y: 145, width: 70, height: 165 },
      targetRoomId: 'town-center',
      entryTile: { col: 6, row: 8 },
    },
  ],
  npcSlots: [],
  // Six empty slots (#41) spread across the Igloo's open floor, clear of the
  // built-in bed structure, the trophy case, the door and the spawn tile.
  // The design itself shows only the finished furnished state, not slot
  // markers, so these positions are a judgment call reported on the #16
  // execution plan.
  furnitureSlots: [
    { id: 'slot-1', tile: { col: 4, row: 3 } },
    { id: 'slot-2', tile: { col: 6, row: 3 } },
    { id: 'slot-3', tile: { col: 8, row: 3 } },
    { id: 'slot-4', tile: { col: 4, row: 6 } },
    { id: 'slot-5', tile: { col: 6, row: 6 } },
    { id: 'slot-6', tile: { col: 8, row: 6 } },
  ],
  hotspots: [
    {
      id: 'trophy-case',
      label: 'Trophy Case',
      rect: { x: 880, y: 700, width: 120, height: 60 },
    },
  ],
};
