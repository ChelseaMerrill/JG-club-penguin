import { describe, expect, it } from 'vitest';
import { ROOM_IDS } from '../../contracts';
import {
  direction,
  floorLabel,
  floorsBetween,
  floorsCrossed,
  floorsDiffer,
  FLOOR_ORDER,
  MS_PER_FLOOR,
  rideDurationMs,
  ROOM_FLOORS,
  type FloorId,
} from './floors';

describe('ROOM_FLOORS', () => {
  it('has an entry for every RoomId (#52 D2)', () => {
    for (const id of ROOM_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ROOM_FLOORS, id)).toBe(true);
    }
  });

  it('places Town Center, Dev Pit and The Melt on floor 5', () => {
    expect(ROOM_FLOORS['town-center']).toBe('5');
    expect(ROOM_FLOORS['dev-pit']).toBe('5');
    expect(ROOM_FLOORS['the-melt']).toBe('5');
  });

  it('places the Roof Deck on R, one above 5', () => {
    expect(ROOM_FLOORS['roof-deck']).toBe('R');
  });

  it('gives the Igloo no floor at all', () => {
    expect(ROOM_FLOORS.igloo).toBeNull();
  });

  it('puts each Stairwell floor on its own floor, floor 0 on the lobby (#51 slice 4)', () => {
    expect(
      (
        [
          'stairwell-0',
          'stairwell-1',
          'stairwell-2',
          'stairwell-3',
          'stairwell-4',
          'stairwell-5',
        ] as const
      ).map((id) => ROOM_FLOORS[id]),
    ).toEqual(['L', '1', '2', '3', '4', '5']);
  });
});

describe('FLOOR_ORDER', () => {
  it('runs lobby to roof, not alphabetically', () => {
    expect(FLOOR_ORDER).toEqual(['L', '1', '2', '3', '4', '5', 'R']);
  });
});

describe('floorsDiffer', () => {
  it('is false for the same floor', () => {
    expect(floorsDiffer('5', '5')).toBe(false);
  });

  it('is true for two different real floors', () => {
    expect(floorsDiffer('5', 'R')).toBe(true);
    expect(floorsDiffer('R', '5')).toBe(true);
  });

  it('is false whenever either side is null', () => {
    expect(floorsDiffer(null, '5')).toBe(false);
    expect(floorsDiffer('5', null)).toBe(false);
    expect(floorsDiffer(null, null)).toBe(false);
  });
});

describe('direction', () => {
  it('is up when the target floor sits higher', () => {
    expect(direction('5', 'R')).toBe('up');
    expect(direction('L', '1')).toBe('up');
  });

  it('is down when the target floor sits lower', () => {
    expect(direction('R', '5')).toBe('down');
    expect(direction('1', 'L')).toBe('down');
  });
});

describe('floorLabel', () => {
  it('names the Roof Deck "THE ROOF"', () => {
    expect(floorLabel('R')).toBe('THE ROOF');
  });

  it.each<FloorId>(['L', '1', '2', '3', '4', '5'])('names floor %s "FLOOR %s"', (floor) => {
    expect(floorLabel(floor)).toBe(`FLOOR ${floor}`);
  });
});

describe('ride length (#163)', () => {
  it('is 1.2s per floor', () => {
    expect(MS_PER_FLOOR).toBe(1200);
  });

  it.each<[FloorId, FloorId, number]>([
    ['5', 'R', 1],
    ['R', '5', 1],
    ['L', '5', 5],
    ['L', 'R', 6],
    ['R', 'L', 6],
  ])('crosses %s -> %s in %i floors', (from, to, crossed) => {
    expect(floorsCrossed(from, to)).toBe(crossed);
  });

  it.each<[FloorId, FloorId, number]>([
    ['5', 'R', 1200],
    ['R', '5', 1200],
    ['L', '5', 6000],
    ['L', 'R', 7200],
    ['R', 'L', 7200],
  ])('rides %s -> %s in %ims', (from, to, ms) => {
    expect(rideDurationMs(from, to)).toBe(ms);
  });

  it('takes a custom ms per floor', () => {
    expect(rideDurationMs('L', '5', 100)).toBe(500);
  });

  it('lists the floors strictly between, in travel order', () => {
    expect(floorsBetween('L', '5')).toEqual(['1', '2', '3', '4']);
    expect(floorsBetween('R', 'L')).toEqual(['5', '4', '3', '2', '1']);
    expect(floorsBetween('5', 'R')).toEqual([]);
    expect(floorsBetween('5', '5')).toEqual([]);
  });
});
