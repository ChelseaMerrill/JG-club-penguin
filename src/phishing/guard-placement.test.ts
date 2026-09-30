import { describe, expect, it } from 'vitest';
import { getRoomDefinition } from '../game/rooms/registry';
import { townCenter } from '../game/rooms/definitions/town-center';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../game/npcs/css-keyframes';
import { TILE_HEIGHT, TILE_WIDTH } from '../game/rooms/iso';
import type { RoomDefinition } from '../game/rooms/room-definition';
import type { NpcMotionSpec } from '../npcs/npc-motions';
import {
  createBumpTracker,
  GUARD_PACE_PERIOD_S,
  guardPaceMotion,
  guardTile,
  isGuardedDoor,
  isNextTo,
  npcOccupiedTiles,
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
  it("stands clear of the Room's own NPCs (not on or next to one), within 3 tiles of the Player", () => {
    for (const room of [townCenter, getRoomDefinition('dev-pit')]) {
      const tile = guardTile(room, { doorLabel: null }, room.spawnTile)!;
      const away = Math.max(
        Math.abs(tile.col - room.spawnTile.col),
        Math.abs(tile.row - room.spawnTile.row),
      );
      // 3, not 2: the Dev Pit's spawn tile (6,1) is on Steven's walk, and
      // every tile around it is on it too or next to a slot.
      expect(away, room.id).toBeLessThanOrEqual(3);
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

describe('npcOccupiedTiles', () => {
  it("covers each NPC's slot and every tile a roaming NPC walks over", () => {
    const room = getRoomDefinition('dev-pit');
    const key = (tile: { col: number; row: number }) => `${tile.col},${tile.row}`;
    const occupied = new Set(npcOccupiedTiles(room).map(key));
    for (const slot of room.npcSlots) expect(occupied.has(key(slot.tile)), slot.npcId).toBe(true);
    // Steven's loop waypoints (7,0), (4,0) and (4,1), and a tile between them.
    for (const tile of ['7,0', '4,0', '4,1', '5,0', '6,1'])
      expect(occupied.has(tile), tile).toBe(true);
  });

  it("never puts a locked-out Player's Anthony where a Dev Pit NPC walks", () => {
    const room = getRoomDefinition('dev-pit');
    const occupied = npcOccupiedTiles(room);
    for (let row = 0; row < room.walkable.length; row += 1) {
      for (let col = 0; col < room.walkable[row]!.length; col += 1) {
        if (!room.walkable[row]![col]) continue;
        const tile = guardTile(room, { doorLabel: null }, { col, row })!;
        expect(
          occupied.some((npc) => npc.col === tile.col && npc.row === tile.row),
          `player at ${col},${row} -> ${tile.col},${tile.row}`,
        ).toBe(false);
      }
    }
  });
});

describe('guardPaceMotion', () => {
  /** Where `motion` has him at `fraction` of the loop, as a Tile offset from his post. */
  function offsetAt(motion: NpcMotionSpec, fraction: number): { dc: number; dr: number } {
    const point = transformPoint(
      sampleCssAnimation(compileCssAnimation(motion.path!), fraction * GUARD_PACE_PERIOD_S * 1000),
      { x: 0, y: 0 },
    );
    // Invert `tileToScreen`'s delta: dx = (dc - dr) * W/2, dy = (dc + dr) * H/2.
    const u = point.x / (TILE_WIDTH / 2);
    const v = point.y / (TILE_HEIGHT / 2);
    return { dc: Math.round((u + v) / 2), dr: Math.round((v - u) / 2) };
  }

  it('paces from every door post out to free walkable tiles beside it and back', () => {
    for (const room of [townCenter, getRoomDefinition('dev-pit')]) {
      for (const door of room.doors) {
        const post = guardTile(room, { doorLabel: door.label }, { col: 0, row: 0 })!;
        const motion = guardPaceMotion(room, post)!;
        const label = `${room.id} ${door.label}`;
        expect(offsetAt(motion, 0.05), label).toEqual({ dc: 0, dr: 0 });
        expect(offsetAt(motion, 0.55), label).toEqual({ dc: 0, dr: 0 });
        const sides = [offsetAt(motion, 0.3), offsetAt(motion, 0.8)].filter(
          ({ dc, dr }) => dc !== 0 || dr !== 0,
        );
        expect(sides.length, label).toBeGreaterThan(0);
        for (const { dc, dr } of sides) {
          expect(Math.abs(dc) + Math.abs(dr), label).toBe(1);
          const tile = { col: post.col + dc, row: post.row + dr };
          expect(room.walkable[tile.row]?.[tile.col], label).toBe(true);
          expect(
            room.npcSlots.some((slot) => slot.tile.col === tile.col && slot.tile.row === tile.row),
            label,
          ).toBe(false);
        }
      }
    }
  });

  it('prefers two opposite sides, so he stays in front of the door', () => {
    const open: RoomDefinition = {
      ...townCenter,
      walkable: townCenter.walkable.map((row) => row.map(() => true)),
      npcSlots: [],
    };
    const motion = guardPaceMotion(open, { col: 5, row: 5 })!;
    expect(offsetAt(motion, 0.3)).toEqual({ dc: -1, dr: 0 });
    expect(offsetAt(motion, 0.8)).toEqual({ dc: 1, dr: 0 });
  });

  it('stands still when no tile beside his post is free', () => {
    const boxedIn: RoomDefinition = {
      ...townCenter,
      walkable: townCenter.walkable.map((row) => row.map(() => false)),
    };
    expect(guardPaceMotion(boxedIn, { col: 3, row: 3 })).toBeUndefined();
  });
});
