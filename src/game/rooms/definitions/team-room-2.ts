import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid (#51 D2): `design/Team Room 2.dc.html` bakes a
// 9x8 floor, 72 tile diamonds whose first north corner is (800, 348) --
// `isolib.js`'s `setDims(9, 8)`, origin y round(560 - 17 * 50 / 4) = 348.
const GRID = createGrid({ x: 800, y: 348 }, 9, 8);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2);
// a tile is blocked where one footprint covers a quarter or more of its area
// (so a desk edge clipping 0.3 of a tile row leaves that row walkable):
//   - the four corner desks: back-left cols 0.3-2.5, rows 0.3-1.3;
//     back-right cols 6.5-8.7, rows 0.3-1.3; front-left cols 0.3-2.5, rows
//     5.6-6.6; front-right cols 6.5-8.7, rows 5.6-6.6 -> (0,0), (1,0),
//     (2,0), (1,1); (6,0), (7,0), (8,0), (7,1); (7,5), (8,5), (6-8,6). Their
//     chairs (e.g. cols 7.3-7.9, rows 1.5-2.1) fall inside those tiles;
//   - the couch in front of the front-left desk, cols 0.6-3.0, rows
//     5.6-6.6 -> (0-2,5-6);
//   - the crit table, cols 3-6, rows 3.2-4.8 -> (3-5,3-4);
//   - the ottoman, cols 3.6-4.6, rows 6.4-7.4, which clips four tiles but
//     covers a quarter of only one -> (4,6).
// The front desk's edge on (6,5) stays walkable: it is the only way between
// the front of the room, where the design's "You" stands, and the rest.
// The floor arrows and the dashed cable are flat floor art. Every NPC's own
// tile (see `npcSlots` below) is additionally blocked (#16 fix 5): Ian (5,1).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, true, true, true, false, false, false],
  [true, false, true, true, true, false, true, false, true],
  [true, true, true, true, true, true, true, true, true],
  [true, true, true, false, false, false, true, true, true],
  [true, true, true, false, false, false, true, true, true],
  [false, false, false, true, true, true, true, false, false],
  [false, false, false, true, false, true, false, false, false],
  [true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Team Room 2.dc.html`, "TEAM ROOM 2 · UX STUDIO" (#51).
 * Its one door, "HALLWAY →" on the back-right wall, is the bounding box of
 * the design's own door-frame polygon (`1040,468 1110,503 1110,373
 * 1040,338`). The two floor arrows are unlabelled floor art, not doors.
 */
export const teamRoom2: RoomDefinition = {
  id: 'team-room-2',
  // The banner reads "TEAM Room 2"; upper-cased like every other Room title
  // and the Map's own "09 · TEAM ROOM 2" card.
  title: 'TEAM ROOM 2',
  // The banner's "TEAM RM 2 · 292 SF · STICKY WALL · 2 PENGUINS · CRIT AT
  // 3PM", minus its fabricated live headcount (#16 D2's rule).
  subtitle: 'TEAM RM 2 · 292 SF · STICKY WALL · CRIT AT 3PM',
  background: { kind: 'image', key: 'room-team-room-2', url: 'rooms/team-room-2.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 4, row: 5 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 1040, y: 338, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The tile just inside the Hallway's own TEAM ROOM 2 door: that door's
      // hotspot bottom-centre (the sill) projected into the Hallway's own
      // grid, then the nearest walkable tile (#16 fix 4, #51 review fix 2).
      entryTile: { col: 3, row: 0 },
    },
  ],
  npcSlots: [
    // The tile under Ian's shadow. The design draws his "TALK · BUG SQUASH"
    // prompt under him, so his Interaction is the Bug Squash Minigame.
    { npcId: 'ian-team-room-2', tile: { col: 5, row: 1 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
