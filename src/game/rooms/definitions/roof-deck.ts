import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Same grid convention as Town Center (#16 D2): see that file's comment.
const COLUMNS = 12;
const ROWS = 10;
const ORIGIN = { x: 800, y: 250 };

// Traced from `design/Room 05 Roof Deck.dc.html`'s vendor stalls: three
// stalls along the back wall (rows 0-1), Kevin/Ann Marie/Millie/Josh's
// counters (rows 3-5), Casey's Igloo Gear stall (rows 3-5, cols 8-11), and
// Brandon/Anthony/Tristin's stands (rows 6-9). The design's parapet/railing
// polygons fall entirely outside the 12x10 interior and don't affect this
// mask.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, false, true],
  [false, false, false, false, false, false, false, false, false, false, false, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, false, false, false, false],
  [true, true, true, true, true, true, true, true, false, false, false, false],
  [true, true, true, true, true, true, true, true, true, false, false, false],
  [false, false, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, false, false, true],
  [true, false, false, true, true, true, true, true, true, false, false, true],
];

/**
 * Traced from `design/Room 05 Roof Deck.dc.html`. Unlike the other four
 * Rooms, this design draws no door or elevator graphic in-scene at all — its
 * only exit indicator is a "↙ ELEVATOR · STAIRS · KITCHEN" HUD nav pill, with
 * no in-world hotspot to place. Per #16 D3 ("doors placed on the design's
 * door signs/doorways"), there is nothing to place here, so this Room has no
 * doors; it's still reachable via Town Center's and The Melt's elevator/
 * stairs doors, whose `entryTile` points at this Room's own `spawnTile`. This
 * is reported as a deviation on the #16 execution plan.
 */
export const roofDeck: RoomDefinition = {
  id: 'roof-deck',
  title: 'THE MARKET',
  subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
  background: { kind: 'image', key: 'room-roof-deck', url: 'rooms/roof-deck.png' },
  grid: createGrid(ORIGIN, COLUMNS, ROWS),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 2 },
  doors: [],
  npcSlots: [
    { npcId: 'kevin', tile: { col: 7, row: 2 } },
    // "Ann Marie": a first-plus-middle given name, kept in full (kebab-cased)
    // rather than reduced to a single first name, unlike Darrin Jahnel/Sydney
    // Murauskas/Jon Keller's Firstname-Lastname pattern.
    { npcId: 'ann-marie', tile: { col: 4, row: 2 } },
    { npcId: 'millie', tile: { col: 2, row: 5 } },
    { npcId: 'josh', tile: { col: 11, row: 2 } },
    { npcId: 'brandon', tile: { col: 4, row: 6 } },
    { npcId: 'anthony', tile: { col: 7, row: 5 } },
    { npcId: 'tristin', tile: { col: 5, row: 9 } },
    // Her ellipse inverts to col 12.2, one column past this Room's last
    // valid column (11); clamped to 11 — a judgment call reported on the
    // #16 execution plan.
    { npcId: 'casey', tile: { col: 11, row: 5 } },
  ],
  hotspots: [
    {
      id: 'igloo-gear-stall',
      label: 'Igloo Gear',
      rect: { x: 925, y: 553, width: 280, height: 140 },
    },
  ],
};
