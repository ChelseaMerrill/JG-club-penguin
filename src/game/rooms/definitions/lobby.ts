import type { RoomId, Tile } from '../../../contracts';
import type { FloorId } from '../floors';
import type { DoorHotspot, RoomDefinition, RoomDoor } from '../room-definition';
import { createGrid } from '../grid';

// Not the standard 12x10 grid: `design/Room 00 JGHQ Lobby.dc.html` bakes an
// 8x6 floor whose first diamond's north corner is (800, 385). Columns run
// down the right (elevator) wall, rows down the left (stairwell) wall.
const GRID = createGrid({ x: 800, y: 385 }, 8, 6);

// Traced from the art, a tile blocked where a fixture's floor footprint (its
// box's bottom face) covers a quarter or more of its diamond: the planter by
// the back corner on (0,1), about 0.28 covered ((0,2) is 0.21, so it stays
// walkable), and the SIGN IN desk on (3,5), (4,5) and (5,5), about 0.48, 0.80
// and 0.32. Security's own tile (4,4) is blocked too, so a Penguin can't walk
// through him (#16 fix 5). The blue carpet runner is flat floor art.
// `lobby.test.ts` re-derives every blocked tile.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true],
  [false, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
  [true, true, true, true, false, true, true, true],
  [true, true, true, false, false, false, true, true],
];

/**
 * The STAIRS · FLOOR L door: the STAIRWELL B door frame on the back-left
 * wall (the design's `<rect x="40" y="70" width="70" height="150">` under
 * `matrix(1 -0.5 0 1 500 315)`), its axis-aligned bounding box. Its
 * bottom-centre (575, 515) falls on (0,4), its sill (#51 D4's rule).
 */
const STAIRS_DOOR: DoorHotspot = { x: 540, y: 330, width: 70, height: 185 };

/**
 * The ELEVATOR · FLOOR 5 door: the sliding-panel frame on the back-right
 * wall (`<rect x="212" y="56" width="136" height="164">` under
 * `matrix(1 0.5 0 1 800 165)`), its axis-aligned bounding box, below the
 * floor display's plate. Its bottom-centre (1080, 559) falls on (6,0), its
 * sill.
 */
const ELEVATOR_DOOR: DoorHotspot = { x: 1012, y: 327, width: 136, height: 232 };

/**
 * The design's two exit pills, each its pill's own rect in the design and
 * the art, border included (measured from the rendered design at
 * 1600x900): "↖ STAIRS · FLOOR L" (`left:36px; bottom:112px`, 161 px wide)
 * and "ELEVATOR · FLOOR 5 ↗" (`right:36px; bottom:112px`, 180 px wide, so it
 * ends at x 1564). Each is a twin of its door: the same label, target and
 * landing, listed after it (the Stairwell's S4-D4 precedent).
 */
const STAIRS_PILL: DoorHotspot = { x: 36, y: 748, width: 161, height: 40 };
const ELEVATOR_PILL: DoorHotspot = { x: 1384, y: 748, width: 180, height: 40 };

/** The tile just inside the Lobby's STAIRS · FLOOR L door, where Stairwell floor 0's LOBBY door lands. */
export const LOBBY_STAIRS_SILL: Tile = { col: 0, row: 4 };

/**
 * The tile just inside the Lobby's ELEVATOR door, where another floor's
 * elevator lands in the Lobby once #170 C's floor picker offers L.
 */
export const LOBBY_ELEVATOR_SILL: Tile = { col: 6, row: 0 };

// This module imports no other Room definition: `town-center` imports
// `stairwell`, which imports this module, so importing either back would
// make a cycle. The two foreign sills below are literals instead, and
// `lobby.test.ts` re-derives each one from its own Room.

/** Stairwell floor 0's LOBBY door sill: its landing door's bottom-centre (440, 557.5), on (0,7). */
const STAIRWELL_LOBBY_SILL: Tile = { col: 0, row: 7 };

/** Town Center's ELEVATOR sill: its hotspot's bottom-centre (430, 457), on (0,7). */
const TOWN_CENTER_ELEVATOR_SILL: Tile = { col: 0, row: 7 };

/** The Roof Deck's ELEVATOR pill approach tile, #170's landing for an R ride. */
const ROOF_DECK_ELEVATOR_APPROACH: Tile = { col: 4, row: 9 };

/** One floor the Lobby's ELEVATOR offers in #170 C's floor picker. */
export interface LobbyFloorChoice {
  floor: FloorId;
  targetRoomId: RoomId;
  entryTile: Tile;
}

// TODO(#170 C): the Lobby's ELEVATOR opens #170's floor picker (U1, approved
// 2026-10-12). Until that picker exists, the door below rides straight to
// Town Center (an L to 5 ride, 6 s). When rebasing onto #170 C, give the
// ELEVATOR door and its pill twin `floorChoices` built from
// `LOBBY_ELEVATOR_FLOOR_CHOICES`, and unlock L on Town Center's and the Roof
// Deck's pickers with `LOBBY_FLOOR_CHIP_LABEL`, landing on
// `LOBBY_ELEVATOR_SILL`.

/** The floors the Lobby's ELEVATOR picker offers, high to low: R (the Roof Deck), then 5 (Town Center). */
export const LOBBY_ELEVATOR_FLOOR_CHOICES: readonly LobbyFloorChoice[] = [
  { floor: 'R', targetRoomId: 'roof-deck', entryTile: ROOF_DECK_ELEVATOR_APPROACH },
  { floor: '5', targetRoomId: 'town-center', entryTile: TOWN_CENTER_ELEVATOR_SILL },
];

/** The L chip's copy on the other floors' pickers (approved 2026-10-12). */
export const LOBBY_FLOOR_CHIP_LABEL = 'L / LOBBY · STREET LEVEL';

const STAIRS: RoomDoor = {
  label: 'STAIRS · FLOOR L',
  hotspot: STAIRS_DOOR,
  targetRoomId: 'stairwell-0',
  entryTile: STAIRWELL_LOBBY_SILL,
};

const ELEVATOR: RoomDoor = {
  label: 'ELEVATOR · FLOOR 5',
  hotspot: ELEVATOR_DOOR,
  // TODO(#170 C): the interim direct ride; see `LOBBY_ELEVATOR_FLOOR_CHOICES`.
  targetRoomId: 'town-center',
  entryTile: TOWN_CENTER_ELEVATOR_SILL,
};

/**
 * Traced from `design/Room 00 JGHQ Lobby.dc.html` (#169): the JG HQ Lobby
 * on floor L, street level, where every Session starts. The directory, the
 * STAIRWELL B sign and the JG HQ sign are baked into the art; Security
 * stands behind the SIGN IN desk (a Human, drawn behind the desk's
 * foreground layer); the elevator's floor display is a live DOM label
 * (`floorDisplay`); and the local Player's Penguin says "stairs or
 * elevator?" once when a Session spawns here (`spawnLine`).
 */
export const lobby: RoomDefinition = {
  id: 'lobby',
  title: 'JG HQ LOBBY',
  subtitle: '108 STATE ST · STREET LEVEL · JAHNEL GROUP IS ON 5',
  background: { kind: 'image', key: 'room-lobby', url: 'rooms/lobby.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin (its shadow
  // is at (810, 530)).
  spawnTile: { col: 3, row: 2 },
  doors: [
    STAIRS,
    { ...STAIRS, hotspot: STAIRS_PILL },
    ELEVATOR,
    { ...ELEVATOR, hotspot: ELEVATOR_PILL },
  ],
  npcSlots: [
    // The design stands Security's shadow at (770, 615), behind the desk.
    { npcId: 'security-lobby', tile: { col: 4, row: 4 }, offset: { x: -30, y: 5 } },
  ],
  foregrounds: [
    {
      key: 'room-lobby-front-sign-in-desk',
      url: 'rooms/lobby-front-sign-in-desk.png',
      overNpcId: 'security-lobby',
    },
  ],
  spawnLine: 'stairs or elevator?',
  // The design's `{{ elevFloor }}` div over the dark plate above the
  // elevator doors: left 1044, top 317, 72x20, `skewY(26.565deg)`.
  floorDisplay: { x: 1044, y: 317, width: 72, height: 20, skewY: 26.565 },
};
