import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { roofDeck } from './roof-deck';
import { townCenter } from './town-center';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Kitchen.dc.html`'s fixtures (#92 D3 resync -- the
// walls, counters and doors are unchanged from the pre-resync trace, only
// the NPCs moved): the back-wall counter/"FREE SNACKS" bar (rows 0-1), the
// central island counter and fridge cluster (rows 3-6), and the front
// counter/table run (rows 7-9). Row 4's cols 7-10 and row 9's cols 0-1
// sample as the same floor colour as the rest of the open floor in the
// exported art (not the counters' white/teal), so they're walkable rather
// than blocked under the counter cluster or the floor-arrow decal near the
// TOWN CENTER door (#16 fix 5). Tonya's tile already sat on an unwalkable
// counter. Chelsea, Tom and Jesse (see `npcSlots` below) all resync (#92 D3)
// onto row 2, this Room's only aisle between the back and island counters --
// unlike every other NPC tile in this prototype, blocking their own tiles
// would cut that single-tile-wide aisle into disconnected pockets
// (`reachability.test.ts` catches this), so, like Roof Deck's Kevin/Josh
// exception, their tiles are left walkable as a documented exception rather
// than fabricating an unverified mask change to widen the aisle.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, false],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, false, false, false, false, false, false, false, false, false, false],
  [true, true, true, false, false, false, false, false, false, false, false, false],
  [false, true, true, true, true, true, true, true, false, false, false, false],
  [false, false, true, true, false, true, true, true, true, false, false, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Kitchen.dc.html` (#92: file renamed from `Room 04
 * Kitchen.dc.html`, Player-facing name renamed from THE MELT to THE
 * KITCHEN): a real door back to Town Center and a real door on to the Roof
 * Deck -- both doors are pixel-identical to the pre-resync design, so their
 * hotspots/entry tiles are unchanged.
 */
export const theMelt: RoomDefinition = {
  id: 'the-melt',
  title: 'THE KITCHEN',
  subtitle: 'KITCHEN · FLOOR 5',
  background: { kind: 'image', key: 'room-the-melt', url: 'rooms/the-melt.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 2 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 420, y: 275, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // Town Center has no door of its own back to The Melt (see below), so
      // this lands on Town Center's own spawn tile (#16 fix 4) -- a
      // judgment call reported on the #16 execution plan, same as Roof
      // Deck's doors below.
      entryTile: townCenter.spawnTile,
    },
    {
      label: 'ROOF DECK',
      hotspot: { x: 1290, y: 365, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill); lands on Roof Deck's own spawn tile, matching
      // Town Center's elevator door (see the #16 execution plan).
      entryTile: roofDeck.spawnTile,
    },
  ],
  npcSlots: [
    // #92 D3 resync: the design now names a single "Chelsea" (the pancake
    // cook) instead of the pre-resync "Chef Chelsea"/"Chelsea Merrill" pair,
    // and adds "Tom" (a walking, coffee-obsessed NPC); Tonya keeps her tile.
    { npcId: 'chelsea', tile: { col: 3, row: 2 } },
    { npcId: 'tom', tile: { col: 7, row: 2 } },
    { npcId: 'jesse', tile: { col: 10, row: 2 } },
    { npcId: 'tonya', tile: { col: 8, row: 7 } },
  ],
};
