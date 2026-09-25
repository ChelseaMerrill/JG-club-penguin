import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { roofDeck } from './roof-deck';
import { townCenter } from './town-center';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Room 04 Kitchen.dc.html`'s fixtures: the back-wall
// counter/"FREE SNACKS" bar (rows 0-1), the central island counter and
// fridge cluster (rows 3-6), and the front counter/table run (rows 7-9).
// Row 4's cols 7-10 and row 9's cols 0-1 sample as the same floor colour as
// the rest of the open floor in the exported art (not the counters'
// white/teal), so they're walkable rather than blocked under the counter
// cluster or the floor-arrow decal near the TOWN CENTER door (#16 fix 5).
// Chelsea's and Jesse's own tiles are additionally blocked so a Penguin
// can't walk through them (#16 fix 5); Chef Chelsea's and Tonya's tiles
// already sat on unwalkable counters.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, false],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, false, false, false, false, false, false, false, false, false, false],
  [true, true, true, false, false, false, false, false, false, false, false, false],
  [false, true, true, true, true, true, true, true, false, false, false, false],
  [false, false, true, true, false, true, true, true, true, false, false, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
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
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 2 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 420, y: 275, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // Town Center has no door of its own back to The Melt (see below), so
      // this lands on Town Center's own spawn tile (#16 fix 4) -- a
      // judgment call reported on the #16 execution plan, same as Roof
      // Deck's doors below.
      entryTile: townCenter.spawnTile,
    },
    {
      label: 'ROOF DECK',
      hotspot: { x: 1290, y: 365, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill); lands on Roof Deck's own spawn tile, matching
      // Town Center's elevator door (see the #16 execution plan).
      entryTile: roofDeck.spawnTile,
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
