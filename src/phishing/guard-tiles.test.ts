import { describe, expect, it } from 'vitest';
import type { Tile } from '../contracts';
import { doorApproachTile, npcInteractionTile } from '../game/movement/targets';
import { npcLayout } from '../game/npcs/npc-layout';
import { tileToScreen } from '../game/rooms/iso';
import { getRoomDefinition, ROOM_DEFINITIONS } from '../game/rooms/registry';
import type { DoorHotspot, RoomDefinition, RoomDoor } from '../game/rooms/room-definition';
import { getNpcDefinition } from '../npcs/npcs';
import { FAKE_GUARD_POSTS } from './fake-data';
import {
  guardPaceAvoidTiles,
  guardPaceTiles,
  guardTile,
  isNextTo,
  npcOccupiedTiles,
} from './guard-placement';
import { GUARD_NPC_ID } from './phishing-client';

// #170 D14: every guard post's door carries its own `guardTile`, and these
// invariants rule out a bump on another door's walk and a Player landing on
// Anthony:
//   I1 the tile is walkable;
//   I2 it isn't any exit's approach tile nor any landing tile (every
//      `entryTile` and `floorChoices` entry targeting the Room, plus its spawn);
//   I3 it isn't next to the approach tile of any exit with a different label;
//   I4 it isn't any NPC's slot or path tile (`npcOccupiedTiles`);
//   I5 it isn't any NPC's talk tile (`npcInteractionTile`);
//   I6 every pace tile satisfies I1, I2 and I4;
//   I7 (RT170-22) his click zone, at his post and on every pace tile, never
//      intersects another label's exit hotspot (his zone is checked before
//      doors).

const same = (a: Tile, b: Tile): boolean => a.col === b.col && a.row === b.row;
const has = (tiles: readonly Tile[], tile: Tile): boolean => tiles.some((t) => same(t, tile));
const show = ({ col, row }: Tile): string => `(${col},${row})`;

const HIT_ZONE = npcLayout(getNpcDefinition(GUARD_NPC_ID)!).hitArea;

function doorOf(room: RoomDefinition, label: string): RoomDoor {
  const door = room.doors.find((candidate) => candidate.label === label);
  if (!door) throw new Error(`${room.id} has no "${label}" door`);
  return door;
}

function landingTiles(room: RoomDefinition): Tile[] {
  const tiles: Tile[] = [room.spawnTile];
  for (const other of ROOM_DEFINITIONS) {
    for (const door of other.doors) {
      if (door.targetRoomId === room.id) tiles.push(door.entryTile);
      for (const choice of door.floorChoices ?? []) {
        if (choice.targetRoomId === room.id) tiles.push(choice.entryTile);
      }
    }
  }
  return tiles;
}

function approachTiles(room: RoomDefinition): { label: string; tile: Tile }[] {
  return room.doors.map((door) => ({
    label: door.label,
    tile: doorApproachTile(room.walkable, door, room.grid.origin),
  }));
}

function zoneAt(room: RoomDefinition, tile: Tile): DoorHotspot {
  const feet = tileToScreen(tile, room.grid.origin);
  return {
    x: feet.x + HIT_ZONE.centerX - HIT_ZONE.width / 2,
    y: feet.y + HIT_ZONE.centerY - HIT_ZONE.height / 2,
    width: HIT_ZONE.width,
    height: HIT_ZONE.height,
  };
}

const overlaps = (a: DoorHotspot, b: DoorHotspot): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every way the tile breaks I1-I5 for the post guarding `label` in `room`. */
function postViolations(room: RoomDefinition, label: string, tile: Tile): string[] {
  const out: string[] = [];
  if (room.walkable[tile.row]?.[tile.col] !== true) out.push('I1 not walkable');
  for (const approach of approachTiles(room)) {
    if (same(approach.tile, tile)) out.push(`I2 on ${approach.label}'s approach`);
    if (approach.label !== label && isNextTo(approach.tile, tile)) {
      out.push(`I3 next to ${approach.label}'s approach ${show(approach.tile)}`);
    }
  }
  if (has(landingTiles(room), tile)) out.push('I2 on a landing tile');
  if (has(npcOccupiedTiles(room), tile)) out.push('I4 on an NPC slot or path tile');
  for (const slot of room.npcSlots) {
    if (same(npcInteractionTile(room.walkable, slot), tile)) {
      out.push(`I5 on ${slot.npcId}'s talk tile`);
    }
  }
  return out;
}

/** Every way a pace tile (or, with `post`, the post itself) breaks I6/I7. */
function paceViolations(room: RoomDefinition, label: string, tile: Tile, post: boolean): string[] {
  const out: string[] = [];
  if (!post) {
    if (room.walkable[tile.row]?.[tile.col] !== true) out.push('I6/I1 not walkable');
    if (approachTiles(room).some((approach) => same(approach.tile, tile))) {
      out.push("I6/I2 on an exit's approach");
    }
    if (has(landingTiles(room), tile)) out.push('I6/I2 on a landing tile');
    if (has(npcOccupiedTiles(room), tile)) out.push('I6/I4 on an NPC slot or path tile');
  }
  const zone = zoneAt(room, tile);
  for (const door of room.doors) {
    if (door.label !== label && overlaps(zone, door.hotspot)) {
      out.push(`I7 zone covers ${door.label}${door.kind === 'pill' ? ' (pill)' : ''}`);
    }
  }
  return out;
}

/**
 * The final guard-tile table (#170 D14, recomputed after the exit pills were
 * measured, RT170-23): each DN5 post's own approach tile, its guard tile, and
 * the tiles he paces onto. A mask, door or NPC change that moves any of these
 * fails here first.
 */
const GUARD_TILE_TABLE: { post: string; approach: string; guard: string; paces: string }[] = [
  { post: 'office-hallway / TEAM ROOM 1', approach: '(0,0)', guard: '(3,2)', paces: '(3,1) (3,3)' },
  { post: 'town-center / KITCHEN', approach: '(2,0)', guard: '(2,1)', paces: '(2,2)' },
  { post: 'office-hallway / TEAM ROOM 2', approach: '(1,0)', guard: '(6,3)', paces: '(5,3) (7,3)' },
  { post: 'dev-pit / THE ICEBOX', approach: '(0,0)', guard: '(2,0)', paces: '(3,0)' },
  { post: 'office-hallway / DEV PIT', approach: '(9,0)', guard: '(12,1)', paces: '(13,1) (12,2)' },
  { post: 'the-melt / ROOF DECK', approach: '(10,0)', guard: '(11,1)', paces: '(11,0) (11,2)' },
  { post: 'office-hallway / TEAM ROOM 3', approach: '(3,0)', guard: '(8,3)', paces: '(7,3) (9,3)' },
  {
    post: 'town-center / THE HALLWAY',
    approach: '(10,0)',
    guard: '(11,1)',
    paces: '(11,0) (11,2)',
  },
  { post: 'office-hallway / BATHROOM', approach: '(7,0)', guard: '(11,2)', paces: '(11,3)' },
  { post: 'dev-pit / THE HALLWAY', approach: '(0,0)', guard: '(0,2)', paces: '(0,3)' },
  {
    post: 'office-hallway / TEAM ROOM 4',
    approach: '(5,0)',
    guard: '(10,3)',
    paces: '(9,3) (11,3)',
  },
  { post: 'the-melt / TOWN CENTER', approach: '(0,5)', guard: '(1,6)', paces: '(1,5) (1,7)' },
  { post: 'office-hallway / TOWN CENTER', approach: '(0,0)', guard: '(1,2)', paces: '(1,1)' },
  { post: 'town-center / STAIRWELL', approach: '(0,2)', guard: '(1,3)', paces: '(1,2) (1,4)' },
  { post: 'roof-deck / KITCHEN', approach: '(5,8)', guard: '(7,9)', paces: '(8,9)' },
  { post: 'town-center / ELEVATOR · ROOF DECK', approach: '(0,6)', guard: '(0,5)', paces: '' },
];

describe('guard tiles (#170 D14)', () => {
  const posts = FAKE_GUARD_POSTS.map(({ roomId, doorLabel }) => {
    const room = getRoomDefinition(roomId);
    const door = doorOf(room, doorLabel);
    const tile = guardTile(room, { doorLabel }, room.spawnTile)!;
    const avoid = guardPaceAvoidTiles(room, ROOM_DEFINITIONS, doorLabel, HIT_ZONE);
    return { room, door, label: doorLabel, tile, paces: guardPaceTiles(room, tile, avoid) };
  });

  it("gives every DN5 post's door its own guardTile, which guardTile() uses", () => {
    for (const { room, door, label, tile } of posts) {
      expect(door.guardTile, `${room.id} / ${label}`).toBeDefined();
      expect(tile, `${room.id} / ${label}`).toEqual(door.guardTile);
    }
  });

  it('keeps every guard tile clear of I1-I5', () => {
    const failures = posts.flatMap(({ room, label, tile }) =>
      postViolations(room, label, tile).map((v) => `${room.id} / ${label} ${show(tile)}: ${v}`),
    );
    expect(failures).toEqual([]);
  });

  it('keeps every pace tile clear of I1, I2 and I4 (I6)', () => {
    const failures = posts.flatMap(({ room, label, paces }) =>
      paces.flatMap((pace) =>
        paceViolations(room, label, pace, false)
          .filter((v) => v.startsWith('I6'))
          .map((v) => `${room.id} / ${label} pace ${show(pace)}: ${v}`),
      ),
    );
    expect(failures).toEqual([]);
  });

  it("keeps his click zone off every other label's exit, at his post and on every pace tile (I7, RT170-22)", () => {
    const failures = posts.flatMap(({ room, label, tile, paces }) =>
      [tile, ...paces].flatMap((at, index) =>
        paceViolations(room, label, at, index === 0)
          .filter((v) => v.startsWith('I7'))
          .map((v) => `${room.id} / ${label} ${index === 0 ? 'post' : 'pace'} ${show(at)}: ${v}`),
      ),
    );
    expect(failures).toEqual([]);
  });

  it('matches the final guard-tile table', () => {
    expect(
      posts.map(({ room, door, label, tile, paces }) => ({
        post: `${room.id} / ${label}`,
        approach: show(doorApproachTile(room.walkable, door, room.grid.origin)),
        guard: show(tile),
        paces: paces.map(show).join(' '),
      })),
    ).toEqual(GUARD_TILE_TABLE);
  });
});
