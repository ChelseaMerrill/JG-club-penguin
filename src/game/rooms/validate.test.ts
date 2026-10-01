import { describe, expect, it } from 'vitest';
import type { RoomId } from '../../contracts';
import { getRoomDefinition, ROOM_DEFINITIONS } from './registry';
import { IGLOO_SLOT_PLACEMENT, IGLOO_SLOTS } from '../../persistence/progress-store';
import { WALL_ART_MAX_WIDTH } from './furniture-art';
import { iglooSlotForSlotId } from './furniture-slots';
import { tileToScreen } from './iso';
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
  // #51: the Hallway's, Team Rooms' and Bathroom's banners add headcounts,
  // a training progress figure and a stall-occupancy count. The Igloo's
  // "1 PENGUIN" is its fixed capacity, not a headcount, so only the plural
  // is a live figure here.
  /\d+ PENGUINS\b/,
  /\d+ HUMANS?\b/,
  /TRAINING \d+%/,
  /STALLS FREE/,
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

  it('flags a wall or ceiling furniture slot outside the Stage', () => {
    const rooms = [
      room({
        id: 'town-center',
        furnitureSlots: [
          { id: 'poster', placement: 'wall', wall: 'left', anchor: { x: 1700, y: 100 } },
        ],
      }),
    ];

    expect(validateRoomDefinitions(rooms)).toEqual(
      expect.arrayContaining([
        {
          roomId: 'town-center',
          message:
            'furniture slot "poster" anchor { x: 1700, y: 100 } is outside the 1600x900 Stage',
        },
      ]),
    );
  });

  it('flags a furniture slot whose placement contradicts its slot number', () => {
    const rooms = [
      room({
        id: 'town-center',
        furnitureSlots: [{ id: 'slot-7', placement: 'floor', tile: { col: 0, row: 0 } }],
      }),
    ];

    expect(validateRoomDefinitions(rooms)).toEqual(
      expect.arrayContaining([
        {
          roomId: 'town-center',
          message: 'furniture slot "slot-7" is floor, but slot 7 is a wall slot',
        },
      ]),
    );
  });

  it('flags an out-of-bounds furniture slot', () => {
    const rooms = [
      room({
        id: 'town-center',
        furnitureSlots: [{ id: 'sofa', placement: 'floor', tile: { col: -1, row: 0 } }],
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

  it('flags a wallText anchor outside the 1600x900 Stage', () => {
    const rooms = [
      room({
        id: 'town-center',
        wallText: [
          {
            id: 'heading',
            text: 'CORE VALUES',
            x: 1700,
            y: 217.5,
            colour: '#B3B6C9',
            maxWidth: 115,
            skewY: 0.5,
          },
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'wall text "heading" anchor { x: 1700, y: 217.5 } is outside the 1600x900 Stage',
    });
  });

  it('flags a wallText block with a non-positive maxWidth', () => {
    const rooms = [
      room({
        id: 'town-center',
        wallText: [
          {
            id: 'serve',
            text: 'SERVE',
            x: 995,
            y: 224,
            colour: '#F4F4F4',
            maxWidth: 0,
            skewY: 0.5,
          },
        ],
      }),
    ];

    const errors = validateRoomDefinitions(rooms);

    expect(errors).toContainEqual({
      roomId: 'town-center',
      message: 'wall text "serve" maxWidth 0 must be greater than 0',
    });
  });

  it('accepts a wallText block inside the Stage with a positive maxWidth', () => {
    const rooms = [
      room({
        id: 'town-center',
        wallText: [
          {
            id: 'serve',
            text: 'SERVE',
            x: 995,
            y: 224,
            colour: '#F4F4F4',
            maxWidth: 15,
            skewY: 0.5,
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
  it('gives the Igloo furniture slots 1-11 and a trophy-case hotspot', () => {
    const igloo = getRoomDefinition('igloo');

    expect((igloo.furnitureSlots ?? []).map((slot) => slot.id)).toEqual(
      IGLOO_SLOTS.map((slot) => `slot-${slot}`),
    );
    expect((igloo.hotspots ?? []).map((hotspot) => hotspot.id)).toContain('trophy-case');
  });

  // #135: 6 floor, 4 wall and 1 ceiling slot, at the positions approved at
  // the H4 mockup gate. Each slot's placement matches the database's.
  it('gives each Igloo slot the placement IGLOO_SLOT_PLACEMENT names for its number', () => {
    const igloo = getRoomDefinition('igloo');

    for (const slot of igloo.furnitureSlots ?? []) {
      const number = iglooSlotForSlotId(slot.id);
      expect(number, slot.id).not.toBeNull();
      expect(slot.placement, slot.id).toBe(IGLOO_SLOT_PLACEMENT[number!]);
    }
  });

  it('puts the Igloo floor slots on walkable, non-spawn Tiles that never touch each other', () => {
    const igloo = getRoomDefinition('igloo');
    const floor = (igloo.furnitureSlots ?? []).flatMap((slot) =>
      slot.placement === 'floor' ? [slot] : [],
    );

    expect(floor.map((slot) => slot.tile)).toEqual([
      { col: 2, row: 0 },
      { col: 4, row: 0 },
      { col: 10, row: 0 },
      { col: 11, row: 2 },
      { col: 2, row: 2 },
      { col: 0, row: 8 },
    ]);
    for (const slot of floor) {
      expect(igloo.walkable[slot.tile.row][slot.tile.col], slot.id).toBe(true);
      expect(slot.tile, slot.id).not.toEqual(igloo.spawnTile);
    }
    for (const [i, a] of floor.entries()) {
      for (const b of floor.slice(i + 1)) {
        const touching =
          Math.abs(a.tile.col - b.tile.col) <= 1 && Math.abs(a.tile.row - b.tile.row) <= 1;
        expect(touching, `${a.id} and ${b.id}`).toBe(false);
      }
    }
  });

  it('hangs the Igloo wall and ceiling slots at the approved Stage points', () => {
    const igloo = getRoomDefinition('igloo');
    const hanging = (igloo.furnitureSlots ?? []).filter((slot) => slot.placement !== 'floor');

    expect(hanging).toEqual([
      { id: 'slot-7', placement: 'wall', wall: 'left', anchor: { x: 527, y: 275 } },
      { id: 'slot-8', placement: 'wall', wall: 'left', anchor: { x: 660, y: 212 } },
      { id: 'slot-9', placement: 'wall', wall: 'right', anchor: { x: 843, y: 158 } },
      { id: 'slot-10', placement: 'wall', wall: 'right', anchor: { x: 898, y: 186 } },
      {
        id: 'slot-11',
        placement: 'ceiling',
        anchor: { x: 868, y: 356 },
        cordTopY: 40,
        shadow: { x: 868, y: 525 },
      },
    ]);
    expect(igloo.subtitle).toBe('PLAYER HOME · 1 PENGUIN · 1 HEXLE · 11 FURNITURE SLOTS');
  });

  it("hangs the Disco Ball's cord clear of the wall art and its ball clear of floor slots 1 and 5 (#161 review)", () => {
    const igloo = getRoomDefinition('igloo');
    const slots = igloo.furnitureSlots ?? [];
    const byId = (id: string) => slots.find((slot) => slot.id === id)!;
    const ceiling = byId('slot-11');
    if (ceiling.placement !== 'ceiling') throw new Error('slot-11 is not the ceiling slot');
    const half = WALL_ART_MAX_WIDTH / 2;
    const ballRadius = 18;
    // Floor art spans at most 26 px either side of its Tile point and sits on
    // or above it (the beanbag reaches 7 px below).
    const floorArt = (id: string) => {
      const slot = byId(id);
      if (slot.placement !== 'floor') throw new Error(`${id} is not a floor slot`);
      const point = tileToScreen(slot.tile, igloo.grid.origin);
      return { left: point.x - 26, right: point.x + 26, top: point.y - 50, bottom: point.y + 7 };
    };

    for (const id of ['slot-9', 'slot-10']) {
      const wall = byId(id);
      if (wall.placement !== 'wall') throw new Error(`${id} is not a wall slot`);
      const clear =
        ceiling.anchor.x < wall.anchor.x - half || ceiling.anchor.x > wall.anchor.x + half;
      expect(clear, `cord x=${ceiling.anchor.x} crosses ${id}'s art`).toBe(true);
    }
    for (const id of ['slot-1', 'slot-5']) {
      const art = floorArt(id);
      const ball = {
        left: ceiling.anchor.x - ballRadius,
        right: ceiling.anchor.x + ballRadius,
        top: ceiling.anchor.y - ballRadius,
        bottom: ceiling.anchor.y + ballRadius,
      };
      const overlaps =
        ball.left < art.right &&
        ball.right > art.left &&
        ball.top < art.bottom &&
        ball.bottom > art.top;
      expect(overlaps, `the ball overlaps ${id}'s art`).toBe(false);
    }
  });

  it('gives Town Center a core-values-poster hotspot (#77 D5)', () => {
    const townCenter = getRoomDefinition('town-center');

    expect((townCenter.hotspots ?? []).map((hotspot) => hotspot.id)).toContain(
      'core-values-poster',
    );
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
      'town-center': ['dev-pit', 'roof-deck', 'the-icebox'],
      'dev-pit': ['the-icebox', 'town-center'],
      'the-melt': ['roof-deck', 'town-center'],
      // #100: the Roof Deck's new KITCHEN floor-arrow door, its first exit.
      'roof-deck': ['the-melt'],
      igloo: ['town-center'],
      'the-icebox': ['dev-pit', 'town-center'],
      // #51: the Hallway's TEAM ROOM 5-9 doors stay disabled (no designs).
      'office-hallway': ['team-room-1', 'team-room-2', 'team-room-3', 'team-room-4', 'town-center'],
      'team-room-1': ['office-hallway'],
      'team-room-2': ['office-hallway'],
      'team-room-3': ['office-hallway'],
      'team-room-4': ['office-hallway'],
      bathroom: ['office-hallway'],
      // #51 slice 3: one-way doors out; nothing draws a door in (D5).
      'the-mullet': ['dev-pit', 'office-hallway'],
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
    // #135 Q9: the design's '6 FURNITURE SLOTS', updated to the 11 slots.
    expect(getRoomDefinition('igloo')).toMatchObject({
      title: 'YOUR IGLOO',
      subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 11 FURNITURE SLOTS',
    });
    // #51 D1: the design banner's "CONFERENCE · 604 SF · GLASS WALL ·
    // KICKOFF IN 04:32", minus its fabricated live countdown.
    expect(getRoomDefinition('the-icebox')).toMatchObject({
      title: 'THE ICEBOX',
      subtitle: 'CONFERENCE · 604 SF · GLASS WALL',
    });
    // #51: each banner minus its fabricated live figures (headcounts, the
    // training progress, the stall occupancy) and, for the Bathroom, the
    // "SNOWBALLS DISABLED" rule this build doesn't implement.
    expect(getRoomDefinition('office-hallway')).toMatchObject({
      title: 'THE HALLWAY',
      subtitle: 'OFFICES 1–9 · KNOCK BEFORE YOU WADDLE',
    });
    expect(getRoomDefinition('team-room-1')).toMatchObject({
      title: 'TEAM ROOM 1',
      subtitle: 'TEAM RM 1 · 337 SF · 2 GPU RACKS',
    });
    expect(getRoomDefinition('team-room-2')).toMatchObject({
      title: 'TEAM ROOM 2',
      subtitle: 'TEAM RM 2 · 292 SF · STICKY WALL · CRIT AT 3PM',
    });
    expect(getRoomDefinition('team-room-3')).toMatchObject({
      title: 'TEAM ROOM 3',
      subtitle: 'TEAM RM 3 · 287 SF · LIGHTS LOW · 4 DASHBOARDS',
    });
    expect(getRoomDefinition('team-room-4')).toMatchObject({
      title: 'TEAM ROOM 4',
      subtitle: 'TEAM RM 4 · 350 SF · 4 CORNER DESKS · COUCH · BEYSTADIUM',
    });
    expect(getRoomDefinition('bathroom')).toMatchObject({
      title: 'THE THAW ROOM',
      subtitle: 'BATHROOM · FLOOR 5',
    });
    // #51 slice 3: the banner's own subtitle, which carries no live figure.
    expect(getRoomDefinition('the-mullet')).toMatchObject({
      title: 'THE MULLET',
      subtitle: 'MEZZANINE · MS. PAC-MAN · TV LOUNGE · POOL · PING PONG · END OF THE GAME',
    });
  });
});
