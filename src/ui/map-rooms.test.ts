import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM_DEFINITIONS } from '../game/rooms/registry';
import { isMapTileClickable, MAP_ROOMS, type MapRoomTile } from './map-rooms';

/**
 * A made-up COMING SOON tile (#51): the real Map loses its `roomId: null`
 * tiles one by one as #51's Rooms land, so the "not clickable" branch is
 * pinned to this fixture instead of to any real design card.
 */
const COMING_SOON_TILE: MapRoomTile = {
  number: '99',
  label: '99 · TEST ROOM',
  subtitle: 'NOT A REAL CARD',
  roomId: null,
};

describe('MAP_ROOMS', () => {
  it('has the 14 design tiles, in the design document order', () => {
    expect(MAP_ROOMS.map((tile) => tile.number)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '15',
    ]);
  });

  it('keeps the design labels and subtitles verbatim', () => {
    const townCenter = MAP_ROOMS.find((tile) => tile.number === '01');
    expect(townCenter?.label).toBe('01 · TOWN CENTER');
    expect(townCenter?.subtitle).toBe('TOWN CENTER (LOBBY)');

    // Q6: the Map uses the design's own "THE KITCHEN" label even though the
    // underlying Room id/HUD title stay `the-melt`/"THE MELT" until #92.
    const kitchen = MAP_ROOMS.find((tile) => tile.number === '04');
    expect(kitchen?.label).toBe('04 · THE KITCHEN');
    expect(kitchen?.roomId).toBe('the-melt');

    const mullet = MAP_ROOMS.find((tile) => tile.number === '15');
    expect(mullet?.label).toBe('15 · THE MULLET');
    expect(mullet?.subtitle).toBe('MEZZANINE · AFTER-PARTY');
  });

  it('leaves out 05B and 14 ELEVATOR', () => {
    expect(MAP_ROOMS.some((tile) => tile.number === '05B')).toBe(false);
    expect(MAP_ROOMS.some((tile) => tile.number === '14')).toBe(false);
  });

  it('is clickable only when the tile names a RoomId with a registered RoomDefinition', () => {
    const townCenter = MAP_ROOMS.find((tile) => tile.number === '01')!;

    expect(isMapTileClickable(townCenter)).toBe(true);
    expect(isMapTileClickable(COMING_SOON_TILE)).toBe(false);
  });

  it('gives every registered RoomDefinition exactly one clickable Map tile', () => {
    for (const room of ROOM_DEFINITIONS) {
      const matches = MAP_ROOMS.filter((tile) => tile.roomId === room.id);
      expect(matches).toHaveLength(1);
      expect(isMapTileClickable(matches[0]!)).toBe(true);
    }
  });
});

describe('isMapTileClickable, with hasRoomDefinition mocked out (#33 review round 1 nit 8)', () => {
  afterEach(() => {
    vi.doUnmock('../game/rooms/registry');
    vi.resetModules();
  });

  it('is false for a tile naming a RoomId that has no registered RoomDefinition', async () => {
    // Every real RoomId currently has a RoomDefinition (#13's five prototype
    // Rooms), so exercising the `hasRoomDefinition === false` branch needs a
    // mock rather than a real gap in the registry. `resetModules` first, so
    // the dynamic import below re-resolves `./map-rooms` (and, through it,
    // the registry) against the mock instead of the file's already-cached,
    // real top-level import.
    vi.resetModules();
    vi.doMock('../game/rooms/registry', () => ({ hasRoomDefinition: () => false }));
    const { isMapTileClickable: isMapTileClickableWithMock, MAP_ROOMS: mockedMapRooms } =
      await import('./map-rooms');

    const townCenter = mockedMapRooms.find((tile) => tile.number === '01')!;

    expect(isMapTileClickableWithMock(townCenter)).toBe(false);
  });
});
