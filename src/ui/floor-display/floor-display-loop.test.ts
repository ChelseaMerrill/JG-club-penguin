import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFloorDisplayLoop,
  floorDisplayLabel,
  stepFloorDisplay,
  TOP_FLOOR,
} from './floor-display-loop';

/** A deterministic random: each call returns the next value, cycling. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  };
}

/** A seeded linear congruential random in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('floorDisplayLabel', () => {
  it('shows ▲ heading up and ▼ heading down, with L for floor 0', () => {
    expect(floorDisplayLabel({ floor: 0, dir: 1 })).toBe('▲ L');
    expect(floorDisplayLabel({ floor: 3, dir: 1 })).toBe('▲ 3');
    expect(floorDisplayLabel({ floor: 5, dir: -1 })).toBe('▼ 5');
    expect(floorDisplayLabel({ floor: 0, dir: -1 })).toBe('▼ L');
  });
});

describe('stepFloorDisplay', () => {
  it('moves one floor in its direction, waiting 700-1200 ms', () => {
    // random() < 0.15 never fires here: 0.5 is the delay draw and the chance.
    expect(stepFloorDisplay({ floor: 2, dir: 1 }, () => 0.5)).toEqual({
      state: { floor: 3, dir: 1 },
      delayMs: 950,
    });
    expect(stepFloorDisplay({ floor: 2, dir: -1 }, () => 0.99).delayMs).toBeCloseTo(1195);
    expect(stepFloorDisplay({ floor: 2, dir: -1 }, sequence(0, 0.5)).delayMs).toBe(700);
  });

  it('flips at the top and at L with the floor unchanged, pausing 1200-3800 ms', () => {
    expect(stepFloorDisplay({ floor: TOP_FLOOR, dir: 1 }, () => 0)).toEqual({
      state: { floor: TOP_FLOOR, dir: -1 },
      delayMs: 1200,
    });
    const atL = stepFloorDisplay({ floor: 0, dir: -1 }, sequence(0.5, 1));
    expect(atL.state).toEqual({ floor: 0, dir: 1 });
    expect(atL.delayMs).toBe(1200 + 2600);
  });

  it('adds an extra 900-2100 ms 15% of the time', () => {
    // Draws: the base delay, the 15% chance, then the extra.
    expect(stepFloorDisplay({ floor: 1, dir: 1 }, sequence(0, 0.1, 0)).delayMs).toBe(700 + 900);
    expect(stepFloorDisplay({ floor: 1, dir: 1 }, sequence(0, 0.14, 1)).delayMs).toBe(700 + 2100);
    expect(stepFloorDisplay({ floor: 1, dir: 1 }, sequence(0, 0.15, 1)).delayMs).toBe(700);
  });
});

describe('createFloorDisplayLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps at once on start, as the design does on mount: L heading up becomes ▲ 1', () => {
    const labels: string[] = [];
    const loop = createFloorDisplayLoop({
      render: (label) => labels.push(label),
      random: () => 0.5,
    });

    loop.start();

    expect(labels).toEqual(['▲ 1']);
    expect(loop.isRunning()).toBe(true);
  });

  it('runs L up to 5, flips, and comes back down to L', () => {
    const labels: string[] = [];
    const loop = createFloorDisplayLoop({
      render: (label) => labels.push(label),
      random: () => 0.5,
    });

    loop.start();
    for (let i = 0; i < 11; i += 1) vi.advanceTimersToNextTimer();

    expect(labels).toEqual([
      '▲ 1',
      '▲ 2',
      '▲ 3',
      '▲ 4',
      '▲ 5',
      '▼ 5',
      '▼ 4',
      '▼ 3',
      '▼ 2',
      '▼ 1',
      '▼ L',
      '▲ L',
    ]);
  });

  it('stays within L-5 and only ever shows the design labels, on a seeded random', () => {
    const labels: string[] = [];
    const loop = createFloorDisplayLoop({
      render: (label) => labels.push(label),
      random: seeded(169),
    });

    loop.start();
    vi.advanceTimersByTime(5 * 60_000);

    expect(labels.length).toBeGreaterThan(100);
    for (const label of labels) expect(label).toMatch(/^[▲▼] (L|[1-5])$/);
    expect(new Set(labels).size).toBe(12);
  });

  it('waits each step out before the next one', () => {
    const labels: string[] = [];
    const loop = createFloorDisplayLoop({
      render: (label) => labels.push(label),
      random: () => 0.5,
    });

    loop.start();
    vi.advanceTimersByTime(949);
    expect(labels).toEqual(['▲ 1']);
    vi.advanceTimersByTime(1);
    expect(labels).toEqual(['▲ 1', '▲ 2']);
  });

  it('stop clears the pending step, and start begins again from L', () => {
    const labels: string[] = [];
    const loop = createFloorDisplayLoop({
      render: (label) => labels.push(label),
      random: () => 0.5,
    });

    loop.start();
    vi.advanceTimersToNextTimer();
    loop.stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(loop.isRunning()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(labels).toEqual(['▲ 1', '▲ 2']);

    loop.start();
    expect(labels).toEqual(['▲ 1', '▲ 2', '▲ 1']);
  });

  it('is a no-op to start twice: one timer at a time', () => {
    const loop = createFloorDisplayLoop({ render: () => {}, random: () => 0.5 });

    loop.start();
    loop.start();

    expect(vi.getTimerCount()).toBe(1);
  });

  it('uses the injected schedule and cancel', () => {
    const schedule = vi.fn(() => 'handle');
    const cancel = vi.fn();
    const loop = createFloorDisplayLoop({ render: () => {}, random: () => 0.5, schedule, cancel });

    loop.start();
    loop.stop();

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 950);
    expect(cancel).toHaveBeenCalledWith('handle');
  });
});
