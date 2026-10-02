import type { RoomId } from '../../contracts';
import type {
  ProgressStore,
  StairClimbProgress,
  StairFlightResult,
} from '../../persistence/progress-store';
import { STAIR_FLIGHT_MIN_INTERVAL_MS } from '../../persistence/stair-climb-rules';
import type { StairPanelInput } from '../../ui/stair-climb-panel';
import { flightFor, isStairwellRoom, stairwellFloorOf, type RoomChangeSource } from './stairwell';

/** Slack on top of the 2 s pacing rule before a `too_soon` flight is retried. */
export const STAIR_RETRY_MARGIN_MS = 150;

export interface StairClimbTrackerDeps {
  store: Pick<ProgressStore, 'logStairFlight' | 'getStairClimb'>;
  currentRoomId(): RoomId | null;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  /** Shows the climb panel for `roomId` (only called while it's still the current Room). */
  onPanel(roomId: RoomId, input: StairPanelInput): void;
  /** A store call failed; the climb goes on without it (S4-D9's degrade rule). */
  onError(err: unknown): void;
}

export interface StairClimbTracker {
  /**
   * Runs `change` (a synchronous `changeRoom`/`useDoor` call) as a Room change
   * from `source` (RT2-7): its `room:leave` records the source, and the source
   * is cleared again once `change` returns, so a change the navigator drops
   * never tags the next one.
   */
  withSource<T>(source: RoomChangeSource, change: () => T): T;
  /** `room:leave`: remembers the Room left and the source of the change. */
  roomLeave(roomId: RoomId): void;
  /** `room:enter`: logs the flight this arrival climbed, if any, else reads the climb. */
  roomEnter(roomId: RoomId): void;
  /** Sign-out (or `bindPlayer(null)`): forgets everything and drops every queued call (N7). */
  reset(): void;
  /** Whether this Stairwell visit started a climb (RT2-1). */
  isArmed(): boolean;
  /** Resolves once every queued store call has finished (tests). */
  idle(): Promise<void>;
}

/**
 * The client half of the Stairs Challenge (#51 slice 4, S4-D2 as amended,
 * RT2-1, RT2-2, RT2-7, N5, N7):
 * - each Room change is tagged with its source (door, keys, Map or spawn),
 *   and `flightFor` decides which flight an arrival climbed;
 * - a floor-0 start arms this visit; leaving the Stairwell or signing out
 *   disarms it, and flights 1-5 are sent only while armed, so a climb left
 *   half-done on an earlier visit can't be finished from floor 5 down;
 * - every store call goes through one FIFO queue, each waiting for the last
 *   one's final result, so flights reach the server in order;
 * - a `too_soon` flight is retried once, when the 2 s have passed, whatever
 *   floor the Player has reached by then, even past the Stairwell (a quick
 *   ↑ from floor 5 to the Roof Deck never costs flight 5);
 * - leaving the Stairwell drops only queued reads; signing out drops every
 *   queued call;
 * - a call that fails (an unapplied migration, a network blip) changes
 *   nothing: the panel shows the design's climbing line without the count
 *   (S4-D9), and only the server answering that a start didn't log disarms.
 * Every other Stairwell arrival reads the climb for the panel instead. Room
 * movement never waits on any of it.
 */
export function createStairClimbTracker(deps: StairClimbTrackerDeps): StairClimbTracker {
  let source: RoomChangeSource | null = null;
  let pending: { leaving: RoomId; source: RoomChangeSource } | null = null;
  let armed = false;
  /** Bumped to drop every queued call (sign-out). */
  let generation = 0;
  /** Bumped to drop queued reads (leaving the Stairwell, sign-out). */
  let readGeneration = 0;
  /** This Stairwell visit, bumped on leaving it, so a visit's flights know their own start. */
  let visit = 0;
  /** A visit whose floor-0 start the server answered without logging. */
  let rejectedVisit: number | null = null;
  let tail: Promise<void> = Promise.resolve();
  /** When the last flight the server logged came back, for the retry delay. */
  let lastLoggedAt: number | null = null;

  function enqueue(job: () => Promise<void>, isCurrent: () => boolean): void {
    tail = tail
      .then(() => (isCurrent() ? job() : undefined))
      .catch((err: unknown) => deps.onError(err));
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      deps.setTimer(resolve, ms);
    });
  }

  function render(roomId: RoomId, input: Omit<StairPanelInput, 'floor' | 'armed'>): void {
    const floor = stairwellFloorOf(roomId);
    if (floor === null || deps.currentRoomId() !== roomId) return;
    deps.onPanel(roomId, { floor, armed, ...input });
  }

  async function readClimb(roomId: RoomId, isCurrent: () => boolean): Promise<void> {
    let progress: StairClimbProgress | null = null;
    try {
      progress = await deps.store.getStairClimb();
    } catch (err) {
      deps.onError(err);
    }
    if (isCurrent()) render(roomId, { progress, arrival: null });
  }

  async function logFlight(
    roomId: RoomId,
    floor: number,
    gen: number,
    ofVisit: number,
  ): Promise<void> {
    const live = () => gen === generation;
    // This visit's floor-0 start didn't log: read the climb for the panel instead.
    if (floor > 0 && rejectedVisit === ofVisit) return readClimb(roomId, live);
    let result: StairFlightResult;
    try {
      result = await deps.store.logStairFlight(floor);
      if (result.reason === 'too_soon' && live()) {
        const since = lastLoggedAt ?? deps.now();
        await wait(
          Math.max(0, since + STAIR_FLIGHT_MIN_INTERVAL_MS - deps.now()) + STAIR_RETRY_MARGIN_MS,
        );
        if (!live()) return;
        result = await deps.store.logStairFlight(floor);
      }
    } catch (err) {
      deps.onError(err);
      if (live()) render(roomId, { progress: null, arrival: null });
      return;
    }
    if (!live()) return;
    if (result.logged) lastLoggedAt = deps.now();
    if (floor === 0 && !result.logged) {
      rejectedVisit = ofVisit;
      if (ofVisit === visit) armed = false;
    }
    render(roomId, { progress: null, arrival: result });
  }

  /** Leaving the Stairwell: disarms and drops queued reads, but lets queued flights finish. */
  function leaveStairwell(): void {
    armed = false;
    visit += 1;
    readGeneration += 1;
  }

  return {
    withSource(changeSource, change) {
      source = changeSource;
      try {
        return change();
      } finally {
        source = null;
      }
    },
    roomLeave(roomId) {
      pending = { leaving: roomId, source: source ?? 'spawn' };
    },
    roomEnter(roomId) {
      const change = pending;
      pending = null;
      if (!isStairwellRoom(roomId)) {
        leaveStairwell();
        return;
      }
      const flight = flightFor(change?.leaving ?? null, roomId, change?.source ?? 'spawn');
      if (flight === 0) armed = true;
      const gen = generation;
      if (flight !== null && (flight === 0 || armed)) {
        const ofVisit = visit;
        enqueue(
          () => logFlight(roomId, flight, gen, ofVisit),
          () => gen === generation,
        );
      } else {
        const readGen = readGeneration;
        const isCurrent = () => gen === generation && readGen === readGeneration;
        enqueue(() => readClimb(roomId, isCurrent), isCurrent);
      }
    },
    reset() {
      source = null;
      pending = null;
      lastLoggedAt = null;
      leaveStairwell();
      generation += 1;
    },
    isArmed: () => armed,
    idle: () => tail,
  };
}
