import { describe, expect, it } from 'vitest';
import type { RoomId } from '../../contracts';
import { ROOM_DEFINITIONS } from './registry';
import type { RoomDefinition } from './room-definition';
import { validateRoomDefinitions } from './validate';

function room(overrides: Partial<RoomDefinition> & { id: RoomId }): RoomDefinition {
  return {
    title: 'Fixture Room',
    subtitle: 'Fixture',
    background: { kind: 'procedural' },
    grid: { origin: { x: 0, y: 0 }, tileWidth: 100, tileHeight: 50, columns: 2, rows: 2 },
    walkable: [
      [true, true],
      [true, true],
    ],
    doors: [],
    spawnTile: { col: 0, row: 0 },
    npcSlots: [],
    ...overrides,
  };
}

describe('validateRoomDefinitions', () => {
  it('finds no errors across the registered Room definitions', () => {
    expect(validateRoomDefinitions(ROOM_DEFINITIONS)).toEqual([]);
  });

  it('flags a duplicate room id', () => {
    const rooms = [room({ id: 'town-center' }), room({ id: 'town-center' })];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'duplicate room id "town-center"',
    });
  });

  it('flags an unwalkable spawn tile', () => {
    const rooms = [
      room({
        id: 'town-center',
        walkable: [
          [false, false],
          [false, false],
        ],
        spawnTile: { col: 0, row: 0 },
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'spawn tile { col: 0, row: 0 } is not walkable',
    });
  });

  it('flags a door that targets a Room with no definition', () => {
    const rooms = [
      room({
        id: 'town-center',
        doors: [
          {
            label: 'DEV PIT',
            hotspot: { x: 0, y: 0, width: 10, height: 10 },
            targetRoomId: 'dev-pit',
            entryTile: { col: 0, row: 0 },
          },
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'door "DEV PIT" targets undefined room "dev-pit"',
    });
  });

  it('accepts a disabled door (targetRoomId: null) with no defined destination', () => {
    const rooms = [
      room({
        id: 'town-center',
        doors: [
          {
            label: 'ROOF DECK',
            hotspot: { x: 0, y: 0, width: 10, height: 10 },
            targetRoomId: null,
            entryTile: { col: 0, row: 0 },
          },
        ],
      }),
    ];

    expect(validateRoomDefinitions(rooms)).toEqual([]);
  });
});
