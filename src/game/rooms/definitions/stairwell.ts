import type { RoomId, Tile } from '../../../contracts';
import type { DoorHotspot, RoomDefinition, RoomDoor, RoomNpcSlot } from '../room-definition';
import { createGrid } from '../grid';
import { roofDeck } from './roof-deck';

// Not the standard 12x10 grid (#51 D2): every Stage of
// `design/Stairwell.dc.html` bakes the same 8x8 landing, 64 tile diamonds
// whose first north corner is (800, 360). The six Stages' floor polygons are
// identical (checked when tracing #51 slice 4), so the six floors share this
// grid and the base mask below.
const GRID = createGrid({ x: 800, y: 360 }, 8, 8);

// Traced from the art's own pixels, a tile blocked where the stair flight
// (the lower flight up the back-left wall, its posts and the landing at the
// back corner) covers a quarter or more of its diamond: (0,0)-(0,4),
// (1,0)-(1,4) and (2,4). (2,3) is 0.23 covered, so it stays walkable. The
// upper flight and the top landing are drawn in the back-right wall's plane,
// above its floor line, so they cover no floor tile. The floor arrow by the
// front-left edge is flat floor art. Each floor additionally blocks its own
// NPCs' tiles (`walkableFor` below; #16 fix 5).
const BASE_WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true],
  [false, false, false, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
];

/** `BASE_WALKABLE` with each NPC slot's own tile blocked. */
function walkableFor(npcSlots: readonly RoomNpcSlot[]): readonly (readonly boolean[])[] {
  return BASE_WALKABLE.map((row, rowIndex) =>
    row.map(
      (cell, col) =>
        cell && !npcSlots.some((slot) => slot.tile.col === col && slot.tile.row === rowIndex),
    ),
  );
}

/**
 * The design's exit pills (S4-D4: the Stairwell's only drawn exits between
 * floors, so they are its doors), each its pill's own rect in the design,
 * border included: "↑ FLOOR n" at (36, 250), "↓ FLOOR n" / "↓ LOBBY" at
 * (36, 748), 40 px tall. The widths are the design's, per label.
 */
function upPill(floor: number): DoorHotspot {
  // "↑ FLOOR 1" sets a narrower "1" than the other numerals.
  return { x: 36, y: 250, width: floor === 0 ? 95 : 98, height: 40 };
}

function downPill(floor: number): DoorHotspot {
  // "↓ LOBBY" on floor 1, "↓ FLOOR 1" on floor 2, "↓ FLOOR n" above that.
  const width = floor === 1 ? 84 : floor === 2 ? 95 : 98;
  return { x: 36, y: 748, width, height: 40 };
}

/**
 * The landing door frame floors 0 and 5 draw on the back-left wall
 * (`475,522.5 405,557.5 405,427.5 475,392.5`), the design's shared `door()`
 * frame, 70x165: "FLOOR 5 · JG HQ" on floor 5, "LOBBY · STREET LEVEL" on
 * floor 0, each named by the sign on the back-right wall. S4-D4 prefers an
 * in-scene door to a pill wherever one is drawn.
 */
const LANDING_DOOR: DoorHotspot = { x: 405, y: 392.5, width: 70, height: 165 };

/**
 * The upper stair flight, from the stairs polygon the design links up a
 * floor (`640,540 800,300 1010,300 1010,420 820,415 690,600`): only its
 * upper part, which clears every NPC's hit area (the lower part runs
 * through Dom's, Jason's and the guest's), checked against the debug
 * overlay (#51 slice 4, S4-D4/S4-D11). Floors 0-4 climb a flight from it;
 * floor 5's leads to the Roof Deck.
 */
const UPPER_FLIGHT: DoorHotspot = { x: 800, y: 300, width: 210, height: 115 };

// Each pill door's `entryTile` is the approach tile of the matching pill on
// the floor it leads to (S4-D4): the nearest walkable tile to that pill's
// centre (`doorApproachTile`). An up door lands by the next floor's "↓"
// pill, a down door by the lower floor's "↑" pill. The narrower "↓ LOBBY"
// and "↓ FLOOR 1" pills put floors 1 and 2's on (0,7), the others' on (1,7).
// `stairwell.test.ts` re-derives every one.
const DOWN_PILL_APPROACH: Readonly<Record<number, Tile>> = {
  1: { col: 0, row: 7 },
  2: { col: 0, row: 7 },
  3: { col: 1, row: 7 },
  4: { col: 1, row: 7 },
  5: { col: 1, row: 7 },
};
const UP_PILL_APPROACH: Tile = { col: 0, row: 5 };

/** The sill tile inside floor 5's JG HQ door: its hotspot's bottom-centre (440, 557.5), on (0,7). */
export const STAIRWELL_JG_HQ_SILL: Tile = { col: 0, row: 7 };

/**
 * The tile just inside Town Center's own STAIRWELL door: its hotspot's
 * bottom-centre (645, 345), projected into Town Center's grid (#51 D4's sill
 * rule).
 */
const TOWN_CENTER_STAIRWELL_SILL: Tile = { col: 0, row: 3 };

function stairwellRoomId(floor: number): RoomId {
  return `stairwell-${floor}` as RoomId;
}

/** The pill and stair doors one floor draws (S4-D4, S4-D11, UD-7). */
function doorsFor(floor: number): RoomDoor[] {
  const doors: RoomDoor[] = [];
  if (floor < 5) {
    const entryTile = DOWN_PILL_APPROACH[floor + 1]!;
    doors.push({
      label: `FLOOR ${floor + 1}`,
      hotspot: upPill(floor),
      targetRoomId: stairwellRoomId(floor + 1),
      entryTile,
    });
    doors.push({
      label: 'STAIRS',
      hotspot: UPPER_FLIGHT,
      targetRoomId: stairwellRoomId(floor + 1),
      entryTile,
    });
  } else {
    doors.push({
      label: 'ROOF DECK',
      hotspot: UPPER_FLIGHT,
      targetRoomId: 'roof-deck',
      // The Roof Deck draws no STAIRS exit yet, so this lands on its own
      // spawn tile until #170 adds that pill and retargets this to its sill
      // (the #16 fix 4 precedent).
      entryTile: roofDeck.spawnTile,
    });
    doors.push({
      label: 'JG HQ',
      hotspot: LANDING_DOOR,
      targetRoomId: 'town-center',
      entryTile: TOWN_CENTER_STAIRWELL_SILL,
    });
  }
  if (floor > 0) {
    doors.push({
      label: floor === 1 ? 'LOBBY' : `FLOOR ${floor - 1}`,
      hotspot: downPill(floor),
      targetRoomId: stairwellRoomId(floor - 1),
      entryTile: UP_PILL_APPROACH,
    });
  } else {
    // The Lobby (#169) isn't built yet, so this shows the coming-soon hint,
    // as holding ↓ here does (UD-7). #169 sets its target.
    doors.push({
      label: 'LOBBY',
      hotspot: LANDING_DOOR,
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    });
  }
  return doors;
}

/**
 * Each floor's three NPCs (S4-D8), on the tile under each figure's ground
 * shadow as the design draws it at rest, with an `offset` to its exact spot:
 * Dom at his run's first visible point (640, 522), at the foot of the stairs;
 * Jason at (620, 590); and the floor's guest by the floor's centre. "You" is
 * the local Player, never a slot.
 */
function npcSlotsFor(floor: number, guest: RoomNpcSlot): RoomNpcSlot[] {
  return [
    { npcId: `dom-stairwell-${floor}`, tile: { col: 1, row: 4 }, offset: { x: -10, y: 12 } },
    { npcId: `jason-stairwell-${floor}`, tile: { col: 2, row: 6 }, offset: { x: 20, y: 5 } },
    guest,
  ];
}

interface StairwellFloorSpec {
  floor: number;
  subtitle: string;
  guest: RoomNpcSlot;
}

function stairwellFloor({ floor, subtitle, guest }: StairwellFloorSpec): RoomDefinition {
  const id = stairwellRoomId(floor);
  const npcSlots = npcSlotsFor(floor, guest);
  return {
    id,
    // S4-D5: only floor 5 draws a banner; every floor shares its title shape.
    title: `THE SLIDE · FLOOR ${floor}`,
    subtitle,
    background: { kind: 'image', key: `room-${id}`, url: `rooms/${id}.png` },
    grid: GRID,
    walkable: walkableFor(npcSlots),
    // Where the design draws the local player's own "You" Penguin (its
    // shadow is at (665, 602.5)).
    spawnTile: { col: 3, row: 6 },
    doors: doorsFor(floor),
    npcSlots,
  };
}

/**
 * Traced from `design/Stairwell.dc.html`'s six Stages, "STAIRWELL · FLOOR
 * 0" to "STAIRWELL · FLOOR 5" (#51 slice 4, A2): one Room per Stairwell
 * floor. Floor 0 is the lobby level (`ROOM_FLOORS` 'L'), reached from the
 * Map; floor 5 is the JG HQ floor, reached from Town Center's STAIRWELL door.
 * "STAIRS CHALLENGE · SUBMIT" is baked into the art as decoration only, with
 * no door or hotspot over it (HD-3).
 */
export const stairwell0 = stairwellFloor({
  floor: 0,
  subtitle: 'LOBBY · STREET LEVEL',
  guest: { npcId: 'anthony-stairwell-0', tile: { col: 5, row: 5 } },
});

export const stairwell1 = stairwellFloor({
  floor: 1,
  subtitle: 'STAIRWELL · FLOOR 1',
  guest: { npcId: 'casey-stairwell-1', tile: { col: 5, row: 5 }, offset: { x: -10, y: -10 } },
});

export const stairwell2 = stairwellFloor({
  floor: 2,
  subtitle: 'STAIRWELL · FLOOR 2',
  guest: { npcId: 'sydney-stairwell-2', tile: { col: 5, row: 5 }, offset: { x: -30, y: -10 } },
});

export const stairwell3 = stairwellFloor({
  floor: 3,
  subtitle: 'STAIRWELL · FLOOR 3',
  guest: { npcId: 'tony-stairwell-3', tile: { col: 5, row: 5 }, offset: { x: 10, y: -10 } },
});

export const stairwell4 = stairwellFloor({
  floor: 4,
  subtitle: 'STAIRWELL · FLOOR 4',
  guest: { npcId: 'jory-stairwell-4', tile: { col: 5, row: 5 }, offset: { x: -20, y: -5 } },
});

// The banner's subtitle minus "RAIL SLIDING ENCOURAGED", which names the
// unbuilt Rail Rider mechanic (S4-D5; the Bathroom's dropped "SNOWBALLS
// DISABLED" precedent).
export const stairwell5 = stairwellFloor({
  floor: 5,
  subtitle: 'STAIRWELL B · 5 OF 5 · TOP FLOOR · JG HQ',
  guest: { npcId: 'ashley-stairwell-5', tile: { col: 4, row: 5 }, offset: { x: 20, y: 5 } },
});

/** Every Stairwell floor, floor 0 first. */
export const STAIRWELL_DEFINITIONS: readonly RoomDefinition[] = [
  stairwell0,
  stairwell1,
  stairwell2,
  stairwell3,
  stairwell4,
  stairwell5,
];

/**
 * The door a Stairwell floor's ↑ or ↓ key uses (S4-D10, UD-7): its "↑" pill
 * door (floor 5: ROOF DECK) or its "↓" pill door (floor 0: the LOBBY door).
 * `undefined` for any other Room.
 */
export function stairwellExit(roomId: RoomId, direction: 'up' | 'down'): RoomDoor | undefined {
  const index = STAIRWELL_DEFINITIONS.findIndex((room) => room.id === roomId);
  if (index < 0) return undefined;
  const doors = STAIRWELL_DEFINITIONS[index]!.doors;
  if (direction === 'up') {
    return doors.find((door) => door.label === (index < 5 ? `FLOOR ${index + 1}` : 'ROOF DECK'));
  }
  return doors.find((door) => door.label === (index > 1 ? `FLOOR ${index - 1}` : 'LOBBY'));
}
