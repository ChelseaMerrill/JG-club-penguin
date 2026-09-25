import { describe, expect, it } from 'vitest';
import type { RoomId } from '../../contracts';
import { getRoomDefinition, ROOM_DEFINITIONS } from './registry';
import type { RoomDefinition } from './room-definition';
import { validateRoomDefinitions } from './validate';

// A "live" figure the designs hard-coded but the prototype never actually
// computes (a headcount, a build status, a countdown): none of these may
// leak into a Room's title/subtitle. Carried over from the deleted
// `src/ui/hud/room-titles.test.ts` (#32) now that #13's `getRoomDefinition`
// is the one source of a Room's title/subtitle (#16 fix 3).
const FAKE_LIVE_PATTERNS = [
  /\d+ PENGUINS? HERE/,
  /\d+ ONLINE/,
  /\d+ SHOPPERS/,
  /BUILD PASSING/,
  /KICKOFF IN \d/,
];

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

  it('flags a duplicate hotspot id', () => {
    const rooms = [
      room({
        id: 'town-center',
        hotspots: [
          { id: 'trophy-case', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
          { id: 'trophy-case', label: 'B', rect: { x: 20, y: 20, width: 10, height: 10 } },
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'duplicate hotspot id "trophy-case"',
    });
  });

  it('flags a hotspot rect that falls outside the 1600x900 Stage', () => {
    const rooms = [
      room({
        id: 'town-center',
        hotspots: [
          {
            id: 'trophy-case',
            label: 'Trophy Case',
            rect: { x: 1550, y: 0, width: 100, height: 60 },
          },
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message:
        'hotspot "trophy-case" rect { x: 1550, y: 0, width: 100, height: 60 } is outside the 1600x900 Stage',
    });
  });

  it('accepts a hotspot rect that lies entirely within the Stage', () => {
    const rooms = [
      room({
        id: 'town-center',
        hotspots: [
          {
            id: 'trophy-case',
            label: 'Trophy Case',
            rect: { x: 880, y: 700, width: 120, height: 60 },
          },
        ],
      }),
    ];

    expect(validateRoomDefinitions(rooms)).toEqual([]);
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

// #16 fix 3: the verification-map assertions the execution plan named but
// the original PR never actually wrote as tests.
describe('ROOM_DEFINITIONS registry', () => {
  it('gives the Igloo furniture slots 1-6 and a trophy-case hotspot', () => {
    const igloo = getRoomDefinition('igloo');

    expect((igloo.furnitureSlots ?? []).map((slot) => slot.id)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
      'slot-4',
      'slot-5',
      'slot-6',
    ]);
    expect((igloo.hotspots ?? []).map((hotspot) => hotspot.id)).toContain('trophy-case');
  });

  it('gives the Roof Deck an igloo-gear-stall hotspot and a casey NPC slot', () => {
    const roofDeck = getRoomDefinition('roof-deck');

    expect((roofDeck.hotspots ?? []).map((hotspot) => hotspot.id)).toContain('igloo-gear-stall');
    expect(roofDeck.npcSlots.map((npc) => npc.npcId)).toContain('casey');
  });

  it('connects each Room only to its enabled (non-null) door targets', () => {
    const connections = Object.fromEntries(
      ROOM_DEFINITIONS.map((room) => [
        room.id,
        room.doors
          .filter((door) => door.targetRoomId !== null)
          .map((door) => door.targetRoomId)
          .sort(),
      ]),
    );

    expect(connections).toEqual({
      'town-center': ['dev-pit', 'roof-deck'],
      'dev-pit': ['town-center'],
      'the-melt': ['roof-deck', 'town-center'],
      'roof-deck': [],
      igloo: ['town-center'],
    });
  });

  it.each(ROOM_DEFINITIONS.map((room) => [room.id, room]))(
    '%s has a title/subtitle with no fabricated live figure',
    (_id, room) => {
      for (const pattern of FAKE_LIVE_PATTERNS) {
        expect(room.title).not.toMatch(pattern);
        expect(room.subtitle).not.toMatch(pattern);
      }
    },
  );

  it('resolves each Room title/subtitle from its design file', () => {
    expect(getRoomDefinition('town-center')).toMatchObject({
      title: 'TOWN CENTER',
      subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
    });
    expect(getRoomDefinition('dev-pit')).toMatchObject({
      title: 'DEV PIT',
      subtitle: 'TEAM RMS 1–4 · FLOOR 5',
    });
    expect(getRoomDefinition('the-melt')).toMatchObject({
      title: 'THE KITCHEN',
      subtitle: 'KITCHEN · FLOOR 5',
    });
    expect(getRoomDefinition('roof-deck')).toMatchObject({
      title: 'THE MARKET',
      subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
    });
    expect(getRoomDefinition('igloo')).toMatchObject({
      title: 'YOUR IGLOO',
      subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
    });
  });
});
