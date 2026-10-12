import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid (#51 D2): `design/Room 11 Office
// Hallway.dc.html` bakes a 15x4 corridor floor, 60 tile diamonds whose first
// north corner is (800, 329) -- `isolib.js`'s `setDims(15, 3.5)`, whose origin
// y is round(560 - (15 + 3.5) * 50 / 4) = 329. Its 3.5-deep floor slab still
// draws a fourth, half-overhanging row of tiles, so the grid has 4 rows.
const GRID = createGrid({ x: 800, y: 329 }, 15, 4);

// The shape every wall door in this Room uses: the design's shared `door()`
// frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2),
// a tile blocked where the footprint covers a quarter or more of its area:
// the planter under the window, cols 11.65-12.45, rows 0.3-1.1 -> (12,0)
// (it covers 0.245 of (11,0), whose centre is clear). The cyan runner is flat
// floor art and stays walkable; the floor arrow toward TOWN CENTER and the
// TEAM ROOM 7-9 floor markers are gone from the design (2026-09-27 resync,
// #170). Every NPC's own tile (see `npcSlots` below) is additionally blocked
// so a Penguin can't walk through them (#16 fix 5): Emily Smith (4,3).
// Anthony Conway's (5,3) is open again (he left the Hallway, owner request,
// 2026-10-02, Track D). Emily's raw nearest-tile pick, (3,3), sat under the
// old TEAM ROOM 7 floor marker's hit rect, so she was moved one tile along
// (#51 review fix 5). The design also draws Michael S. at (5,1), Samantha at
// (11,1) and Daniel at (13,2), but only Players appear as Penguins in the
// World (owner decision 2026-09-25; PR #133), so those three aren't NPCs and
// their tiles stay walkable.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, false, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 11 Office Hallway.dc.html` (#51), which titles it
 * THE CORRIDOR (the game says THE HALLWAY). #170's door network (the
 * 2026-09-27 resync): "← TOWN CENTER" on the back-left wall, and TEAM ROOM 1
 * to 4, BATHROOM and DEV PIT along the back-right wall (the last two reuse the
 * old TEAM ROOM 5 and 6 frames), each hotspot the bounding box of the
 * design's own door-frame polygon (e.g. TEAM ROOM 1's `830,344 900,379
 * 900,249 830,214`). The baked "↙ TOWN CENTER" and "DEV PIT ↘" exit pills
 * are twins of those doors.
 *
 * Each `entryTile` is the sill inside the matching door of the Room it leads
 * to (#170 D8; `door-network.test.ts` re-derives every one), and each
 * `guardTile` is where Anthony stands while he guards that door (D14;
 * `guard-tiles.test.ts` checks I1-I7). Approach tiles are shared along the
 * corridor (TOWN CENTER and TEAM ROOM 1 both approach (0,0), and each later
 * door approaches the previous door's sill), so every guard tile stands off
 * row 0, in front of its own door.
 */
export const officeHallway: RoomDefinition = {
  id: 'office-hallway',
  // "THE HALLWAY", not the design's THE CORRIDOR (owner request, 2026-10-01,
  // Track D).
  title: 'THE HALLWAY',
  // #170 Q4: the design banner's "HALLWAY A · TEAM ROOMS 1–4 · BATHROOM · DEV
  // PIT", without "HALLWAY A" (the title says THE HALLWAY).
  subtitle: 'TEAM ROOMS 1–4 · BATHROOM · DEV PIT',
  background: { kind: 'image', key: 'room-office-hallway', url: 'rooms/office-hallway.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 2, row: 2 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 680, y: 224, ...DOOR_HOTSPOT_SIZE },
      wall: 'left',
      targetRoomId: 'town-center',
      // The sill inside Town Center's THE HALLWAY door.
      entryTile: { col: 10, row: 0 },
      // In front of the door, off the shared approach (0,0), the TEAM ROOM 1
      // approach (0,0) and this Room's own sill (0,2).
      guardTile: { col: 1, row: 2 },
    },
    {
      label: 'TEAM ROOM 1',
      hotspot: { x: 830, y: 214, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'team-room-1',
      // The sill inside Team Room 1's THE HALLWAY door: that door's hotspot
      // bottom-centre projected into Team Room 1's grid (#16 fix 4, #51
      // review fix 2).
      entryTile: { col: 6, row: 0 },
      // Across the corridor from the door (#170 D14, G-1 Option A).
      guardTile: { col: 3, row: 2 },
    },
    {
      label: 'TEAM ROOM 2',
      hotspot: { x: 925, y: 261.5, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'team-room-2',
      // Team Room 2's own THE HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
      // The corridor's front edge, under the door.
      guardTile: { col: 6, row: 3 },
    },
    {
      label: 'TEAM ROOM 3',
      hotspot: { x: 1020, y: 309, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'team-room-3',
      // Team Room 3's own THE HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
      // The corridor's front edge, under the door.
      guardTile: { col: 8, row: 3 },
    },
    {
      label: 'TEAM ROOM 4',
      hotspot: { x: 1115, y: 356.5, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'team-room-4',
      // Team Room 4's own THE HALLWAY door sill, as above.
      entryTile: { col: 5, row: 0 },
      // The corridor's front edge, under the door.
      guardTile: { col: 10, row: 3 },
    },
    {
      label: 'BATHROOM',
      hotspot: { x: 1210, y: 404, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'bathroom',
      // The sill inside the Bathroom's THE HALLWAY door.
      entryTile: { col: 7, row: 0 },
      // Under the door, two rows down.
      guardTile: { col: 11, row: 2 },
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1305, y: 451.5, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'dev-pit',
      // The sill inside the Dev Pit's THE HALLWAY door.
      entryTile: { col: 0, row: 1 },
      // Directly in front of the door, a row out from its sill (11,0). Not
      // the plan's (10,0): there, his click zone covers part of the BATHROOM
      // door (RT170-22, I7).
      guardTile: { col: 12, row: 1 },
    },
    {
      // The "↙ TOWN CENTER" exit pill: the TOWN CENTER door's twin.
      label: 'TOWN CENTER',
      hotspot: { x: 36, y: 748, width: 136.5, height: 40 },
      kind: 'pill',
      targetRoomId: 'town-center',
      entryTile: { col: 10, row: 0 },
    },
    {
      // The "DEV PIT ↘" exit pill: the DEV PIT door's twin.
      label: 'DEV PIT',
      hotspot: { x: 1465.5, y: 748, width: 98.5, height: 40 },
      kind: 'pill',
      targetRoomId: 'dev-pit',
      entryTile: { col: 0, row: 1 },
    },
  ],
  npcSlots: [
    // The design also draws Michael S., Samantha and Daniel here, but only
    // Players appear as Penguins in the World (owner decision 2026-09-25;
    // PR #133), so they get no npcSlot.
    // The design draws Emily in front of the corridor, off its floor (her
    // shadow projects to (5.5, 6.9), off the 4-row floor grid). Her raw
    // nearest-tile pick would be (3,3), under the old TEAM ROOM 7 floor
    // marker's hit rect, so she was moved one tile along (#51 review fix 5).
    { npcId: 'emily', tile: { col: 4, row: 3 } },
    // Anthony Conway left the Hallway so that he appears in one Room only
    // (owner request, 2026-10-02, Track D): he guards a door as the Phishing
    // Quiz's `anthony` (#146), here too since #170 (Q1). Emily walks laps of
    // the corridor instead of standing still (`motions/office-hallway.ts`).
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
