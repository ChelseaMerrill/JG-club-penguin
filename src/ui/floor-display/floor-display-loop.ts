/**
 * The Lobby elevator's decorative floor display (#169), ported from
 * `design/Room 00 JGHQ Lobby.dc.html`'s own `data-dc-script`: the car
 * drifts L to 5 and back, one floor a step.
 *
 * - The state starts at floor 0 (L), heading up, and the first step runs at
 *   once (the design's `componentDidMount`).
 * - Each step waits 700-1200 ms before the next.
 * - At an end (the next floor would leave 0-5), the direction flips with the
 *   floor unchanged, and the wait is a longer 1200-3800 ms pause instead.
 * - Otherwise there is a 15% chance of an extra 900-2100 ms wait.
 *
 * Pure: `random`, `schedule` and `cancel` are injected, so tests drive it
 * with a seeded random and fake timers.
 */

/** The top floor the display reaches (5, JG HQ). Floor 0 is L. */
export const TOP_FLOOR = 5;

export interface FloorDisplayState {
  /** 0 (L) to `TOP_FLOOR`. */
  floor: number;
  /** `1` heading up, `-1` heading down. */
  dir: 1 | -1;
}

/** The design's label: `▲ ` or `▼ ` and the floor, `L` for 0. */
export function floorDisplayLabel({ floor, dir }: FloorDisplayState): string {
  return `${dir > 0 ? '▲ ' : '▼ '}${floor === 0 ? 'L' : String(floor)}`;
}

/** One step of the design's `step()`: the next state and how long to wait before the step after it. */
export function stepFloorDisplay(
  state: FloorDisplayState,
  random: () => number,
): { state: FloorDisplayState; delayMs: number } {
  let delayMs = 700 + random() * 500;
  let floor = state.floor + state.dir;
  let dir = state.dir;
  if (floor > TOP_FLOOR || floor < 0) {
    dir = state.dir === 1 ? -1 : 1;
    floor = state.floor;
    delayMs = 1200 + random() * 2600;
  } else if (random() < 0.15) {
    delayMs += 900 + random() * 1200;
  }
  return { state: { floor, dir }, delayMs };
}

export interface FloorDisplayLoopDeps {
  /** Called with each new label, the first one at once on `start()`. */
  render: (label: string) => void;
  random?: () => number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface FloorDisplayLoop {
  /** Restarts from L heading up and steps at once (a no-op while running). */
  start(): void;
  /** Clears the pending step; `start()` begins again from L. */
  stop(): void;
  isRunning(): boolean;
}

export function createFloorDisplayLoop(deps: FloorDisplayLoopDeps): FloorDisplayLoop {
  const random = deps.random ?? Math.random;
  const schedule = deps.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel = deps.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let state: FloorDisplayState = { floor: 0, dir: 1 };
  let handle: unknown = null;
  let running = false;

  function step(): void {
    const next = stepFloorDisplay(state, random);
    state = next.state;
    deps.render(floorDisplayLabel(state));
    handle = schedule(step, next.delayMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      state = { floor: 0, dir: 1 };
      step();
    },
    stop() {
      if (!running) return;
      running = false;
      if (handle !== null) cancel(handle);
      handle = null;
    },
    isRunning: () => running,
  };
}
