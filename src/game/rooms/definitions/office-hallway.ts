import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';
import { townCenter } from './town-center';

// Not the standard 12x10 grid (#51 D2): `design/Room 11 Office
// Hallway.dc.html` bakes a 15x4 corridor floor, 60 tile diamonds whose first
// north corner is (800, 329) -- `isolib.js`'s `setDims(15, 3.5)`, whose origin
// y is round(560 - (15 + 3.5) * 50 / 4) = 329. Its 3.5-deep floor slab still
// draws a fourth, half-overhanging row of tiles, so the grid has 4 rows.
const GRID = createGrid({ x: 800, y: 329 }, 15, 4);

// The shape every wall door in this Room uses: the design's shared `door()`
// frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// The TEAM ROOM 7-9 floor markers on the corridor's front edge: each
// hotspot is the bounding box of the marker bar and its "TEAM ROOM n ↓"
// label together.
const FLOOR_MARKER_SIZE = { width: 97, height: 44 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2),
// a tile blocked where the footprint covers a quarter or more of its area:
// the planter under the window, cols 11.65-12.45, rows 0.3-1.1 -> (12,0)
// (it covers 0.245 of (11,0), whose centre is clear). The floor arrow
// toward TOWN CENTER, the cyan runner and the TEAM ROOM 7-9 markers are
// flat floor art and stay walkable. Every NPC's own tile (see `npcSlots`
// below) is additionally blocked so a Penguin can't walk through them (#16
// fix 5): Emily Smith (4,3) and Anthony Conway (5,3). Emily's and Anthony's
// raw nearest-tile picks, (3,3) and (6,3), each sat under (or, for Emily,
// overlapping) the TEAM ROOM 7/8 floor markers' own hit rects; both are
// moved one tile toward each other instead, confirmed against `iso.ts`'s
// tile math and the NPC click area then in `RoomScene.ts` (a fixed 64x110
// zone) that neither NPC's hit zone intersects a marker's hotspot rect (#51
// review fix 5). #113's smaller click area (`npc-layout.ts`'s `hitArea`)
// fits inside that old zone, so it still holds. The
// design also draws Michael S. at (5,1), Samantha at (11,1) and Daniel at
// (13,2), but only Players appear as Penguins in the World (owner decision
// 2026-09-25; PR #133), so those three aren't NPCs and their tiles stay
// walkable.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, false, false, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 11 Office Hallway.dc.html` (#51), which titles it
 * THE CORRIDOR. Doors: "← TOWN CENTER" on the back-left wall, "TEAM ROOM 1"
 * to "TEAM ROOM 6" along the back-right wall, and the "TEAM ROOM 7-9 ↓"
 * markers on the front edge. Each wall-door hotspot is the bounding box of
 * the design's own door-frame polygon (e.g. TEAM ROOM 1's `830,344 900,379
 * 900,249 830,214`). TEAM ROOM 5-9 have no designs, so they stay disabled
 * (#51 D4). No prototype Room draws a door into the Hallway, so from them it
 * is reached by the Map (#51 D5); the Team Rooms' and Bathroom's HALLWAY
 * doors lead back here.
 */
export const officeHallway: RoomDefinition = {
  id: 'office-hallway',
  title: 'THE CORRIDOR',
  // The banner's "OFFICES 1–9 · KNOCK BEFORE YOU WADDLE · 4 PENGUINS", minus
  // its fabricated live headcount (#16 D2's rule).
  subtitle: 'OFFICES 1–9 · KNOCK BEFORE YOU WADDLE',
  background: { kind: 'image', key: 'room-office-hallway', url: 'rooms/office-hallway.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 2, row: 2 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 680, y: 224, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // Town Center has no door of its own into the Hallway, so this lands
      // on Town Center's own spawn tile, as the Igloo's TOWN CENTER door does
      // (#16 fix 4).
      entryTile: townCenter.spawnTile,
    },
    {
      label: 'TEAM ROOM 1',
      hotspot: { x: 830, y: 214, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'team-room-1',
      // The tile just inside Team Room 1's own HALLWAY door: that door's
      // hotspot bottom-centre (the sill) projected into Team Room 1's own
      // grid, then the nearest walkable tile (#16 fix 4, #51 review fix 2).
      entryTile: { col: 6, row: 0 },
    },
    {
      label: 'TEAM ROOM 2',
      hotspot: { x: 925, y: 261.5, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'team-room-2',
      // Team Room 2's own HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
    },
    {
      label: 'TEAM ROOM 3',
      hotspot: { x: 1020, y: 309, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'team-room-3',
      // Team Room 3's own HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
    },
    {
      label: 'TEAM ROOM 4',
      hotspot: { x: 1115, y: 356.5, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'team-room-4',
      // Team Room 4's own HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
    },
    {
      label: 'TEAM ROOM 5',
      hotspot: { x: 1210, y: 404, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'TEAM ROOM 6',
      hotspot: { x: 1305, y: 451.5, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'TEAM ROOM 7',
      hotspot: { x: 706, y: 464, ...FLOOR_MARKER_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'TEAM ROOM 8',
      hotspot: { x: 906, y: 564, ...FLOOR_MARKER_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'TEAM ROOM 9',
      hotspot: { x: 1106, y: 664, ...FLOOR_MARKER_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
  ],
  npcSlots: [
    // The design also draws Michael S., Samantha and Daniel here, but only
    // Players appear as Penguins in the World (owner decision 2026-09-25;
    // PR #133), so they get no npcSlot.
    // The design draws Emily and Anthony in front of the corridor, off its
    // floor (their shadows project to (5.5, 6.9) and (8.7, 7.3), both off
    // the 4-row floor grid). Their raw nearest-tile picks would be (3,3) and
    // (6,3), but those sit on/overlapping the TEAM ROOM 7/8 floor markers'
    // own hit rects, so each is moved one tile toward the other's own door
    // instead -- see the `WALKABLE` comment above (#51 review fix 5).
    { npcId: 'emily', tile: { col: 4, row: 3 } },
    { npcId: 'anthony-hallway', tile: { col: 5, row: 3 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
