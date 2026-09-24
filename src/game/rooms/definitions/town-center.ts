import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Grid size/origin from `design/build/isolib.js`'s defaults (`W=12, D=10`,
// `OX=800, OY=250`) — confirmed against `design/Room 01 Town Center.dc.html`
// by inverting its baked floor-tile polygon corners back to grid coords; the
// same grid is shared by all five prototype Rooms (#16 D2).
const COLUMNS = 12;
const ROWS = 10;
const ORIGIN = { x: 800, y: 250 };

// Traced from the design's furniture: `box()`-drawn desks/counters/stairs
// inverted from their screen polygons back to grid tiles (see the #16
// execution plan). Unwalkable tiles: the elevator/Icebox recesses along the
// back wall (rows 0-2), the Front Desk counter (cols 3-8, rows 0-1), the
// stairwell platform (cols 1-4, rows 6-7), the "SHIP IT" pedestal (cols 2-3,
// rows 8-9), and a planter (cols 10-11, rows 7-8).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, false, false, false, false, false, false, false, true, true],
  [false, false, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, true, false, false, false, false, false, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 01 Town Center.dc.html`. Doors: DEV PIT (real,
 * `door()`-styled sign), THE ICEBOX and STAIRWELL (both disabled — neither
 * Room is in this prototype's five), and the sliding-panel elevator labelled
 * "ELEVATOR · ROOF DECK" (real; its hotspot is the two animated door panels'
 * bounding box, since it isn't drawn with the same `door()` frame as the
 * others). The design also shows a "KITCHEN ↘" HUD exit pill with no in-scene
 * door graphic to place a hotspot on, so this Room has no door to The Melt
 * (The Melt's own "← TOWN CENTER" door is one-way in this static prototype;
 * see the #16 execution plan's reported deviations).
 */
export const townCenter: RoomDefinition = {
  id: 'town-center',
  title: 'TOWN CENTER',
  subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
  background: { kind: 'image', key: 'room-town-center', url: 'rooms/town-center.png' },
  grid: createGrid(ORIGIN, COLUMNS, ROWS),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 8 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 860, y: 150, width: 70, height: 165 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1270, y: 355, width: 70, height: 165 },
      targetRoomId: 'dev-pit',
      entryTile: { col: 6, row: 1 },
    },
    {
      label: 'STAIRWELL',
      hotspot: { x: 610, y: 180, width: 70, height: 165 },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'ELEVATOR · ROOF DECK',
      hotspot: { x: 385, y: 282, width: 90, height: 175 },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill), so this lands on Roof Deck's own spawn tile — a
      // judgment call reported on the #16 execution plan.
      entryTile: { col: 6, row: 2 },
    },
  ],
  npcSlots: [
    // Darrin Jahnel, Sydney Murauskas and Jon Keller: full names on their
    // nameplates, kebab-cased to first name only per the #16 execution
    // plan's example (`darrin`).
    { npcId: 'darrin', tile: { col: 3, row: 4 } },
    { npcId: 'sydney', tile: { col: 6, row: 2 } },
    { npcId: 'jon', tile: { col: 6, row: 6 } },
    // The receptionist penguin behind the Front Desk counter; her tile sits
    // on the (unwalkable) counter itself, same as any NPC standing behind a
    // fixed piece of furniture (#16 D6).
    { npcId: 'front-desk', tile: { col: 6, row: 1 } },
  ],
};
