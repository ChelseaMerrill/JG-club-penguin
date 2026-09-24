import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { townCenter } from './town-center';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape the one door hotspot in this Room uses (the design's shared
// `door()` isolib helper).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from `design/Room 06 Igloo.dc.html`'s fixtures: the elevator recess
// (rows 0-1), a desk with a monitor (col 8, rows 1-2) — this used to be
// mislabelled "a shelf/nightstand" — the built-in bed/coat structure
// (cols 0-2, rows 3-7), and a dresser/nightstand (cols 10-11, rows 7-8) —
// this used to be mislabelled "the trophy-case display unit"; the actual
// Trophy Case hotspot (below) is the right-wall "BADGES 2 / 3" shelf, a wall
// fixture with no floor footprint of its own (#16 fix 5).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, true, true, false, false, false, false, false, true, true],
  [false, false, true, true, true, true, true, false, false, false, true, true],
  [true, true, true, true, true, true, true, true, false, true, true, true],
  [false, false, true, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true, true, false, true, true],
  [false, false, false, true, true, true, true, true, true, true, false, false],
  [true, true, true, true, true, true, true, true, true, true, false, false],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Room 06 Igloo.dc.html`: a real door back to Town
 * Center. Nothing else in the prototype's five Rooms links to the Igloo in
 * this static design — it's reached through the HUD's persistent IGLOO
 * button (#15), not a floor door. This Room has no NPCs (`npcSlots` is
 * empty): only the Player's own Penguin and their pet Hexle "Bit" (a live
 * pet, hidden from the exported art the same way Gil the fish is in Town
 * Center) are ever in it.
 */
export const igloo: RoomDefinition = {
  id: 'igloo',
  title: 'YOUR IGLOO',
  subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
  background: { kind: 'image', key: 'room-igloo', url: 'rooms/igloo.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 9 },
  doors: [
    {
      label: 'TOWN CENTER',
      hotspot: { x: 680, y: 145, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'town-center',
      // Town Center has no door of its own back to the Igloo (see above), so
      // this lands on Town Center's own spawn tile (#16 fix 4) -- a
      // judgment call reported on the #16 execution plan.
      entryTile: townCenter.spawnTile,
    },
  ],
  npcSlots: [],
  // Six empty slots (#41) spread across the Igloo's open floor, clear of the
  // built-in bed structure, the desk, the dresser, the door and the spawn
  // tile. The design itself shows only the finished furnished state, not
  // slot markers, so these positions are a judgment call reported on the
  // #16 execution plan (#16 fix 4: kept as open floor, per that plan, since
  // the design shows no distinct slot markers to trace).
  furnitureSlots: [
    { id: 'slot-1', tile: { col: 4, row: 3 } },
    { id: 'slot-2', tile: { col: 6, row: 3 } },
    { id: 'slot-3', tile: { col: 8, row: 3 } },
    { id: 'slot-4', tile: { col: 4, row: 6 } },
    { id: 'slot-5', tile: { col: 6, row: 6 } },
    { id: 'slot-6', tile: { col: 8, row: 6 } },
  ],
  hotspots: [
    {
      id: 'trophy-case',
      label: 'Trophy Case',
      // The right-wall "BADGES 2 / 3" shelf and its three badge hexagons
      // (#16 fix 4) — moved here from a floor rect over the dresser at
      // cols 10-11, rows 7-8, which was never the Trophy Case (see the
      // `WALKABLE` comment above).
      rect: { x: 1195, y: 320, width: 160, height: 105 },
    },
  ],
};
