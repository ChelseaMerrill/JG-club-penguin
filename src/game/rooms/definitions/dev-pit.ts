import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Room 02 Dev Pit.dc.html`'s fixtures: the "SPRINT 42"
// whiteboard/desk cluster (cols 1-4, rows 1-3, unchanged since #16) and a
// small pedestal by THE ICEBOX elevator (col 11, row 3). #92 D3 round 2:
// #91's five new desks are traced from the design's desk-body/chair *floor*
// polygons, not the monitor/keyboard sprites sitting atop them (those sit
// ~47.5px up-screen of the floor, one tile off from the desk's actual
// footprint -- round 1's mistake, caught in review): desk C (5,2)/(6,2)/
// (5,3)/(6,3) with its chair (6,4); desk E (8,2)/(9,2)/(8,3)/(9,3) with its
// chair (9,4); desk B (2,6)/(3,6) with its chair (3,7); desk D (5,6)/(6,6)
// with its chair (6,7); desk F (8,6)/(9,6) with its chair (9,7). Every NPC's
// own tile (see `npcSlots` below) is additionally blocked so a Penguin can't
// walk through them (#16 fix 5) -- this Room's floor was otherwise fully
// open.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, true, false, true, true, false, true, true, true],
  [true, false, false, false, false, false, false, true, false, false, true, true],
  [true, true, false, false, false, false, false, true, false, false, true, false],
  [true, true, true, true, true, true, false, true, true, false, true, true],
  [true, false, false, true, true, true, true, true, true, true, false, true],
  [true, true, false, false, true, false, false, true, false, false, true, true],
  [true, true, true, false, true, true, false, true, true, false, true, true],
  [true, false, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 02 Dev Pit.dc.html`: a real door back to Town
 * Center, and THE ICEBOX disabled (not one of this prototype's five Rooms).
 * The design has no in-scene door or elevator toward the Kitchen at all
 * (confirmed: no "MELT"/"KITCHEN" text anywhere in the file), so this
 * Room defines no door to the Kitchen.
 */
export const devPit: RoomDefinition = {
  id: 'dev-pit',
  title: 'DEV PIT',
  subtitle: 'TEAM RMS 1–4 · FLOOR 5',
  background: { kind: 'image', key: 'room-dev-pit', url: 'rooms/dev-pit.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 1 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 830, y: 135, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'the-icebox',
      // The tile just inside the Icebox's own "DEV PIT" door: project that
      // door's own hotspot bottom-centre (the door sill, not its centre)
      // into the Icebox's own grid, then the nearest walkable tile (#16 fix
      // 4, #51 D4, #51 review fix 2). The centre-based projection landed on
      // (9,0), close enough to Jason's own tile (8,0) to visually overlap
      // his sprite as the Penguin arrived.
      entryTile: { col: 10, row: 0 },
    },
    {
      label: 'TOWN CENTER',
      hotspot: { x: 700, y: 135, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // The tile just inside Town Center's own "DEV PIT" door (#16 fix 4):
      // the nearest walkable tile to that door's hotspot centre in Town
      // Center's own grid, the same rule `reachability.test.ts` uses for a
      // door's approach tile.
      entryTile: { col: 10, row: 0 },
    },
  ],
  npcSlots: [
    // #92 D3 round 2: #91 moved every NPC in this Room; slots resynced to
    // each one's new shadow position (round 1 left these stale, caught in
    // review).
    { npcId: 'ashley', tile: { col: 1, row: 8 } },
    { npcId: 'ian', tile: { col: 1, row: 5 } },
    // Steven left the Dev Pit (owner request, 2026-10-02, Track D: the
    // Characters sheet puts him in the Remote Lounge); his `NpcDefinition`
    // stays, and his (7,1) is open again.
    //
    // New from the Characters sheet (owner request, 2026-10-02, Track D):
    // Alex Nikolis and Alex Kelly sit at the back desks, working: each stands
    // just inside his desk's back edge, beside its monitor, and the desk is
    // drawn over him (`foregrounds` below), as Team Room 3's Millie sits at
    // hers. `offset` moves each from his tile's point to that spot: Nikolis
    // (1015, 460) at desk C, Kelly (1165, 535) at desk E. Jesse Lucier walks
    // laps round the desks (`motions/dev-pit.ts`) from (10,5).
    { npcId: 'alex-nikolis', tile: { col: 5, row: 1 }, offset: { x: 15, y: 35 } },
    { npcId: 'alex-kelly', tile: { col: 8, row: 1 }, offset: { x: 15, y: 35 } },
    { npcId: 'jesse-lucier', tile: { col: 10, row: 5 } },
    // Dom removed from the Dev Pit (owner request, 2026-09-25, Track D): his
    // `NpcDefinition` stays in `npcs.ts` (other tests still reference his
    // name/title/figure), but he no longer has a slot in any Room. (2,5) --
    // his former tile, blocked in `WALKABLE` above only because he stood
    // there -- is left blocked: nothing in this file's own tests or
    // `reachability.test.ts` requires it to open back up (that test only
    // walks `npcSlots`, which no longer names him).
    // Ryan and Sam removed from the Dev Pit (owner request, 2026-09-30,
    // Track D): as with Dom, their `NpcDefinition`s stay in `npcs.ts` (Team
    // Room 4's own Ryan and Sam share their figures), but they no longer
    // have a slot here. Their former tiles, (5,1) and (9,1), are open again
    // in `WALKABLE` above (since taken by Alex Nikolis at (5,1)).
    // Matt is a Penguin (a Player), like "You", not an NPC -- see the export
    // script's `LIVE_ELEMENT_RULES['dev-pit']` labels-rule comment. Players
    // are never part of a static `RoomDefinition`; presence (#28) places
    // them live. Contrast Town Center's Jory Hutchins, a designed Human NPC
    // who has her own slot there (#137).
  ],
  // #140: the CI board, Quest "Pair with a JGer and fix the flaky test"'s
  // "check-ci-board" step. A hit zone over the right wall's BUILD PASSING
  // build monitor (traced from a 1600x900 Room screenshot: the monitor spans
  // about x 950-1250, y 140-375), stopping above the whiteboard and Alex
  // Nikolis's desk below it. There is no existing clickable prop here to
  // reuse (#16 D5's only other Room hotspots are the Igloo's trophy-case and
  // the Roof Deck's igloo-gear-stall), so this is a hit zone over that art
  // rather than a newly exported asset.
  hotspots: [
    {
      id: 'ci-board',
      label: 'CI Board',
      rect: { x: 950, y: 140, width: 300, height: 200 },
    },
  ],
  // The back desks, drawn in front of the two Alexes sitting at them.
  // Exported by `npm run export:room-art -- dev-pit` (`FOREGROUND_LAYERS`).
  foregrounds: [
    {
      key: 'room-dev-pit-front-nikolis-desk',
      url: 'rooms/dev-pit-front-nikolis-desk.png',
      overNpcId: 'alex-nikolis',
    },
    {
      key: 'room-dev-pit-front-kelly-desk',
      url: 'rooms/dev-pit-front-kelly-desk.png',
      overNpcId: 'alex-kelly',
    },
  ],
};
