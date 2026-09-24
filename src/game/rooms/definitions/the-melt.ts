import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Same grid convention as Town Center (#16 D2): see that file's comment.
const COLUMNS = 12;
const ROWS = 10;
const ORIGIN = { x: 800, y: 250 };

// Traced from `design/Room 04 Kitchen.dc.html`'s furniture: the back-wall
// counter/"FREE SNACKS" bar (rows 0-1), the central island counters and
// fridge cluster (rows 3-6), and the front counter/table run (rows 7-9).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, true, false, false, false, false, false, false, false, false, true],
  [true, true, false, false, false, false, false, false, false, false, false, false],
  [true, true, true, false, false, false, false, false, false, false, false, false],
  [false, true, true, true, true, true, true, true, false, false, false, false],
  [false, false, true, true, true, true, true, true, true, false, false, true],
  [false, false, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 04 Kitchen.dc.html` (The Melt is the Kitchen):
 * a real door back to Town Center and a real door on to the Roof Deck.
 */
export const theMelt: RoomDefinition = {
  id: 'the-melt',
  title: 'THE MELT',
  subtitle: 'KITCHEN · FLOOR 5',
  background: { kind: 'image', key: 'room-the-melt', url: 'rooms/the-melt.png' },
  grid: createGrid(ORIGIN, COLUMNS, ROWS),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 2 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 420, y: 275, width: 70, height: 165 },
      targetRoomId: 'town-center',
      entryTile: { col: 6, row: 8 },
    },
    {
      label: 'ROOF DECK',
      hotspot: { x: 1290, y: 365, width: 70, height: 165 },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill); lands on Roof Deck's own spawn tile, matching
      // Town Center's elevator door (see the #16 execution plan).
      entryTile: { col: 6, row: 2 },
    },
  ],
  npcSlots: [
    { npcId: 'chef-chelsea', tile: { col: 3, row: 1 } },
    // "Chelsea Merrill": a full name like Darrin Jahnel's, kebab-cased to
    // first name only — distinct from `chef-chelsea` above (the design
    // names two different Chelseas in this Room).
    { npcId: 'chelsea', tile: { col: 4, row: 8 } },
    { npcId: 'tonya', tile: { col: 8, row: 7 } },
    { npcId: 'jesse', tile: { col: 11, row: 2 } },
  ],
};
