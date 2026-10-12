import { describe, expect, it } from 'vitest';
import { ROOM_IDS, type RoomId } from '../../contracts';
import { findPath } from '../movement/pathfinding';
import { doorApproachTile, npcInteractionTile } from '../movement/targets';
import { STAIRWELL_DEFINITIONS, stairwellExit } from './definitions/stairwell';
import { townCenter } from './definitions/town-center';
import { screenToTile } from './iso';
import { getRoomDefinition } from './registry';
import type { RoomDefinition, RoomDoor } from './room-definition';
import {
  flightFor,
  isStairsMove,
  isStairwellRoom,
  STAIRWELL_ROOF_SILL,
  STAIRWELL_ROOMS,
  stairwellFloorOf,
} from './stairwell';

function door(room: RoomDefinition, label: string): RoomDoor {
  const found = room.doors.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`expected ${room.id} to have a "${label}" door`);
  return found;
}

/** A door's sill: its hotspot's bottom-centre, projected into `room`'s grid (#51 D4). */
function sillTile(room: RoomDefinition, through: RoomDoor) {
  return screenToTile(
    {
      x: through.hotspot.x + through.hotspot.width / 2,
      y: through.hotspot.y + through.hotspot.height,
    },
    room.grid.origin,
  );
}

describe('Stairwell floors (#51 slice 4)', () => {
  it('names the six floors in order and recognises only them', () => {
    expect(STAIRWELL_ROOMS).toEqual([
      'stairwell-0',
      'stairwell-1',
      'stairwell-2',
      'stairwell-3',
      'stairwell-4',
      'stairwell-5',
    ]);
    expect(STAIRWELL_DEFINITIONS.map((room) => room.id)).toEqual([...STAIRWELL_ROOMS]);
    expect(STAIRWELL_ROOMS.map((id) => stairwellFloorOf(id))).toEqual([0, 1, 2, 3, 4, 5]);
    for (const id of ROOM_IDS) {
      expect(isStairwellRoom(id), id).toBe(id.startsWith('stairwell-'));
    }
    expect(isStairwellRoom(null)).toBe(false);
  });
});

describe('flightFor (S4-D2, UD-5, START CLIMB 2026-10-11)', () => {
  it('never starts a climb on arriving at floor 0: only its START CLIMB button does', () => {
    expect(flightFor('town-center', 'stairwell-0', 'map')).toBeNull();
    expect(flightFor('stairwell-3', 'stairwell-0', 'map')).toBeNull();
    // A non-Stairwell Room standing in for #169's Lobby.
    expect(flightFor('office-hallway', 'stairwell-0', 'door')).toBeNull();
  });

  it('logs nothing for a descent onto floor 0, a key press, or a spawn', () => {
    expect(flightFor('stairwell-1', 'stairwell-0', 'door')).toBeNull();
    expect(flightFor('stairwell-1', 'stairwell-0', 'keys')).toBeNull();
    expect(flightFor('town-center', 'stairwell-0', 'spawn')).toBeNull();
    expect(flightFor(null, 'stairwell-0', 'door')).toBeNull();
  });

  it('logs flight k only from floor k-1, by a door or the keys', () => {
    for (let k = 1; k <= 5; k += 1) {
      const from = STAIRWELL_ROOMS[k - 1]!;
      const to = STAIRWELL_ROOMS[k]!;
      expect(flightFor(from, to, 'door')).toBe(k);
      expect(flightFor(from, to, 'keys')).toBe(k);
      expect(flightFor(from, to, 'map')).toBeNull();
      expect(flightFor(from, to, 'spawn')).toBeNull();
    }
  });

  it('logs nothing for a Map arrival above floor 0', () => {
    expect(flightFor('town-center', 'stairwell-3', 'map')).toBeNull();
    expect(flightFor('stairwell-2', 'stairwell-3', 'map')).toBeNull();
  });

  it('logs nothing on arriving at floor 5 from Town Center or the Roof Deck, or on leaving it for the roof', () => {
    expect(flightFor('town-center', 'stairwell-5', 'door')).toBeNull();
    expect(flightFor('roof-deck', 'stairwell-5', 'door')).toBeNull();
    expect(flightFor('stairwell-5', 'roof-deck', 'keys')).toBeNull();
    expect(flightFor('stairwell-5', 'roof-deck', 'door')).toBeNull();
  });

  it('logs nothing for a descent, a skipped floor or any non-Stairwell Room', () => {
    expect(flightFor('stairwell-3', 'stairwell-2', 'door')).toBeNull();
    expect(flightFor('stairwell-1', 'stairwell-3', 'keys')).toBeNull();
    expect(flightFor('stairwell-0', 'town-center', 'door')).toBeNull();
    expect(flightFor('town-center', 'dev-pit', 'door')).toBeNull();
  });
});

describe('isStairsMove (S4-D6, S4-D11)', () => {
  it('is true between any two Stairwell floors, and between floor 5 and the Roof Deck', () => {
    for (const from of ROOM_IDS) {
      for (const to of ROOM_IDS) {
        if (from === to) continue;
        const expected =
          (isStairwellRoom(from) && isStairwellRoom(to)) ||
          (from === 'stairwell-5' && to === 'roof-deck') ||
          (from === 'roof-deck' && to === 'stairwell-5');
        expect(isStairsMove(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
    expect(isStairsMove('town-center', 'stairwell-5')).toBe(false);
    expect(isStairsMove('stairwell-0', 'roof-deck')).toBe(false);
  });
});

describe('Stairwell doors (S4-D4)', () => {
  const floors = STAIRWELL_DEFINITIONS;

  it('lands each up door by the next floor\'s "↓" pill and each down door by the lower floor\'s "↑" pill', () => {
    for (let k = 0; k < 5; k += 1) {
      const above = floors[k + 1]!;
      const back = stairwellExit(above.id, 'down')!;
      const approach = doorApproachTile(above.walkable, back, above.grid.origin);
      expect(door(floors[k]!, `FLOOR ${k + 1}`)).toMatchObject({
        targetRoomId: above.id,
        entryTile: approach,
      });
      expect(door(floors[k]!, 'STAIRS')).toMatchObject({
        targetRoomId: above.id,
        entryTile: approach,
      });
    }
    for (let k = 1; k <= 5; k += 1) {
      const below = floors[k - 1]!;
      const up = stairwellExit(below.id, 'up')!;
      const approach = doorApproachTile(below.walkable, up, below.grid.origin);
      expect(door(floors[k]!, k === 1 ? 'LOBBY' : `FLOOR ${k - 1}`)).toMatchObject({
        targetRoomId: below.id,
        entryTile: approach,
      });
    }
  });

  it("opens Town Center and floor 5 onto each other, each landing on the sill inside the other's door", () => {
    const top = floors[5]!;
    const jgHq = door(top, 'JG HQ');
    const stairwellDoor = door(townCenter, 'STAIRWELL');
    expect(stairwellDoor).toMatchObject({
      targetRoomId: 'stairwell-5',
      entryTile: sillTile(top, jgHq),
    });
    expect(jgHq).toMatchObject({
      targetRoomId: 'town-center',
      entryTile: sillTile(townCenter, stairwellDoor),
    });
  });

  it("leads floor 5's upper flight to the Roof Deck's STAIRS pill, and back to its sill (#170)", () => {
    const top = floors[5]!;
    const roof = door(top, 'ROOF DECK');
    const roofDeck = getRoomDefinition('roof-deck');
    const stairs = door(roofDeck, 'STAIRS');
    expect(roof).toMatchObject({
      targetRoomId: 'roof-deck',
      entryTile: doorApproachTile(roofDeck.walkable, stairs, roofDeck.grid.origin),
    });
    expect(stairs).toMatchObject({ targetRoomId: 'stairwell-5', entryTile: STAIRWELL_ROOF_SILL });
    expect(STAIRWELL_ROOF_SILL).toEqual(sillTile(top, roof));
    expect(STAIRWELL_ROOF_SILL).toEqual(doorApproachTile(top.walkable, roof, top.grid.origin));
  });

  it('keeps every NPC, and the tile a Penguin stands on to talk to it, off each door approach (RT2-13)', () => {
    for (const room of floors) {
      const approaches = room.doors.map((each) =>
        doorApproachTile(room.walkable, each, room.grid.origin),
      );
      for (const slot of room.npcSlots) {
        const talk = npcInteractionTile(room.walkable, slot);
        for (const approach of approaches) {
          expect(approach, `${room.id} / ${slot.npcId}`).not.toEqual(slot.tile);
          expect(approach, `${room.id} / ${slot.npcId}`).not.toEqual(talk);
        }
      }
    }
  });

  it("keeps floor 0's LOBBY door disabled until #169 builds the Lobby", () => {
    expect(door(floors[0]!, 'LOBBY').targetRoomId).toBeNull();
  });

  it("gives each floor its ↑/↓ key exits: the pills, floor 5's Roof Deck flight and floor 0's LOBBY door", () => {
    const labels = STAIRWELL_ROOMS.map((id) => [
      stairwellExit(id, 'up')?.label,
      stairwellExit(id, 'down')?.label,
    ]);
    expect(labels).toEqual([
      ['FLOOR 1', 'LOBBY'],
      ['FLOOR 2', 'LOBBY'],
      ['FLOOR 3', 'FLOOR 1'],
      ['FLOOR 4', 'FLOOR 2'],
      ['FLOOR 5', 'FLOOR 3'],
      ['ROOF DECK', 'FLOOR 4'],
    ]);
    expect(stairwellExit('stairwell-0', 'down')?.targetRoomId).toBeNull();
    expect(stairwellExit('town-center' as RoomId, 'up')).toBeUndefined();
  });

  it('makes the baked "↙ LOBBY" and "↙ FLOOR 5 · JG HQ" pills second hotspots for their landing doors', () => {
    const [bottom, top] = [floors[0]!, floors[5]!];
    const lobbies = bottom.doors.filter((each) => each.label === 'LOBBY');
    expect(lobbies.map((each) => each.hotspot)).toEqual([
      { x: 405, y: 392.5, width: 70, height: 165 },
      { x: 36, y: 748, width: 191, height: 40 },
    ]);
    for (const lobby of lobbies) {
      expect(lobby).toMatchObject({ targetRoomId: null, entryTile: lobbies[0]!.entryTile });
    }
    // ↓ keeps the landing door alone, so one press shows one hint.
    expect(stairwellExit(bottom.id, 'down')).toBe(lobbies[0]);

    const jgHqs = top.doors.filter((each) => each.label === 'JG HQ');
    expect(jgHqs.map((each) => each.hotspot)).toEqual([
      { x: 405, y: 392.5, width: 70, height: 165 },
      { x: 36, y: 120, width: 156, height: 40 },
    ]);
    for (const jgHq of jgHqs) {
      expect(jgHq).toMatchObject({ targetRoomId: 'town-center', entryTile: jgHqs[0]!.entryTile });
    }
  });

  it("reaches every door's approach tile from the floor's spawn tile", () => {
    for (const room of floors) {
      for (const each of room.doors) {
        const approach = doorApproachTile(room.walkable, each, room.grid.origin);
        expect(room.walkable[approach.row]![approach.col], `${room.id} / ${each.label}`).toBe(true);
        expect(
          findPath(room.walkable, room.spawnTile, approach),
          `${room.id} / ${each.label}`,
        ).not.toBeNull();
      }
    }
  });
});
