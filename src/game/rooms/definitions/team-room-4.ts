import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid (#51 D2): `design/Team Room 4.dc.html` bakes a
// 10x8 floor, 80 tile diamonds whose first north corner is (800, 335) --
// `isolib.js`'s `setDims(10, 8)`, origin y round(560 - 18 * 50 / 4) = 335.
const GRID = createGrid({ x: 800, y: 335 }, 10, 8);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2);
// a tile is blocked where one footprint covers a quarter or more of its area
// (so a desk edge clipping 0.3 of a tile row leaves that row walkable):
//   - the four corner desks: back-left cols 0.3-2.5, rows 0.3-1.3;
//     back-right cols 7.5-9.7, rows 0.3-1.3; front-left cols 0.3-2.5, rows
//     5.6-6.6; front-right cols 7.5-9.7, rows 5.6-6.6 -> (0,0), (1,0),
//     (2,0), (1,1); (7,0), (8,0), (9,0), (8,1); (0,5), (1,5), (0-2,6); (8,5),
//     (9,5), (7-9,6). Their chairs fall inside those tiles;
//   - the couch, cols 3.4-6.6, rows 2.6-3.7 -> (4,2), (5,2), (3-6,3). Its
//     ends on (3,2) and (6,2) stay walkable: they are the way past it to the
//     back of the room;
//   - the Beystadium, a hexagon spanning cols 3.9-6.1, rows 3.9-6.4, whose
//     body covers (4,4), (5,4), (4,5), (5,5). Its spinning tops are part of
//     the stadium prop.
// The floor arrow and the dashed cable are flat floor art. Every NPC's own
// tile (see `npcSlots` below) is additionally blocked (#16 fix 5): Michael
// (6,3, on the couch), Sam (8,2) and Ryan (8,1, in the back-right desk's
// chair).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, true, true, true, true, false, false, false],
  [true, false, true, true, true, true, true, true, false, true],
  [true, true, true, true, false, false, true, true, false, true],
  [true, true, true, false, false, false, false, true, true, true],
  [true, true, true, true, false, false, true, true, true, true],
  [false, false, true, true, false, false, true, true, false, false],
  [false, false, false, true, true, true, true, false, false, false],
  [true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Team Room 4.dc.html`, "TEAM ROOM 4 · THE POD" (#51).
 * Its one door, "HALLWAY →" on the back-right wall, is the bounding box of
 * the design's own door-frame polygon (`1030,450 1100,485 1100,355
 * 1030,320`). The floor arrow is unlabelled floor art, not a door, and the
 * Beystadium is a prop: Beystadium is not a Minigame in this build, so
 * Michael's Interaction is Dialogue.
 */
export const teamRoom4: RoomDefinition = {
  id: 'team-room-4',
  title: 'TEAM ROOM 4',
  // The banner's "TEAM RM 4 · 350 SF · 4 CORNER DESKS · COUCH · BEYSTADIUM ·
  // 3 PENGUINS", minus its fabricated live headcount (#16 D2's rule).
  subtitle: 'TEAM RM 4 · 350 SF · 4 CORNER DESKS · COUCH · BEYSTADIUM',
  background: { kind: 'image', key: 'room-team-room-4', url: 'rooms/team-room-4.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 3, row: 5 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 1030, y: 320, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The tile just inside the Hallway's own TEAM ROOM 4 door: that door's
      // hotspot bottom-centre (the sill) projected into the Hallway's own
      // grid, then the nearest walkable tile (#16 fix 4, #51 review fix 2).
      entryTile: { col: 7, row: 0 },
    },
  ],
  npcSlots: [
    // Each slot is the tile under the NPC's ground shadow (Michael's group is
    // translated by (-115, -20), so his shadow sits at (915, 580)).
    { npcId: 'michael', tile: { col: 6, row: 3 } },
    { npcId: 'sam-team-room-4', tile: { col: 8, row: 2 } },
    { npcId: 'ryan-team-room-4', tile: { col: 8, row: 1 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
