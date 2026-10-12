import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid (#51 D2): `design/Team Room 3.dc.html` bakes a
// 9x8 floor, 72 tile diamonds whose first north corner is (800, 348) --
// `isolib.js`'s `setDims(9, 8)`, origin y round(560 - 17 * 50 / 4) = 348.
const GRID = createGrid({ x: 800, y: 348 }, 9, 8);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures (#51 D2). Most are hand-drawn faces
// rather than `box()` triples, so each footprint comes from the floor edges
// of its own side faces; a tile is blocked where one footprint covers a
// quarter or more of its area (so a desk edge clipping 0.3 of a tile row
// leaves that row walkable):
//   - the couch against the back-right wall, cols 0.4-2.8, rows 0.16-1.16
//     -> (0,0), (1,0), (2,0);
//   - the server rack beside it, cols 3.28-3.88, rows 0.16-0.76 -> (3,0);
//   - the back-right desk, cols 6.5-8.7, rows 0.3-1.3 -> (6,0), (7,0),
//     (8,0), (7,1);
//   - the front-left desk, cols 0.3-2.5, rows 5.6-6.6, with Millie's chair
//     at cols 1.1-1.7, rows 4.8-5.4 -> (0,5), (1,5), (0-2,6);
//   - the hologram table, cols 3.4-5.6, rows 3.4-5.0 -> (3-5,3-4);
//   - Sydney's desk, its legs at cols 5.6-5.8 and 7.6-7.8, rows 5-6 -> (5,5),
//     (6,5), (7,5). Her chair sits on her own tile.
// The floor arrow and the dashed cable are flat floor art. Every NPC's own
// tile (see `npcSlots` below) is additionally blocked (#16 fix 5): Sydney
// (6,4). Casey's (1,0) is on the couch, so it stays blocked; Millie's (1,4)
// is open again (both left, owner request, 2026-10-02, Track D).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, true, true, false, false, false],
  [true, true, true, true, true, true, true, false, true],
  [true, true, true, true, true, true, true, true, true],
  [true, true, true, false, false, false, true, true, true],
  [true, true, true, false, false, false, false, true, true],
  [false, false, true, true, true, false, false, false, true],
  [false, false, false, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Team Room 3.dc.html`, "TEAM ROOM 3 · DATA CAVE" (#51).
 * Its one door, "HALLWAY →" on the back-right wall, is the bounding box of
 * the design's own door-frame polygon (`1035,465.5 1105,500.5 1105,370.5
 * 1035,335.5`). The floor arrow is unlabelled floor art, not a door.
 */
export const teamRoom3: RoomDefinition = {
  id: 'team-room-3',
  title: 'TEAM ROOM 3',
  // The banner's "TEAM RM 3 · 287 SF · LIGHTS LOW · 2 HUMANS · 1 PENGUIN ·
  // 4 DASHBOARDS", minus its fabricated live headcount (#16 D2's rule).
  subtitle: 'TEAM RM 3 · 287 SF · LIGHTS LOW · 4 DASHBOARDS',
  background: { kind: 'image', key: 'room-team-room-3', url: 'rooms/team-room-3.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin (its group
  // is translated by (290, 40), so its shadow sits at (1000, 653)).
  spawnTile: { col: 8, row: 4 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 1035, y: 335.5, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The tile just inside the Hallway's own TEAM ROOM 3 door: that door's
      // hotspot bottom-centre (the sill) projected into the Hallway's own
      // grid, then the nearest walkable tile (#16 fix 4, #51 review fix 2).
      entryTile: { col: 5, row: 0 },
    },
  ],
  npcSlots: [
    // The slot is the tile under the NPC's ground shadow: Sydney at her desk.
    // Its `offset` moves her from that tile's point to the design's own feet
    // point (her figure `<svg>`'s x + 60 * 0.58, y + 120 * 0.58), (899,
    // 617.3), so the desk in `foregrounds` lines up with her (owner request,
    // 2026-09-30, Track D). Casey (on the couch) and Millie (at the
    // front-left desk) left Team Room 3 (owner request, 2026-10-02, Track D):
    // the Characters sheet puts both in the Remote Lounge, not built yet.
    { npcId: 'sydney-team-room-3', tile: { col: 6, row: 4 }, offset: { x: -1, y: -5.7 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
  // What the design draws after Sydney's figure, so she sits at her desk
  // instead of standing on top of it (owner request, 2026-09-30, Track D).
  // Exported by `npm run export:room-art -- team-room-3`
  // (`FOREGROUND_LAYERS`).
  foregrounds: [
    {
      key: 'room-team-room-3-front-sydney-desk',
      url: 'rooms/team-room-3-front-sydney-desk.png',
      overNpcId: 'sydney-team-room-3',
    },
  ],
};
