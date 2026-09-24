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
    grid: { origin: { x: 0, y: 0 }, columns: 2, rows: 2 },
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

  it('flags a walkable mask with the wrong number of rows', () => {
    const rooms = [
      room({
        id: 'town-center',
        grid: { origin: { x: 0, y: 0 }, columns: 2, rows: 3 },
        walkable: [
          [true, true],
          [true, true],
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'walkable mask has 2 row(s), grid.rows is 3',
    });
  });

  it('flags a walkable row with the wrong number of columns', () => {
    const rooms = [
      room({
        id: 'town-center',
        grid: { origin: { x: 0, y: 0 }, columns: 3, rows: 2 },
        walkable: [
          [true, true],
          [true, true],
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'walkable row 0 has 2 column(s), grid.columns is 3',
    });
  });

  it('flags an out-of-bounds NPC slot', () => {
    const rooms = [
      room({
        id: 'town-center',
        npcSlots: [{ npcId: 'darrin', tile: { col: 5, row: 0 } }],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'NPC "darrin" tile { col: 5, row: 0 } is out of bounds',
    });
  });

  it('flags an out-of-bounds furniture slot', () => {
    const rooms = [
      room({
        id: 'town-center',
        furnitureSlots: [{ id: 'sofa', tile: { col: -1, row: 0 } }],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'furniture slot "sofa" tile { col: -1, row: 0 } is out of bounds',
    });
  });

  it('flags an out-of-bounds prop', () => {
    const rooms = [
      room({
        id: 'town-center',
        props: [{ id: 'planter', tile: { col: 0, row: 9 } }],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'prop "planter" tile { col: 0, row: 9 } is out of bounds',
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

  it('flags a door whose entryTile is not walkable in its target Room', () => {
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
      room({
        id: 'dev-pit',
        walkable: [
          [false, false],
          [false, false],
        ],
        spawnTile: { col: 1, row: 1 },
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message:
        'door "DEV PIT" entryTile { col: 0, row: 0 } is not walkable in target room "dev-pit"',
    });
  });

  it("accepts a door whose entryTile is walkable in its target Room, even though it isn't walkable in its own", () => {
    const rooms = [
      room({
        id: 'town-center',
        walkable: [
          [false, false],
          [false, false],
        ],
        spawnTile: { col: 0, row: 0 },
        doors: [
          {
            label: 'DEV PIT',
            hotspot: { x: 0, y: 0, width: 10, height: 10 },
            targetRoomId: 'dev-pit',
            entryTile: { col: 0, row: 0 },
          },
        ],
      }),
      room({ id: 'dev-pit' }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('DEV PIT') }),
    );
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
