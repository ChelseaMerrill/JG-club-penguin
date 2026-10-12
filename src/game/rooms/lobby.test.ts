import { describe, expect, it } from 'vitest';
import type { Tile } from '../../contracts';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import { findPath } from '../movement/pathfinding';
import { doorApproachTile } from '../movement/targets';
import {
  LOBBY_ELEVATOR_FLOOR_CHOICES,
  LOBBY_ELEVATOR_SILL,
  LOBBY_FLOOR_CHIP_LABEL,
  LOBBY_STAIRS_SILL,
  lobby,
} from './definitions/lobby';
import { stairwell0 } from './definitions/stairwell';
import { townCenter } from './definitions/town-center';
import { npcSlotPoint, screenToTile, tileCornerToScreen } from './iso';
import { getRoomDefinition } from './registry';
import type { DoorHotspot, RoomDefinition, RoomDoor } from './room-definition';

type Point = readonly [number, number];

/** The tile a door's sill falls on: its hotspot's bottom-centre (#51 D4's rule). */
function sillOf(room: RoomDefinition, hotspot: DoorHotspot): Tile {
  return screenToTile(
    { x: hotspot.x + hotspot.width / 2, y: hotspot.y + hotspot.height },
    room.grid.origin,
  );
}

function doorNamed(room: RoomDefinition, label: string): RoomDoor[] {
  return room.doors.filter((door) => door.label === label);
}

function inPolygon(x: number, y: number, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The share of `tile`'s diamond that `polygon` covers, by sampling. */
function coverage(tile: Tile, polygon: readonly Point[]): number {
  const north = tileCornerToScreen(tile, lobby.grid.origin);
  const steps = 60;
  let covered = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const u = (i + 0.5) / steps;
      const v = (j + 0.5) / steps;
      if (inPolygon(north.x + (u - v) * 50, north.y + (u + v) * 25, polygon)) covered += 1;
    }
  }
  return covered / (steps * steps);
}

// The two fixtures' floor footprints, each its box's bottom face in the
// design: the planter's (`translate(150 -75)` applied) and the SIGN IN
// desk's.
const PLANTER_FOOTPRINT: readonly Point[] = [
  [700, 450],
  [735, 432.5],
  [770, 450],
  [735, 467.5],
];
const DESK_FOOTPRINT: readonly Point[] = [
  [720, 595],
  [820, 645],
  [780, 665],
  [680, 615],
];

describe('the Lobby (#169)', () => {
  it('is registered as `lobby`, titled with the design banner', () => {
    expect(getRoomDefinition('lobby')).toBe(lobby);
    expect(lobby.title).toBe('JG HQ LOBBY');
    expect(lobby.subtitle).toBe('108 STATE ST · STREET LEVEL · JAHNEL GROUP IS ON 5');
    expect(lobby.background).toEqual({
      kind: 'image',
      key: 'room-lobby',
      url: 'rooms/lobby.png',
    });
  });

  it("uses the design's 8x6 floor, north corner (800, 385)", () => {
    expect(lobby.grid).toEqual({ origin: { x: 800, y: 385 }, columns: 8, rows: 6 });
    expect(lobby.walkable).toHaveLength(6);
    for (const row of lobby.walkable) expect(row).toHaveLength(8);
  });

  it("blocks exactly the tiles a fixture's footprint covers a quarter or more of, and Security's", () => {
    const security = lobby.npcSlots.find((slot) => slot.npcId === 'security-lobby')!;
    for (let row = 0; row < lobby.grid.rows; row += 1) {
      for (let col = 0; col < lobby.grid.columns; col += 1) {
        const tile = { col, row };
        const covered = Math.max(coverage(tile, PLANTER_FOOTPRINT), coverage(tile, DESK_FOOTPRINT));
        const isSecurity = col === security.tile.col && row === security.tile.row;
        expect(lobby.walkable[row]![col], `(${col},${row}) covered ${covered.toFixed(2)}`).toBe(
          covered < 0.25 && !isSecurity,
        );
      }
    }
  });

  it('spawns on the tile under the design\'s "You" Penguin (its shadow at (810, 530))', () => {
    expect(lobby.spawnTile).toEqual(screenToTile({ x: 810, y: 530 }, lobby.grid.origin));
    expect(lobby.spawnTile).toEqual({ col: 3, row: 2 });
  });

  it("stands Security where the design draws him, behind the SIGN IN desk's foreground", () => {
    const security = lobby.npcSlots.find((slot) => slot.npcId === 'security-lobby')!;
    expect(npcSlotPoint(security, lobby.grid.origin)).toEqual({ x: 770, y: 615 });
    expect(lobby.foregrounds).toEqual([
      {
        key: 'room-lobby-front-sign-in-desk',
        url: 'rooms/lobby-front-sign-in-desk.png',
        overNpcId: 'security-lobby',
      },
    ]);
  });

  it('keeps every door and pill inside the Stage, the pills as twins listed after their doors', () => {
    expect(lobby.doors.map((door) => [door.label, door.hotspot])).toEqual([
      ['STAIRS · FLOOR L', { x: 540, y: 330, width: 70, height: 185 }],
      ['STAIRS · FLOOR L', { x: 36, y: 748, width: 161, height: 40 }],
      ['ELEVATOR · FLOOR 5', { x: 1012, y: 327, width: 136, height: 232 }],
      ['ELEVATOR · FLOOR 5', { x: 1384, y: 748, width: 180, height: 40 }],
    ]);
    for (const { hotspot } of lobby.doors) {
      expect(hotspot.x).toBeGreaterThanOrEqual(0);
      expect(hotspot.y).toBeGreaterThanOrEqual(0);
      expect(hotspot.x + hotspot.width).toBeLessThanOrEqual(GAME_WIDTH);
      expect(hotspot.y + hotspot.height).toBeLessThanOrEqual(GAME_HEIGHT);
    }
    for (const label of ['STAIRS · FLOOR L', 'ELEVATOR · FLOOR 5']) {
      const [door, pill] = doorNamed(lobby, label);
      expect(pill).toEqual({ ...door, hotspot: pill!.hotspot });
    }
    // The ELEVATOR pill ends where the design's `right: 36px` puts it.
    const elevatorPill = doorNamed(lobby, 'ELEVATOR · FLOOR 5')[1]!.hotspot;
    expect(elevatorPill.x + elevatorPill.width).toBe(GAME_WIDTH - 36);
  });

  it("puts each door's sill on its bottom-centre tile", () => {
    const [stairs] = doorNamed(lobby, 'STAIRS · FLOOR L');
    const [elevator] = doorNamed(lobby, 'ELEVATOR · FLOOR 5');
    expect(sillOf(lobby, stairs!.hotspot)).toEqual(LOBBY_STAIRS_SILL);
    expect(sillOf(lobby, elevator!.hotspot)).toEqual(LOBBY_ELEVATOR_SILL);
    expect(LOBBY_STAIRS_SILL).toEqual({ col: 0, row: 4 });
    expect(LOBBY_ELEVATOR_SILL).toEqual({ col: 6, row: 0 });
    expect(lobby.walkable[0]![6]).toBe(true);
  });

  it("lands STAIRS on Stairwell floor 0's LOBBY door sill, and the interim ELEVATOR on Town Center's ELEVATOR sill", () => {
    const [stairs] = doorNamed(lobby, 'STAIRS · FLOOR L');
    const [elevator] = doorNamed(lobby, 'ELEVATOR · FLOOR 5');
    const stairwellLobbyDoor = doorNamed(stairwell0, 'LOBBY')[0]!;
    const townCenterElevator = doorNamed(townCenter, 'ELEVATOR · ROOF DECK')[0]!;

    expect(stairs).toMatchObject({
      targetRoomId: 'stairwell-0',
      entryTile: sillOf(stairwell0, stairwellLobbyDoor.hotspot),
    });
    expect(stairs!.entryTile).toEqual({ col: 0, row: 7 });
    // TODO(#170 C): the ELEVATOR opens the floor picker instead.
    expect(elevator).toMatchObject({
      targetRoomId: 'town-center',
      entryTile: sillOf(townCenter, townCenterElevator.hotspot),
    });
    expect(elevator!.entryTile).toEqual({ col: 0, row: 7 });
  });

  it("keeps the picker's choices ready for #170 C: R to the Roof Deck, then 5 to Town Center, each on a walkable landing", () => {
    expect(
      LOBBY_ELEVATOR_FLOOR_CHOICES.map((choice) => [choice.floor, choice.targetRoomId]),
    ).toEqual([
      ['R', 'roof-deck'],
      ['5', 'town-center'],
    ]);
    for (const choice of LOBBY_ELEVATOR_FLOOR_CHOICES) {
      const target = getRoomDefinition(choice.targetRoomId);
      expect(target.walkable[choice.entryTile.row]![choice.entryTile.col], choice.floor).toBe(true);
    }
    const [elevator] = doorNamed(lobby, 'ELEVATOR · FLOOR 5');
    expect(LOBBY_ELEVATOR_FLOOR_CHOICES[1]!.entryTile).toEqual(elevator!.entryTile);
    expect(LOBBY_FLOOR_CHIP_LABEL).toBe('L / LOBBY · STREET LEVEL');
  });

  it("reaches every door's approach tile from the spawn tile", () => {
    for (const door of lobby.doors) {
      const approach = doorApproachTile(lobby.walkable, door, lobby.grid.origin);
      expect(lobby.walkable[approach.row]![approach.col], door.label).toBe(true);
      expect(findPath(lobby.walkable, lobby.spawnTile, approach), door.label).not.toBeNull();
    }
  });

  it('says "stairs or elevator?" on spawn, and shows the floor display over the plate above the elevator', () => {
    expect(lobby.spawnLine).toBe('stairs or elevator?');
    expect(lobby.floorDisplay).toEqual({ x: 1044, y: 317, width: 72, height: 20, skewY: 26.565 });
  });
});
