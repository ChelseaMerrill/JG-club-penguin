import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomId } from '../../contracts';
import { createInMemoryProgressStoreWithControls } from '../../persistence/in-memory-progress-store';
import type { StairFlightResult } from '../../persistence/progress-store';
import { stairPanelState, type StairPanelInput } from '../../ui/stair-climb-panel';
import { createStairClimbTracker, type StairClimbTrackerDeps } from './stair-climb-tracker';
import type { RoomChangeSource } from './stairwell';

interface Harness {
  tracker: ReturnType<typeof createStairClimbTracker>;
  store: StairClimbTrackerDeps['store'];
  calls: string[];
  panels: Array<{ roomId: RoomId; input: StairPanelInput }>;
  errors: unknown[];
  room: { id: RoomId | null };
  /** A Room change from `source` (null: untagged), as the navigator emits it. */
  move(to: RoomId, source: RoomChangeSource | null): void;
}

/**
 * The tracker against the in-memory store on fake timers (`Date.now` is
 * faked too, so the store's 2 s pacing rule follows them), recording every
 * store call and panel update.
 */
function setup(store?: StairClimbTrackerDeps['store']): Harness {
  const real = createInMemoryProgressStoreWithControls().store;
  const target = store ?? real;
  const calls: string[] = [];
  const recorded: StairClimbTrackerDeps['store'] = {
    logStairFlight: (floor) => {
      calls.push(`log ${floor}`);
      return target.logStairFlight(floor);
    },
    getStairClimb: () => {
      calls.push('read');
      return target.getStairClimb();
    },
  };
  const harness = {
    store: target,
    calls,
    panels: [],
    errors: [],
    room: { id: 'town-center' },
  } as unknown as Harness;
  harness.tracker = createStairClimbTracker({
    store: recorded,
    currentRoomId: () => harness.room.id,
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    onPanel: (roomId, input) => harness.panels.push({ roomId, input }),
    onError: (err) => harness.errors.push(err),
  });
  harness.move = (to, source) => {
    const change = () => {
      if (harness.room.id) harness.tracker.roomLeave(harness.room.id);
    };
    if (source) harness.tracker.withSource(source, change);
    else change();
    harness.room.id = to;
    harness.tracker.roomEnter(to);
  };
  return harness;
}

/** Lets every queued call (and its timers) finish. */
async function settle(h: Harness): Promise<void> {
  for (let i = 0; i < 20; i += 1) await vi.advanceTimersByTimeAsync(1000);
  await h.tracker.idle();
}

const lastPanel = (h: Harness) => h.panels.at(-1)?.input;

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-09-30T16:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createStairClimbTracker (#51 slice 4)', () => {
  it('starts on a Map arrival at floor 0 and logs each flight climbed by door or key', async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await settle(h);
    expect(h.tracker.isArmed()).toBe(true);
    expect(lastPanel(h)).toMatchObject({ floor: 0, armed: true, arrival: { flightsLogged: 0 } });

    for (const [floor, source] of [
      [1, 'keys'],
      [2, 'door'],
      [3, 'keys'],
      [4, 'door'],
      [5, 'door'],
    ] as const) {
      h.move(`stairwell-${floor}`, source);
      await settle(h);
    }

    expect(h.calls).toEqual(['log 0', 'log 1', 'log 2', 'log 3', 'log 4', 'log 5']);
    expect(lastPanel(h)).toMatchObject({
      floor: 5,
      arrival: { logged: true, flightsLogged: 5, badgesEarned: ['stair-master'] },
    });
  });

  it("never finishes an earlier visit's climb from floor 5 down (RT2-1): nothing is sent, the panel says not started", async () => {
    // A climb left at floor 2 on an earlier visit.
    const { store } = createInMemoryProgressStoreWithControls({ now: () => Date.now() });
    await store.logStairFlight(0);
    for (const floor of [1, 2]) {
      vi.advanceTimersByTime(3000);
      await store.logStairFlight(floor);
    }
    const h = setup(store);

    h.move('stairwell-5', 'door');
    for (const floor of [4, 3, 2] as const) h.move(`stairwell-${floor}`, 'door');
    h.move('stairwell-3', 'keys');
    await settle(h);

    expect(h.tracker.isArmed()).toBe(false);
    expect(h.calls.filter((call) => call.startsWith('log'))).toEqual([]);
    expect(lastPanel(h)).toMatchObject({ floor: 3, armed: false, arrival: null });
    expect((await store.getStairClimb()).flightsLogged).toBe(2);
  });

  it('logs nothing for an arrival on floor 5 from Town Center, a descent, or a Map hop above floor 0', async () => {
    const h = setup();
    h.move('stairwell-5', 'door');
    h.move('stairwell-4', 'keys');
    h.move('stairwell-2', 'map');
    await settle(h);

    expect(h.calls).toEqual(['read', 'read', 'read']);
  });

  it('disarms on leaving the Stairwell, so climbing again needs a new start', async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await settle(h);
    h.move('stairwell-1', 'door');
    await settle(h);
    h.move('town-center', 'map');
    expect(h.tracker.isArmed()).toBe(false);

    h.move('stairwell-5', 'door');
    h.move('stairwell-4', 'door');
    await settle(h);
    expect(h.calls).toEqual(['log 0', 'log 1', 'read', 'read']);
  });

  it("doesn't let a change the navigator dropped tag the next one (RT2-7)", async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await settle(h);
    // A door change dropped mid-transition: no room:leave, so nothing is recorded.
    h.tracker.withSource('door', () => undefined);
    // The next change, untagged (a spawn-like change), climbs nothing.
    h.move('stairwell-1', null);
    await settle(h);

    expect(h.calls).toEqual(['log 0', 'read']);
  });

  it('sends flights in order: a flight waits for the start still in flight (RT2-2)', async () => {
    const real = createInMemoryProgressStoreWithControls({ now: () => Date.now() }).store;
    let releaseStart!: () => void;
    const slowStart = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const store: StairClimbTrackerDeps['store'] = {
      logStairFlight: async (floor) => {
        if (floor === 0) await slowStart;
        return real.logStairFlight(floor);
      },
      getStairClimb: () => real.getStairClimb(),
    };
    const h = setup(store);

    h.move('stairwell-0', 'map');
    vi.advanceTimersByTime(3000);
    h.move('stairwell-1', 'keys');
    await vi.advanceTimersByTimeAsync(100);
    expect(h.calls).toEqual(['log 0']);

    releaseStart();
    await settle(h);
    // Flight 1 reached the server only after the start had logged (straight
    // after it, so too soon, then retried).
    expect(h.calls).toEqual(['log 0', 'log 1', 'log 1']);
    expect(lastPanel(h)).toMatchObject({ floor: 1, arrival: { logged: true, flightsLogged: 1 } });
  });

  it('retries a too-soon flight once the 2 s have passed, even after the Player has climbed on (N5, RT2-2)', async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await vi.advanceTimersByTimeAsync(0);
    await h.tracker.idle();
    // Straight up two floors, both inside 2 s of the start.
    h.move('stairwell-1', 'keys');
    h.move('stairwell-2', 'door');
    await settle(h);

    // Each flight came too soon after the one before, so each was retried
    // once, in order.
    expect(h.calls).toEqual(['log 0', 'log 1', 'log 1', 'log 2', 'log 2']);
    const results = h.panels.map((panel) => panel.input.arrival as StairFlightResult | null);
    expect(results.at(-1)).toMatchObject({ logged: true, flightsLogged: 2 });
    // Floor 1's own result came back after the Player had left it: no panel for it.
    expect(h.panels.map((panel) => panel.roomId)).toEqual(['stairwell-0', 'stairwell-2']);
  });

  it("lets a flight's pending retry finish after the Player leaves the Stairwell, with no panel for it", async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await vi.advanceTimersByTimeAsync(0);
    await h.tracker.idle();
    h.move('stairwell-1', 'keys');
    await vi.advanceTimersByTimeAsync(0);
    h.move('town-center', 'map');
    await settle(h);

    expect(h.calls).toEqual(['log 0', 'log 1', 'log 1']);
    expect((await h.store.getStairClimb()).flightsLogged).toBe(1);
    expect(h.panels.map((panel) => panel.roomId)).toEqual(['stairwell-0']);
  });

  it('never loses flight 5 to a quick ↑ from floor 5 to the Roof Deck (Stair Master still earned)', async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    for (const floor of [1, 2, 3, 4] as const) {
      await settle(h);
      h.move(`stairwell-${floor}`, 'keys');
    }
    await vi.advanceTimersByTimeAsync(0);
    await h.tracker.idle();
    // Flight 5 lands inside 2 s of flight 4, so it comes back too soon, and
    // the Player is already on the Roof Deck when its retry is due.
    h.move('stairwell-5', 'keys');
    await vi.advanceTimersByTimeAsync(0);
    h.move('roof-deck', 'keys');
    await settle(h);

    expect(h.calls.slice(-2)).toEqual(['log 5', 'log 5']);
    expect(await h.store.getStairClimb()).toMatchObject({ flightsLogged: 5, completed: true });
  });

  it('drops a read still queued when the Player leaves the Stairwell', async () => {
    const real = createInMemoryProgressStoreWithControls({ now: () => Date.now() }).store;
    let releaseStart!: () => void;
    const slowStart = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const h = setup({
      logStairFlight: async (floor) => {
        if (floor === 0) await slowStart;
        return real.logStairFlight(floor);
      },
      getStairClimb: () => real.getStairClimb(),
    });
    h.move('stairwell-0', 'map');
    // Down to floor 0's walk-in: a descent reads, queued behind the start.
    h.move('stairwell-1', null);
    h.move('town-center', 'map');
    releaseStart();
    await settle(h);

    expect(h.calls).toEqual(['log 0']);
  });

  it('forgets everything on reset (sign-out, N7)', async () => {
    const h = setup();
    h.move('stairwell-0', 'map');
    await settle(h);
    h.tracker.withSource('door', () => h.tracker.roomLeave('stairwell-0'));
    h.tracker.reset();

    expect(h.tracker.isArmed()).toBe(false);
    h.room.id = 'stairwell-1';
    h.tracker.roomEnter('stairwell-1');
    await settle(h);
    expect(h.calls).toEqual(['log 0', 'read']);
  });

  it("degrades on a failed call: the error is reported and the panel shows the design's climbing line without the count (S4-D9)", async () => {
    const store: StairClimbTrackerDeps['store'] = {
      logStairFlight: () => Promise.reject(new Error('Could not find the function')),
      getStairClimb: () => Promise.reject(new Error('Could not find the function')),
    };
    const h = setup(store);

    h.move('stairwell-0', 'map');
    await settle(h);
    // A thrown start isn't the server saying no: the visit stays armed.
    expect(h.tracker.isArmed()).toBe(true);
    expect(lastPanel(h)).toEqual({ floor: 0, armed: true, progress: null, arrival: null });
    expect(stairPanelState(lastPanel(h)!)).toMatchObject({
      state: 'climbing',
      heading: 'STAIRS CHALLENGE · FLIGHT 1 OF 5',
      lines: [],
    });

    h.move('stairwell-1', 'door');
    await settle(h);
    expect(h.errors).toHaveLength(2);
    expect(stairPanelState(lastPanel(h)!)).toMatchObject({
      state: 'climbing',
      heading: 'STAIRS CHALLENGE · FLIGHT 2 OF 5',
      lines: [],
    });
  });

  it('disarms only when the server answers that a start did not log', async () => {
    const real = createInMemoryProgressStoreWithControls({ now: () => Date.now() }).store;
    const h = setup({
      logStairFlight: async (floor) =>
        floor === 0
          ? {
              logged: false,
              reason: 'not_started',
              flightsLogged: 0,
              tokensAwarded: 0,
              flightTokensToday: 0,
              badgesEarned: [],
              balance: 100,
            }
          : real.logStairFlight(floor),
      getStairClimb: () => real.getStairClimb(),
    });
    h.move('stairwell-0', 'map');
    h.move('stairwell-1', 'door');
    await settle(h);

    expect(h.tracker.isArmed()).toBe(false);
    expect(h.calls).toEqual(['log 0', 'read']);
  });
});
