import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';
import { officeHallway } from './office-hallway';

// Not the standard 12x10 grid (#51 D2): `design/Room 13 Bathroom.dc.html`
// bakes an 8x6 tiled floor, 48 tile diamonds whose first north corner is
// (800, 385) -- `isolib.js`'s `setDims(8, 6)`, origin y round(560 - 14 * 50
// / 4) = 385.
const GRID = createGrid({ x: 800, y: 385 }, 8, 6);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2);
// a tile is blocked where one footprint covers a quarter or more of its area
// (so a desk edge clipping 0.3 of a tile row leaves that row walkable):
//   - the two stalls along the left wall, cols 0.2-2.0, rows 0.3-1.9 and
//     2.1-3.7 -> (0-1,0-3);
//   - the sink vanity along the back-right wall, cols 2.6-5.8, rows 0.2-1.1
//     -> (2,0), (3,0), (4,0), (5,0);
//   - the wet-floor cone, its base at cols 5.5-6.1, row 4.6 -> (5,4): its
//     footprint covers far less than a quarter of the tile, an explicit
//     exception to the rule above -- a physical hazard prop, blocked
//     regardless of footprint size.
// The "MELTED ICE · CAUTION" puddle label and the floor arrow are flat floor
// art. The design also draws Jessie waiting outside the stalls at (3,1), but
// only Players appear as Penguins in the World (owner decision 2026-09-25;
// PR #133), so she gets no npcSlot and that tile stays walkable.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, true, true],
  [false, false, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true],
  [true, true, true, true, true, false, true, true],
  [true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 13 Bathroom.dc.html` (#51), which titles it THE
 * THAW ROOM. Its one door, "HALLWAY →" on the back-right wall, is the
 * bounding box of the design's own door-frame polygon (`1100,535 1170,570
 * 1170,440 1100,405`). The floor arrow is unlabelled floor art, not a door.
 * No Room draws a door into the Bathroom, so it is reached by the Map (#51
 * D5).
 */
export const bathroom: RoomDefinition = {
  id: 'bathroom',
  title: 'THE THAW ROOM',
  // The banner's "BATHROOM · FLOOR 5 · 1 OF 2 STALLS FREE · SNOWBALLS
  // DISABLED", minus its fabricated live stall count (#16 D2's rule) and its
  // "SNOWBALLS DISABLED" claim, a rule this build doesn't implement.
  subtitle: 'BATHROOM · FLOOR 5',
  background: { kind: 'image', key: 'room-bathroom', url: 'rooms/bathroom.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 1, row: 4 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 1100, y: 405, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The Hallway draws no Bathroom door of its own, so this lands on the
      // Hallway's own spawn tile, as the Igloo's TOWN CENTER door does (#16
      // fix 4).
      entryTile: officeHallway.spawnTile,
    },
  ],
  npcSlots: [
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
