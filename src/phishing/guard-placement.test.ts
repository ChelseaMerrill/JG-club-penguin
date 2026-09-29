import { describe, expect, it } from 'vitest';
import { getRoomDefinition } from '../game/rooms/registry';
import { townCenter } from '../game/rooms/definitions/town-center';
import {
  createBumpTracker,
  guardTile,
  isGuardedDoor,
  isNextTo,
  planGuard,
  type RoomGuard,
} from './guard-placement';
import { DEFAULT_PHISHING_STATE, type GuardWindow } from './phishing-client';

const WINDOW: GuardWindow = {
  roomId: 'town-center',
  doorLabel: 'THE ICEBOX',
  windowStart: '2026-09-28T14:00:00.000Z',
  windowEnd: '2026-09-28T14:10:00.000Z',
  serverNow: '2026-09-28T14:01:00.000Z',
};

const icebox = townCenter.doors.find((door) => door.label === 'THE ICEBOX')!;
const devPit = townCenter.doors.find((door) => door.label === 'DEV PIT')!;

describe('planGuard', () => {
  it('guards the scheduled door, shut until the Player passes this window', () => {
    expect(planGuard('town-center', WINDOW, DEFAULT_PHISHING_STATE)).toEqual({
      roomId: 'town-center',
      npcId: 'anthony',
      doorLabel: 'THE ICEBOX',
      blocking: true,
    });
    expect(
      planGuard('town-center', WINDOW, { ...DEFAULT_PHISHING_STATE, passedGuardWindow: true }),
    ).toMatchObject({ doorLabel: 'THE ICEBOX', blocking: false });
  });

  it('puts no Anthony in any other Room', () => {
    expect(planGuard('dev-pit', WINDOW, DEFAULT_PHISHING_STATE)).toBeNull();
    expect(planGuard('town-center', null, DEFAULT_PHISHING_STATE)).toBeNull();
  });

  it("puts Anthony next to a locked-out Player in whatever Room they're in", () => {
    const locked = { ...DEFAULT_PHISHING_STATE, locked: true, bypassCount: 5 };
    expect(planGuard('dev-pit', WINDOW, locked)).toEqual({
      roomId: 'dev-pit',
      npcId: 'anthony',
      doorLabel: null,
      blocking: false,
    });
    // In his own Room he stays at the door, which stays shut.
    expect(planGuard('town-center', WINDOW, locked)).toMatchObject({
      doorLabel: 'THE ICEBOX',
      blocking: true,
    });
  });
});

describe('isGuardedDoor', () => {
  const guard: RoomGuard = {
    roomId: 'town-center',
    npcId: 'anthony',
    doorLabel: 'THE ICEBOX',
    blocking: true,
  };

  it('gates only the guarded door, and only while blocking', () => {
    expect(isGuardedDoor(guard, icebox)).toBe(true);
    expect(isGuardedDoor(guard, devPit)).toBe(false);
    expect(isGuardedDoor({ ...guard, blocking: false }, icebox)).toBe(false);
    expect(isGuardedDoor(null, icebox)).toBe(false);
  });
});

describe('guardTile', () => {
  it("stands on the guarded door's approach tile, a walkable tile of the Room", () => {
    const tile = guardTile(townCenter, { doorLabel: 'THE ICEBOX' }, townCenter.spawnTile)!;
    expect(townCenter.walkable[tile.row][tile.col]).toBe(true);
    // The Icebox door is up at the top of Town Center's floor.
    expect(tile.row).toBeLessThan(townCenter.spawnTile.row);
  });

  it('has no tile for a door the Room does not have', () => {
    expect(guardTile(townCenter, { doorLabel: 'NOWHERE' }, townCenter.spawnTile)).toBeNull();
  });

  it("stands next to the Player's tile, never on it, when no door is named", () => {
    const tile = guardTile(townCenter, { doorLabel: null }, townCenter.spawnTile)!;
    expect(tile).not.toEqual(townCenter.spawnTile);
    expect(isNextTo(tile, townCenter.spawnTile)).toBe(true);
    expect(townCenter.walkable[tile.row][tile.col]).toBe(true);
  });
});

describe('guardTile next to the Player', () => {
  it("stands clear of the Room's own NPCs (not on or next to one), within 2 tiles of the Player", () => {
    for (const room of [townCenter, getRoomDefinition('dev-pit')]) {
      const tile = guardTile(room, { doorLabel: null }, room.spawnTile)!;
      const away = Math.max(
        Math.abs(tile.col - room.spawnTile.col),
        Math.abs(tile.row - room.spawnTile.row),
      );
      expect(away, room.id).toBeLessThanOrEqual(2);
      for (const slot of room.npcSlots) {
        expect(isNextTo(tile, slot.tile), `${room.id}: ${slot.npcId}`).toBe(false);
      }
    }
  });
});

describe('createBumpTracker', () => {
  it('bumps on arriving next to Anthony, then only again after walking away', () => {
    const bumps = createBumpTracker();
    bumps.reset(false);
    expect(bumps.arrived(true)).toBe(true);
    expect(bumps.arrived(true)).toBe(false);
    expect(bumps.arrived(false)).toBe(false);
    expect(bumps.arrived(true)).toBe(true);
  });

  it('does not bump a Player who was already next to him when he appeared', () => {
    const bumps = createBumpTracker();
    bumps.reset(true);
    expect(bumps.arrived(true)).toBe(false);
  });
});

describe('isNextTo', () => {
  it('counts the eight neighbours and the tile itself', () => {
    expect(isNextTo({ col: 3, row: 3 }, { col: 4, row: 4 })).toBe(true);
    expect(isNextTo({ col: 3, row: 3 }, { col: 3, row: 3 })).toBe(true);
    expect(isNextTo({ col: 3, row: 3 }, { col: 5, row: 3 })).toBe(false);
  });
});
