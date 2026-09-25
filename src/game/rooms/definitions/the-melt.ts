import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { roofDeck } from './roof-deck';
import { townCenter } from './town-center';

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
// tiles are blocked (#92 D3 round 2); Tom's is left walkable since he walks
// in the design, so there's no single tile that's "his" the way there is for
// every stationary NPC; Tonya's tile already sat on an unwalkable counter.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, true, true],
  [false, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, true, true, true, true, true, true, false, true],
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
      // Town Center has no door of its own back to the Kitchen (see below),
      // so this lands on Town Center's own spawn tile (#16 fix 4) -- a
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
    // and adds "Tom" (a walking, coffee-obsessed NPC). The design's Tonya and
    // Jesse are Penguins, so they aren't placed.
    // Penguin-kind NPCs are left out of every Room: only Players appear as
    // Penguins (owner decision, 2026-09-25). Their `NpcDefinition`s stay in
    // `src/npcs/npcs.ts`.
    { npcId: 'chelsea', tile: { col: 3, row: 2 } },
    { npcId: 'tom', tile: { col: 7, row: 2 } },
  ],
};
