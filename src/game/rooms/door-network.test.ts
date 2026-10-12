import { describe, expect, it } from 'vitest';
import type { RoomId, Tile } from '../../contracts';
import { nearestWalkable } from '../movement/pathfinding';
import { doorApproachTile } from '../movement/targets';
import { screenToTile } from './iso';
import { getRoomDefinition, ROOM_DEFINITIONS } from './registry';
import type { RoomDefinition, RoomDoor } from './room-definition';
import { isStairwellRoom } from './stairwell';

// #170's door network: every door and exit pill goes where its Room design
// links, and the Player lands at the matching door (D8).

/** The design's links, per Room, in `doors` order: label, kind, target (`null` = locked). */
const DESIGN: Partial<Record<RoomId, [string, 'door' | 'pill', RoomId | null][]>> = {
  'town-center': [
    ['KITCHEN', 'door', 'the-melt'],
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['STAIRWELL', 'door', 'stairwell-5'],
    // PR C puts the floor picker in front of both ELEVATOR exits (D9).
    ['ELEVATOR · ROOF DECK', 'door', 'roof-deck'],
    ['KITCHEN', 'pill', 'the-melt'],
  ],
  'office-hallway': [
    ['TOWN CENTER', 'door', 'town-center'],
    ['TEAM ROOM 1', 'door', 'team-room-1'],
    ['TEAM ROOM 2', 'door', 'team-room-2'],
    ['TEAM ROOM 3', 'door', 'team-room-3'],
    ['TEAM ROOM 4', 'door', 'team-room-4'],
    ['BATHROOM', 'door', 'bathroom'],
    ['DEV PIT', 'door', 'dev-pit'],
    ['TOWN CENTER', 'pill', 'town-center'],
    ['DEV PIT', 'pill', 'dev-pit'],
  ],
  'dev-pit': [
    ['THE ICEBOX', 'door', 'the-icebox'],
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
    ['THE MULLET', 'pill', 'the-mullet'],
  ],
  'the-icebox': [
    ['DEV PIT', 'door', 'dev-pit'],
    ['DEV PIT', 'pill', 'dev-pit'],
  ],
  'the-melt': [
    ['TOWN CENTER', 'door', 'town-center'],
    ['ROOF DECK', 'door', 'roof-deck'],
    ['TOWN CENTER', 'pill', 'town-center'],
    ['ROOF DECK', 'pill', 'roof-deck'],
  ],
  'roof-deck': [
    ['KITCHEN', 'door', 'the-melt'],
    ['KITCHEN', 'pill', 'the-melt'],
    ['ELEVATOR', 'pill', 'town-center'],
    ['STAIRS', 'pill', 'stairwell-5'],
  ],
  'the-mullet': [
    ['HALLWAY B', 'door', null],
    ['DEV PIT', 'door', 'dev-pit'],
    ['HALLWAY B', 'pill', null],
    ['DEV PIT', 'pill', 'dev-pit'],
  ],
  bathroom: [
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
  ],
  'team-room-1': [
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
  ],
  'team-room-2': [
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
  ],
  'team-room-3': [
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
  ],
  'team-room-4': [
    ['THE HALLWAY', 'door', 'office-hallway'],
    ['THE HALLWAY', 'pill', 'office-hallway'],
  ],
  igloo: [
    ['TOWN CENTER', 'door', 'town-center'],
    ['TOWN CENTER', 'pill', 'town-center'],
  ],
};

/** Rooms reached only from the Map or a HUD button, never through a door. */
const NOT_ON_THE_DOOR_GRAPH = (id: RoomId): boolean =>
  id === 'igloo' || id === 'remote-lounge' || id.startsWith('latam-');

const kindOf = (door: RoomDoor): 'door' | 'pill' => door.kind ?? 'door';

/** A door's sill in its own Room: its hotspot's bottom-centre, then the nearest walkable tile. */
function sill(room: RoomDefinition, door: RoomDoor): Tile {
  const { x, y, width, height } = door.hotspot;
  return nearestWalkable(
    room.walkable,
    screenToTile({ x: x + width / 2, y: y + height }, room.grid.origin),
  );
}

/**
 * D8's landing for a door from `from` into `target`: the sill of the
 * matching in-scene door (one in `target` leading back to `from`), else the
 * matching pill's approach tile, else `target`'s spawn tile.
 */
function landing(from: RoomId, target: RoomDefinition): Tile {
  const back = target.doors.filter((door) => door.targetRoomId === from);
  const door = back.find((candidate) => kindOf(candidate) === 'door');
  if (door) return sill(target, door);
  const pill = back.find((candidate) => kindOf(candidate) === 'pill');
  if (pill) return doorApproachTile(target.walkable, pill, target.grid.origin);
  return target.spawnTile;
}

/** Every (from, to) edge of the enabled door graph. */
function edges(): [RoomId, RoomId][] {
  return ROOM_DEFINITIONS.flatMap((room) =>
    room.doors
      .filter((door) => door.targetRoomId !== null)
      .map((door): [RoomId, RoomId] => [room.id, door.targetRoomId!]),
  );
}

describe('the door network (#170)', () => {
  it("matches each Room's design links, in order", () => {
    for (const [roomId, links] of Object.entries(DESIGN) as [RoomId, typeof DESIGN.igloo][]) {
      expect(
        getRoomDefinition(roomId).doors.map((door) => [
          door.label,
          kindOf(door),
          door.targetRoomId,
        ]),
        roomId,
      ).toEqual(links);
    }
  });

  it('lands every enabled door and pill at the matching door (D8)', () => {
    const failures: string[] = [];
    for (const room of ROOM_DEFINITIONS) {
      for (const door of room.doors) {
        if (door.targetRoomId === null) continue;
        // Stairwell floor to floor follows S4-D4 instead (`stairwell.test.ts`).
        if (isStairwellRoom(room.id) && isStairwellRoom(door.targetRoomId)) continue;
        const expected = landing(room.id, getRoomDefinition(door.targetRoomId));
        if (expected.col !== door.entryTile.col || expected.row !== door.entryTile.row) {
          failures.push(
            `${room.id} / ${door.label} (${kindOf(door)}) -> ${door.targetRoomId}: (${door.entryTile.col},${door.entryTile.row}), expected (${expected.col},${expected.row})`,
          );
        }
        for (const choice of door.floorChoices ?? []) {
          if (choice.targetRoomId === null) continue;
          const want = landing(room.id, getRoomDefinition(choice.targetRoomId));
          if (want.col !== choice.entryTile.col || want.row !== choice.entryTile.row) {
            failures.push(`${room.id} / ${door.label} floor ${choice.floor}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('lists each pill twin after its door, with the same target and landing', () => {
    for (const room of ROOM_DEFINITIONS) {
      room.doors.forEach((door, index) => {
        const first = room.doors.findIndex((candidate) => candidate.label === door.label);
        if (first === index) return;
        const original = room.doors[first]!;
        expect(kindOf(door), `${room.id} / ${door.label} repeats only as a pill`).toBe('pill');
        expect(door.targetRoomId, `${room.id} / ${door.label}`).toBe(original.targetRoomId);
        expect(door.entryTile, `${room.id} / ${door.label}`).toEqual(original.entryTile);
      });
    }
  });

  it('reaches the Dev Pit only through the Hallway, and the Icebox only from the Dev Pit (AC2)', () => {
    const into = (target: RoomId) =>
      [
        ...new Set(
          edges()
            .filter(([, to]) => to === target)
            .map(([from]) => from),
        ),
      ].sort();
    expect(into('the-icebox')).toEqual(['dev-pit']);
    // The Icebox and the Mullet are only reached from the Dev Pit itself.
    expect(into('the-mullet')).toEqual(['dev-pit']);
    expect(into('dev-pit')).toEqual(['office-hallway', 'the-icebox', 'the-mullet']);
    // Town Center has no way into the Dev Pit, the Icebox or the Mullet
    // that doesn't pass through the Hallway.
    const reachable = new Set<RoomId>(['town-center']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [from, to] of edges()) {
        if (from === 'office-hallway' || !reachable.has(from) || reachable.has(to)) continue;
        reachable.add(to);
        grew = true;
      }
    }
    for (const behind of ['dev-pit', 'the-icebox', 'the-mullet'] as RoomId[]) {
      expect(reachable.has(behind), behind).toBe(false);
    }
  });

  it('connects every door-graph Room to every other, both ways (strong connectivity)', () => {
    const rooms = ROOM_DEFINITIONS.map((room) => room.id).filter(
      (id) => !NOT_ON_THE_DOOR_GRAPH(id),
    );
    const all = edges();
    const reach = (start: RoomId, forward: boolean): Set<RoomId> => {
      const seen = new Set<RoomId>([start]);
      const queue = [start];
      while (queue.length > 0) {
        const at = queue.shift()!;
        for (const [from, to] of all) {
          const [a, b] = forward ? [from, to] : [to, from];
          if (a === at && !seen.has(b)) {
            seen.add(b);
            queue.push(b);
          }
        }
      }
      return seen;
    };
    const forward = reach('town-center', true);
    const backward = reach('town-center', false);
    expect(rooms.filter((id) => !forward.has(id))).toEqual([]);
    expect(rooms.filter((id) => !backward.has(id))).toEqual([]);
  });

  it('says "HALLWAY A" nowhere: no title, subtitle or door label', () => {
    for (const room of ROOM_DEFINITIONS) {
      expect(room.title, room.id).not.toMatch(/HALLWAY A\b/);
      expect(room.subtitle, room.id).not.toMatch(/HALLWAY A\b/);
      for (const door of room.doors) expect(door.label, room.id).not.toMatch(/HALLWAY A\b/);
    }
  });
});
