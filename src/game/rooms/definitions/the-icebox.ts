import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// The standard 12x10 grid at origin (800, 250) (#16 D2, `grid.ts`'s
// `createStandardRoomGrid`), confirmed against `design/Room 03 The
// Icebox.dc.html`'s baked floor: 12 column runs of 10 tile diamonds each,
// the first north corner at (800, 250), the back walls running
// (800,250)->(300,500) (10 rows) and (800,250)->(1400,550) (12 columns)
// (#51 D2).

// The shape both door hotspots in this Room use: the design's shared
// `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2):
//   - the credenza under the kickoff whiteboard: cols 4.4-5.6, rows 0-0.5
//     -> (4,0), (5,0);
//   - the conference table: cols 3.5-8.5, rows 3.6-5.6, its top overhanging
//     to cols 3.3-8.7, rows 3.4-5.8 -> cols 3-8, rows 3-5;
//   - its eight chairs, four a side, at rows 2.6-3.2 and 6.1-6.7, centred on
//     cols 4.1, 5.4, 6.7 and 8.0 -> (4,2), (5,2), (6,2), (8,2) and (4,6),
//     (5,6), (6,6), (8,6); the fourth chair of each row (centred on 8.0) is
//     wide enough to also cover (7,2)/(7,6), blocked below too (#51 review
//     fix 4);
//   - the corner planter: cols 11-11.8, rows 8.8-9.6 -> (11,9).
// Every NPC's own tile (see `npcSlots` below) is additionally blocked so a
// Penguin can't walk through them (#16 fix 5): Nicole (1,7), Jethro (4,9),
// and Dan Bedian's (3,2) at the table (Paul's and Greg's sit on the table's
// own tiles). Millie's (1,0), Jason's (8,0) and Darrin's (10,6) are open
// again: they left the Icebox (owner request, 2026-10-02, Track D). The floor-arrow decal by the
// left wall is hidden from the exported art (#132 -- it wasn't a working
// door); its tile stays walkable floor regardless.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, false, false, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, true, false, false, false, false, false, true, true, true],
  [true, false, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, false, true, true, true, true, true, true, false],
];

/**
 * Traced from `design/Room 03 The Icebox.dc.html` (#51). Doors: "← TOWN
 * CENTER" on the back-left wall and "DEV PIT →" on the back-right wall, each
 * hotspot the bounding box of the design's own door-frame polygon
 * (`775,262.5 705,297.5 705,167.5 775,132.5` and `1290,495 1360,530
 * 1360,400 1290,365`). The design's "ASK JETHRO FOR A PHOTO" panel is a
 * photo mechanic, not a door or Minigame, and is out of this Room's scope.
 */
export const theIcebox: RoomDefinition = {
  id: 'the-icebox',
  title: 'THE ICEBOX',
  // The banner's "CONFERENCE · 604 SF · GLASS WALL · KICKOFF IN 04:32",
  // minus its fabricated live countdown (#16 D2's rule).
  subtitle: 'CONFERENCE · 604 SF · GLASS WALL',
  background: { kind: 'image', key: 'room-the-icebox', url: 'rooms/the-icebox.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin.
  spawnTile: { col: 5, row: 7 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 705, y: 132.5, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // The tile just inside Town Center's own "THE ICEBOX" door: project
      // that door's own hotspot bottom-centre (the door sill, not its
      // centre) into Town Center's own grid, then the nearest walkable tile
      // (#16 fix 4, #51 review fix 2). Unchanged by that fix -- the sill and
      // centre projections land on the same tile here.
      entryTile: { col: 2, row: 0 },
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1290, y: 365, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'dev-pit',
      // The tile just inside Dev Pit's own "THE ICEBOX" door: project that
      // door's own hotspot bottom-centre (the door sill, not its centre)
      // into Dev Pit's own grid, then the nearest walkable tile (#16 fix 4,
      // #51 review fix 2).
      entryTile: { col: 1, row: 0 },
    },
  ],
  npcSlots: [
    // Each slot is the tile under the NPC's ground shadow at its
    // roam animation's rest (0%) frame -- the frame the design shows at load.
    { npcId: 'nicole', tile: { col: 1, row: 7 } },
    // Jethro: drawn at the design's own point for his walk's start, its
    // shadow (590, 525) moved by `jetRoam`'s 0% translate(-20px, 65px), so
    // (570, 590) (owner request, 2026-10-01, Track D).
    { npcId: 'jethro', tile: { col: 4, row: 9 }, offset: { x: 20, y: -10 } },
    // Millie, Jason and Darrin left the Icebox so that each person appears
    // in one Room only (owner request, 2026-10-02, Track D): Millie is at the
    // Market and in Team Room 3, Jason in the Mullet, Darrin in Town Center.
    //
    // New from the Characters sheet (owner request, 2026-10-02, Track D):
    // Dan Bedian, Paul Carnival and Greg Westover sit in three of the four
    // chairs along the conference table's back edge, whose seats the design
    // centres at (860, 400), (925, 432.5) and (990, 465). Each stands 25 px
    // into the table from his seat, and the table is drawn over him
    // (`foregrounds` below), so he sits at it. `offset` moves each from his
    // tile's point to that spot.
    { npcId: 'dan-bedian', tile: { col: 3, row: 2 }, offset: { x: 10, y: 25 } },
    { npcId: 'paul-carnival', tile: { col: 4, row: 2 }, offset: { x: 25, y: 32.5 } },
    { npcId: 'greg-westover', tile: { col: 6, row: 2 }, offset: { x: -10, y: 15 } },
    // "You" is the local Player's own Penguin, never a static NPC slot
    // (compare Dev Pit's Matt).
  ],
  // The table in front of the three sitting at it, sorted with the one
  // furthest forward (Greg), so it covers all three. Exported by `npm run
  // export:room-art -- the-icebox` (`FOREGROUND_LAYERS`).
  foregrounds: [
    {
      key: 'room-the-icebox-front-conference-table',
      url: 'rooms/the-icebox-front-conference-table.png',
      overNpcId: 'greg-westover',
    },
  ],
};
