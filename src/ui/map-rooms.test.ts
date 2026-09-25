import { describe, expect, it } from 'vitest';
import { ROOM_DEFINITIONS } from '../game/rooms/registry';
import { isMapTileClickable, MAP_ROOMS } from './map-rooms';

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
    const icebox = MAP_ROOMS.find((tile) => tile.number === '03')!;

    expect(isMapTileClickable(townCenter)).toBe(true);
    expect(isMapTileClickable(icebox)).toBe(false);
  });

  it('gives every registered RoomDefinition exactly one clickable Map tile', () => {
    for (const room of ROOM_DEFINITIONS) {
      const matches = MAP_ROOMS.filter((tile) => tile.roomId === room.id);
      expect(matches).toHaveLength(1);
      expect(isMapTileClickable(matches[0]!)).toBe(true);
    }
  });

  it('never names a roomId with no registered RoomDefinition', () => {
    // Every roomId this build's RoomId union can name already has a
    // RoomDefinition (#13's five prototype Rooms), so no tile should ever
    // resolve `isMapTileClickable` to false via a *missing* definition alone;
    // this pins that invariant rather than re-deriving it from `hasRoomDefinition`.
    const roomTiles = MAP_ROOMS.filter((tile) => tile.roomId !== null);
    for (const tile of roomTiles) {
      expect(isMapTileClickable(tile)).toBe(true);
    }
  });
});
