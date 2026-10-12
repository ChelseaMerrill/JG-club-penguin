import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Kitchen.dc.html`'s fixtures (#92 D3 round 2 --
// re-checked against the art after round 1 blocked too much of row 1): the
// back counter/oven itself is a thin strip -- design-fraction rows 0.2-1.2,
// so only row 0 and a sliver of row 1 -- with row 1 otherwise open floor
// (Chelsea stands on it), the central island counter and fridge cluster
// (rows 3-6), and the front counter/table run (rows 7-9). Row 4's cols 7-10
// and row 9's cols 0-1 sample as the same floor colour as the rest of the
// open floor in the exported art (not the counters' white/teal), so they're
// walkable rather than blocked under the counter cluster or the floor-arrow
// decal by the left-wall counter (#16 fix 5); that decal is hidden from the
// exported art since #132 (it wasn't a working door -- the Kitchen's real
// TOWN CENTER exit is a framed door, not an elevator). Chelsea's and Jesse's own
// tiles are blocked (#92 D3 round 2; Chelsea's is now (1, 1), at the stove); Tom's is left walkable since he walks
// in the design, so there's no single tile that's "his" the way there is for
// every stationary NPC; Tonya's tile already sat on an unwalkable counter.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [false, false, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, false, true],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, false, false, false, false, false, false, false, false, false, false],
  [true, true, true, false, false, false, false, false, false, false, false, false],
  [false, true, true, true, true, true, true, true, false, false, false, false],
  [false, false, true, true, true, true, true, true, true, false, false, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Kitchen.dc.html` (#92: file renamed from `Room 04
 * Kitchen.dc.html`, Player-facing name renamed from THE MELT to THE
 * KITCHEN): a real door back to Town Center and a real door on to the Roof
 * Deck -- both doors are pixel-identical to the pre-resync design, so their
 * hotspots are unchanged. #170: the baked "↙ TOWN CENTER" and "ROOF DECK ↗"
 * exit pills are their twins, each door lands on the sill inside the matching
 * door of the Room it leads to (D8; Town Center now has a KITCHEN door), and
 * each `guardTile` is where Anthony stands while he guards it (D14).
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
      wall: 'left',
      targetRoomId: 'town-center',
      // The sill inside Town Center's KITCHEN door (#170 D8).
      entryTile: { col: 2, row: 0 },
      // Beside the door, off its approach (0,5) and its sill (0,6).
      guardTile: { col: 1, row: 6 },
    },
    {
      label: 'ROOF DECK',
      hotspot: { x: 1290, y: 365, ...DOOR_HOTSPOT_SIZE },
      wall: 'right',
      targetRoomId: 'roof-deck',
      // The sill of the Roof Deck's KITCHEN floor arrow (#170 D8).
      entryTile: { col: 6, row: 9 },
      // Below the door, off its approach and sill (10,0).
      guardTile: { col: 11, row: 1 },
    },
    {
      // The "↙ TOWN CENTER" exit pill: the TOWN CENTER door's twin.
      label: 'TOWN CENTER',
      hotspot: { x: 36, y: 748, width: 136.5, height: 40 },
      kind: 'pill',
      targetRoomId: 'town-center',
      entryTile: { col: 2, row: 0 },
    },
    {
      // The "ROOF DECK ↗" exit pill: the ROOF DECK door's twin.
      label: 'ROOF DECK',
      hotspot: { x: 1445.5, y: 748, width: 118.5, height: 40 },
      kind: 'pill',
      targetRoomId: 'roof-deck',
      entryTile: { col: 6, row: 9 },
    },
  ],
  npcSlots: [
    // #92 D3 resync: the design now names a single "Chelsea" (the pancake
    // cook) instead of the pre-resync "Chef Chelsea"/"Chelsea Merrill" pair,
    // and adds "Tom" (a walking, coffee-obsessed NPC). The design's Tonya and
    // Jesse are Penguins, so they aren't placed.
    // Penguin-kind NPCs are left out of every Room: only Players appear as
    // Penguins (owner decision, 2026-09-25). Their `NpcDefinition`s stay in
    // `src/npcs/npcs.ts`.
    // At the stove (owner request, 2026-10-06): the cooktop at the back
    // counter's left end, row 0, cols 0-1, is right behind (1, 1). She stood
    // at (3, 2), out on the floor, before.
    { npcId: 'chelsea', tile: { col: 1, row: 1 } },
    { npcId: 'tom', tile: { col: 7, row: 2 } },
  ],
};
