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
 * Rooms, this design draws no *door()*-framed sign or elevator graphic in
 * this Room -- its HUD nav pill ("↙ ELEVATOR · STAIRS · KITCHEN") still names
 * no in-world hotspot for the elevator/stairs legs, so this Room is still
 * reachable via Town Center's and the Kitchen's elevator/stairs doors, whose
 * `entryTile` points at this Room's own `spawnTile` (#16 D3 deviation).
 * `spawnTile` isn't any NPC's own interaction tile (#16 fix 4; see
 * `reachability.test.ts`).
 *
 * #100: the 2026-09-25 design resync (PR #101) adds a real in-world hotspot
 * after all -- a blinking floor arrow + "KITCHEN" label linking to
 * `Kitchen.dc.html` -- so this Room now has exactly one door, to the Kitchen
 * (`the-melt`), the first exit this Room has ever had.
 */
export const roofDeck: RoomDefinition = {
  id: 'roof-deck',
  title: 'THE MARKET',
  subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
  background: { kind: 'image', key: 'room-roof-deck', url: 'rooms/roof-deck.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 2 },
  doors: [
    {
      label: 'KITCHEN',
      // Traced from `design/Room 05 Roof Deck.dc.html`'s new `<a
      // href="Kitchen.dc.html">` group (#100): its `<g transform=
      // "translate(125,122)">` wraps the arrow's two polygons (the #00BDFF
      // arrow and its #0C4B5F drop-shadow, points 480-585 x 467.5-524 in
      // local design px, so Stage 605-710 x 589.5-646) and the "KITCHEN"
      // label.
      //
      // Top edge, y = 561, the label's top (#100 review nit 3, so the sign is
      // clickable like every other door's): the label's `<text transform=
      // "matrix(1 0.5 0 1 497 465.5)">` puts its baseline anchor at Stage
      // (497+125, 465.5+122) = (622, 587.5), skewed 0.5 px down per px
      // right. It's `text-anchor="middle"` and about 54 px wide (Anton 14px,
      // letter-spacing 2), so its left end (x ~595) sits 27 * 0.5 = 13.5 px
      // above the anchor, at y ~574, and Anton's ~12.5 px cap height at
      // font-size 14 puts the top of its first glyph at y ~561 -- matching
      // the exported `public/rooms/roof-deck.png`'s ink, whose topmost
      // label pixel is at y 561-562.
      //
      // Left edge, x = 619, not the arrow's 605 (#100 review minor 2):
      // Tristin's NPC slot { col: 5, row: 9 } centres at Stage (600, 625)
      // with an 18 px hit circle (x 582-618, y 607-643), and `RoomScene`
      // checks NPC hits before doors, so any part of this rect left of 619
      // -- the arrow's tip and the label's first letters -- would open
      // Tristin's Interaction instead. Starting at 619 keeps the two hit
      // zones disjoint. Right (710) and bottom (646) are still the arrow's
      // own edges; Brandon's hit circle (centre (700, 525), bottom y 543) sits
      // above the new top edge.
      //
      // Approach tile: the centre (664.5, 603.5) still maps via
      // `screenToTile` to { col: 5, row: 8 } -- the same walkable tile the
      // old 605-710 x 589-646 rect's centre (657.5, 617.5) mapped to.
      hotspot: { x: 619, y: 561, width: 91, height: 85 },
      targetRoomId: 'the-melt',
      // The Kitchen tile next to its own "ROOF DECK" door (#100, the same
      // rule `reachability.test.ts` uses for a door's approach tile): the
      // nearest walkable tile, in the Kitchen's own grid, to that door's
      // hotspot centre ({ x: 1290, y: 365, width: 70, height: 165 }, `the-
      // melt.ts`) -- which floors/BFS-walks out to { col: 10, row: 0 }, a
      // tile just off the Kitchen's own back counter.
      entryTile: { col: 10, row: 0 },
    },
  ],
  npcSlots: [
    // Kevin and Tristin are Penguins in the design, so they aren't placed.
    // Penguin-kind NPCs are left out of every Room: only Players appear as
    // Penguins (owner decision, 2026-09-25). Their `NpcDefinition`s stay in
    // `src/npcs/npcs.ts`.
    // "Ann Marie": a first-plus-middle given name, kept in full (kebab-cased)
    // rather than reduced to a single first name, unlike Darrin Jahnel/Sydney
    // Murauskas/Jon Keller's Firstname-Lastname pattern.
    { npcId: 'ann-marie', tile: { col: 4, row: 2 } },
    { npcId: 'millie', tile: { col: 2, row: 5 } },
    { npcId: 'josh', tile: { col: 11, row: 2 } },
    { npcId: 'brandon', tile: { col: 4, row: 6 } },
    { npcId: 'anthony', tile: { col: 7, row: 5 } },
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
