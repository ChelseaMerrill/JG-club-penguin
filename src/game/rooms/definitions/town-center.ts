import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { roofDeck } from './roof-deck';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses, from the design's shared
// `door()` isolib helper -- except the sliding-panel elevator, which isn't
// drawn with that frame (see the ELEVATOR door below).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };
const ELEVATOR_HOTSPOT_SIZE = { width: 90, height: 175 };

// Traced from the design's fixtures: `box()`-drawn desks/counters/stairs
// inverted from their screen polygons back to grid tiles (see the #16
// execution plan). Unwalkable tiles: the elevator/Icebox recesses along the
// back wall (rows 0-2), the Front Desk counter (cols 3-8, rows 0-1), the
// stairwell platform (cols 1-4, rows 6-7), the "SHIP IT" pedestal (cols 2-3,
// rows 8-9), and the recurring corner light/statue pedestal (cols 10-11,
// rows 7-8) that every one of the five prototype Rooms places in about the
// same spot (Dev Pit's own comment names it correctly; this Room's used to
// mislabel it "a planter" -- #16 fix 5). Darrin's and Jon's own tiles (see
// `npcSlots` below) are additionally blocked so a Penguin can't walk through
// them (#16 fix 5); Sydney's and the Front Desk penguin's tiles already sat
// on unwalkable fixtures.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, false, false, false, false, false, false, false, true, true],
  [false, false, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, true, false, false, false, false, false, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, false, true, true, true, true, true],
  [true, false, false, false, false, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 01 Town Center.dc.html`. Doors: DEV PIT (real,
 * `door()`-styled sign), THE ICEBOX and STAIRWELL (both disabled — neither
 * Room is in this prototype's five), and the sliding-panel elevator labelled
 * "ELEVATOR · ROOF DECK" (real; its hotspot is the two animated door panels'
 * bounding box, since it isn't drawn with the same `door()` frame as the
 * others). The design also shows a "KITCHEN ↘" HUD exit pill with no in-scene
 * door graphic to place a hotspot on, so this Room has no door to The Melt
 * (The Melt's own "← TOWN CENTER" door is one-way in this static prototype;
 * see the #16 execution plan's reported deviations).
 */
export const townCenter: RoomDefinition = {
  id: 'town-center',
  title: 'TOWN CENTER',
  subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
  background: { kind: 'image', key: 'room-town-center', url: 'rooms/town-center.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 8 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 860, y: 150, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1270, y: 355, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'dev-pit',
      // The tile just inside Dev Pit's own "TOWN CENTER" door (#16 fix 4):
      // the nearest walkable tile to that door's hotspot centre in Dev Pit's
      // own grid, the same rule `reachability.test.ts` uses for a door's
      // approach tile.
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'STAIRWELL',
      hotspot: { x: 610, y: 180, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'ELEVATOR · ROOF DECK',
      hotspot: { x: 385, y: 282, ...ELEVATOR_HOTSPOT_SIZE },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill), so this lands on Roof Deck's own spawn tile (#16
      // fix 4) -- a judgment call reported on the #16 execution plan.
      entryTile: roofDeck.spawnTile,
    },
  ],
  npcSlots: [
    // Darrin Jahnel, Sydney Murauskas and Jon Keller: full names on their
    // nameplates, kebab-cased to first name only per the #16 execution
    // plan's example (`darrin`).
    { npcId: 'darrin', tile: { col: 3, row: 4 } },
    { npcId: 'sydney', tile: { col: 6, row: 2 } },
    { npcId: 'jon', tile: { col: 6, row: 6 } },
    // The receptionist penguin behind the Front Desk counter; her tile sits
    // on the (unwalkable) counter itself, same as any NPC standing behind a
    // fixed fixture (#16 D6).
    { npcId: 'front-desk', tile: { col: 6, row: 1 } },
    // Jory Hutchins has her own nameplate and speech bubble (`sayJory`), like
    // Darrin/Sydney/Jon, but her `jump` bounce animation and "SURVIVOR" badge
    // are nested *inside* Sydney's own `walkSyd` group in the design markup,
    // not a standalone figure with its own fixed position -- she rides along
    // with wherever Sydney's walk cycle currently places her, so there's no
    // single tile that's "hers" to place an NPC slot on the way Darrin's,
    // Sydney's and Jon's own patrol-start tiles are approximated. #16 fix 5
    // decision: no NPC slot for Jory, for a different reason than Matt's
    // exclusion in Dev Pit (Matt is a Penguin/Player, never a static NPC
    // slot at all; Jory is a designed NPC, just one without an independent
    // position in this design). Reviewable if #36 finds otherwise.
  ],
};
