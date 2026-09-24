import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// Traced from `design/Room 05 Roof Deck.dc.html`'s market counters: three
// counters along the back wall (rows 0-1), Kevin/Ann Marie/Millie/Josh's
// counters (rows 3-5), Casey's Igloo Gear stall (rows 3-5, cols 8-11), and
// Brandon/Anthony/Tristin's stands (rows 6-9). CONTEXT.md reserves "Stall"
// for the one interactive Igloo Gear stall (`hotspots` below); the rest of
// this Market's counters are non-interactive background fixtures in this
// prototype. The design's parapet/railing polygons fall entirely outside the
// 12x10 interior and don't affect this mask. Every NPC's own tile (see
// `npcSlots` below) is additionally blocked so a Penguin can't walk through
// them (#16 fix 5), except Kevin's and Josh's: they stand at the two ends of
// the single-tile-wide aisle in front of the back-wall counters (row 2, cols
// 7 and 11), and blocking both together seals off the floor between them
// (cols 8-10) from the rest of the Room -- `reachability.test.ts` catches
// this. Left walkable as a documented exception rather than fabricating an
// unverified mask change to widen that aisle. Casey's tile already sat
// outside the walkable interior.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, false, true],
  [false, false, false, false, false, false, false, false, false, false, false, true],
  [true, true, true, true, false, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, false, false, false, false],
  [true, true, true, true, true, true, true, true, false, false, false, false],
  [true, true, false, true, true, true, true, false, true, false, false, false],
  [false, false, true, true, false, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, false, false, true],
  [true, false, false, true, true, false, true, true, true, false, false, true],
];

/**
 * Traced from `design/Room 05 Roof Deck.dc.html`. Unlike the other four
 * Rooms, this design draws no door or elevator graphic in-scene at all — its
 * only exit indicator is a "↙ ELEVATOR · STAIRS · KITCHEN" HUD nav pill, with
 * no in-world hotspot to place. Per #16 D3 ("doors placed on the design's
 * door signs/doorways"), there is nothing to place here, so this Room has no
 * doors; it's still reachable via Town Center's and The Melt's elevator/
 * stairs doors, whose `entryTile` points at this Room's own `spawnTile`. This
 * is reported as a deviation on the #16 execution plan. `spawnTile` isn't any
 * NPC's own interaction tile (#16 fix 4; see `reachability.test.ts`).
 */
export const roofDeck: RoomDefinition = {
  id: 'roof-deck',
  title: 'THE MARKET',
  subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
  background: { kind: 'image', key: 'room-roof-deck', url: 'rooms/roof-deck.png' },
  grid: createStandardRoomGrid(),
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
