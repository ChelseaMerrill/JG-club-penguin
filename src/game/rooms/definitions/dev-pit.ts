import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Room 02 Dev Pit.dc.html`'s fixtures: the "SPRINT 42"
// whiteboard/desk cluster (cols 1-4, rows 1-3) and a small pedestal by THE
// ICEBOX elevator (col 11, row 3). Every NPC's own tile (see `npcSlots`
// below) is additionally blocked so a Penguin can't walk through them (#16
// fix 5) -- this Room's floor was otherwise fully open.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, true, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, true, false, false, true, true, true],
  [true, true, false, false, false, true, true, true, true, true, true, false],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, true, true, true, true, true, true, true, true],
  [true, true, false, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, false, true],
  [true, true, true, false, true, true, true, true, true, true, true, true],
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
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 1 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 830, y: 135, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
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
    // Matt is a Penguin (a Player), like "You", not an NPC -- see the export
    // script's `LIVE_ELEMENT_RULES['dev-pit']` labels-rule comment. Players
    // are never part of a static `RoomDefinition`; presence (#28) places
    // them live. Contrast Town Center's Jory Hutchins, who *is* a designed
    // NPC but still gets no slot here, for a different reason (#16 fix 5).
  ],
};
