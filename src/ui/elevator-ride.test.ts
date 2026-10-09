import { describe, expect, it } from 'vitest';
import type { FloorId } from '../game/rooms/floors';
import {
  goingText,
  indicatorText,
  nextText,
  rideStateAt,
  statusText,
  type RideState,
} from './elevator-ride';

describe('rideStateAt (#163)', () => {
  it.each<[FloorId, FloorId, number, FloorId, number]>([
    ['L', '5', 0, 'L', 0],
    ['L', '5', 1199, 'L', 19],
    ['L', '5', 1200, '1', 20],
    ['L', '5', 3840, '3', 64],
    ['L', '5', 6000, '5', 100],
    ['L', '5', 9000, '5', 100],
    ['5', 'R', 0, '5', 0],
    ['5', 'R', 1200, 'R', 100],
    ['R', '5', 600, 'R', 50],
    ['R', '5', 1200, '5', 100],
    ['R', 'L', 0, 'R', 0],
    ['R', 'L', 1200, '5', 16],
    ['R', 'L', 7200, 'L', 100],
  ])('%s -> %s at %ims passes %s at %i%%', (from, to, ms, floor, percent) => {
    const state = rideStateAt(from, to, ms);
    expect(state.passingFloor).toBe(floor);
    expect(state.percent).toBe(percent);
  });

  it('reproduces the design sample: L -> 5 at 3840ms reads 3, 64%, going up', () => {
    const state = rideStateAt('L', '5', 3840);
    expect(state).toEqual({ direction: 'up', passingFloor: '3', percent: 64, progress: 0.64 });
  });

  it('goes down for a descending ride', () => {
    expect(rideStateAt('R', 'L', 0).direction).toBe('down');
  });

  it('clamps negative elapsed time to the start', () => {
    expect(rideStateAt('L', '5', -50)).toMatchObject({ passingFloor: 'L', percent: 0 });
  });

  it('honours a custom ms per floor', () => {
    expect(rideStateAt('L', '5', 250, 100).passingFloor).toBe('2');
  });
});

describe('ride text (#163)', () => {
  const up: RideState = { direction: 'up', passingFloor: '3', percent: 64, progress: 0.64 };
  const down: RideState = { direction: 'down', passingFloor: 'R', percent: 0, progress: 0 };

  it('formats the going text', () => {
    expect(goingText('up')).toBe('GOING UP');
    expect(goingText('down')).toBe('GOING DOWN');
  });

  it('formats the indicator', () => {
    expect(indicatorText(up)).toBe('▲ 3');
    expect(indicatorText(down)).toBe('▼ R');
  });

  it('formats the next text', () => {
    expect(nextText('5')).toBe('NEXT · 5');
  });

  it('formats the status with a real ellipsis', () => {
    expect(statusText(up)).toBe('PASSING FLOOR 3 · POLISHING THE ICE… 64%');
  });
});
