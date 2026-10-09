import type { FloorId } from '../game/rooms/floors';

/**
 * Test-only handle `main.ts` exposes as `window.__elevatorTest` under
 * `HOOKS_ENABLED` (#163). Its own file so e2e specs can mirror the type
 * without `import.meta.env`. It drives the real Elevator screen without a Room
 * change, because no real floor-L ride exists yet (L <-> 5 and L <-> R rides
 * are only reachable this way).
 */
export interface ElevatorTestHandle {
  /** Starts a ride between two floors, hiding at its end (`begin` plus an immediate `ready`). */
  ride(from: FloorId, to: FloorId): void;
  /** Stops the ride's clocks and shows the instant `elapsedMs` into it, every animation paused there. */
  freezeAt(elapsedMs: number): void;
  /** Hides the screen at once. */
  hide(): void;
}

declare global {
  interface Window {
    /** Test-only (#163); see `src/ui/elevator-test-handle.ts`. */
    __elevatorTest?: ElevatorTestHandle;
  }
}
