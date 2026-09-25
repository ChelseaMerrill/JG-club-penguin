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
  [true, false, false, false, true, false, true, false, true, false, true, true],
  [true, false, false, false, false, false, false, true, false, false, true, true],
  [true, true, false, false, false, false, false, true, false, false, true, false],
  [true, true, true, true, true, true, false, true, true, false, true, true],
  [true, false, false, true, true, true, true, true, true, true, true, true],
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
    { npcId: 'steven', tile: { col: 7, row: 1 } },
    // Dom removed from the Dev Pit (owner request, 2026-09-25, Track D): his
    // `NpcDefinition` stays in `npcs.ts` (other tests still reference his
    // name/title/figure), but he no longer has a slot in any Room. (2,5) --
    // his former tile, blocked in `WALKABLE` above only because he stood
    // there -- is left blocked: nothing in this file's own tests or
    // `reachability.test.ts` requires it to open back up (that test only
    // walks `npcSlots`, which no longer names him).
    { npcId: 'ryan', tile: { col: 5, row: 1 } },
    { npcId: 'sam', tile: { col: 9, row: 1 } },
    // Matt is a Penguin (a Player), like "You", not an NPC -- see the export
    // script's `LIVE_ELEMENT_RULES['dev-pit']` labels-rule comment. Players
    // are never part of a static `RoomDefinition`; presence (#28) places
    // them live. Contrast Town Center's Jory Hutchins, who *is* a designed
    // NPC but still gets no slot here, for a different reason (#16 fix 5).
  ],
};
