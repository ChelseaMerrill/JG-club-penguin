import {
  direction,
  FLOOR_ORDER,
  MS_PER_FLOOR,
  rideDurationMs,
  type FloorId,
} from '../game/rooms/floors';

/** One instant of an Elevator ride (#163): everything the screen shows is derived from this one clock. */
export interface RideState {
  direction: 'up' | 'down';
  /** The last floor reached: the indicator's `n`, ending on the destination. */
  passingFloor: FloorId;
  /** Whole percent complete, 0 to 100. */
  percent: number;
  /** Fraction complete, 0 to 1. */
  progress: number;
}

/**
 * The ride from `from` to `to` `elapsedMs` after it began (#163). The car
 * moves one floor every `msPerFloor`, so `passingFloor` steps from `from`
 * and reaches `to` at the end; `progress` is linear over the whole ride.
 */
export function rideStateAt(
  from: FloorId,
  to: FloorId,
  elapsedMs: number,
  msPerFloor = MS_PER_FLOOR,
): RideState {
  const dir = direction(from, to);
  const duration = rideDurationMs(from, to, msPerFloor);
  const crossed = duration / msPerFloor;
  const steps = Math.min(Math.floor(Math.max(elapsedMs, 0) / msPerFloor), crossed);
  const fromIndex = FLOOR_ORDER.indexOf(from);
  const passingFloor = FLOOR_ORDER[fromIndex + (dir === 'up' ? steps : -steps)]!;
  const progress = duration === 0 ? 1 : Math.min(Math.max(elapsedMs / duration, 0), 1);
  return { direction: dir, passingFloor, percent: Math.floor(progress * 100), progress };
}

export function goingText(dir: 'up' | 'down'): string {
  return dir === 'up' ? 'GOING UP' : 'GOING DOWN';
}

export function indicatorText(state: RideState): string {
  return `${state.direction === 'up' ? '▲' : '▼'} ${state.passingFloor}`;
}

export function nextText(to: FloorId): string {
  return `NEXT · ${to}`;
}

export function statusText(state: RideState): string {
  return `PASSING FLOOR ${state.passingFloor} · POLISHING THE ICE… ${state.percent}%`;
}
