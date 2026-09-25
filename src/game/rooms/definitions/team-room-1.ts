import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid (#51 D2): `design/Team Room 1.dc.html` bakes a
// 10x8 floor, 80 tile diamonds whose first north corner is (800, 335) --
// `isolib.js`'s `setDims(10, 8)`, origin y round(560 - 18 * 50 / 4) = 335.
const GRID = createGrid({ x: 800, y: 335 }, 10, 8);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2);
// a tile is blocked where one footprint covers a quarter or more of its area
// (so a desk edge clipping 0.3 of a tile row leaves that row walkable):
//   - the four corner desks, each cols/rows 2.2x1 against a wall: back-left
//     cols 0.3-2.5, rows 0.3-1.3; back-right cols 7.5-9.7, rows 0.3-1.3;
//     front-left cols 0.3-2.5, rows 5.6-6.6; front-right cols 7.5-9.7, rows
//     5.6-6.6 -> (0,0), (1,0), (2,0), (1,1); (8,0), (9,0), (8,1); (0,5),
//     (1,5), (0-2,6); (8,5), (9,5), (7-9,6). Their chairs (e.g. cols
//     1.1-1.7, rows 1.5-2.1) fall inside those tiles;
//   - the two GPU racks, cols 2.9-3.9 and 6.9-7.9, rows 0.3-1.3 -> (3,0),
//     (3,1), (7,0), (7,1);
//   - the teal training table under the model cube, cols 3.8-6.2, rows
//     3.6-5.0 (its top overhangs by 0.2) -> (4,3), (5,3), (4,4), (5,4).
// Everything stacked on those (monitors, keyboards, the cube) is covered by
// them. The floor arrow and the dashed cable are flat floor art. Every NPC's
// own tile (see `npcSlots` below) is additionally blocked (#16 fix 5): Dom
// (4,0) and Jethro (7,2).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, true, true, false, false, false],
  [true, false, true, false, true, true, true, false, false, true],
  [true, true, true, true, true, true, true, false, true, true],
  [true, true, true, true, false, false, true, true, true, true],
  [true, true, true, true, false, false, true, true, true, true],
  [false, false, true, true, true, true, true, true, false, false],
  [false, false, false, true, true, true, true, false, false, false],
  [true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Team Room 1.dc.html`, "TEAM ROOM 1 · AI LAB" (#51). Its
 * one door, "HALLWAY →" on the back-right wall, is the bounding box of the
 * design's own door-frame polygon (`1050,460 1120,495 1120,365 1050,330`).
 * The floor arrow by the front-left desk is unlabelled floor art, not a door.
 */
export const teamRoom1: RoomDefinition = {
  id: 'team-room-1',
  title: 'TEAM ROOM 1',
  // The banner's "TEAM RM 1 · 337 SF · 2 GPU RACKS · TRAINING 73% · 3
  // PENGUINS", minus its fabricated live training progress and headcount
  // (#16 D2's rule).
  subtitle: 'TEAM RM 1 · 337 SF · 2 GPU RACKS',
  background: { kind: 'image', key: 'room-team-room-1', url: 'rooms/team-room-1.png' },
  grid: GRID,
  walkable: WALKABLE,
  // The design's "You" Penguin stands at (2.8, 6.2), on the front-left
  // desk's end tile (2,6); this is its nearest walkable tile.
  spawnTile: { col: 3, row: 6 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 1050, y: 330, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The tile just inside the Hallway's own TEAM ROOM 1 door: that door's
      // hotspot bottom-centre (the sill) projected into the Hallway's own
      // grid, then the nearest walkable tile (#16 fix 4, #51 review fix 2).
      entryTile: { col: 1, row: 0 },
    },
  ],
  npcSlots: [
    // Dom runs a loop (`domrun`); his slot is the tile under his shadow at
    // its rest (0%) frame. Jethro stands still; his slot is the tile under
    // his shadow.
    { npcId: 'dom-team-room-1', tile: { col: 4, row: 0 } },
    { npcId: 'jethro-team-room-1', tile: { col: 7, row: 2 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
