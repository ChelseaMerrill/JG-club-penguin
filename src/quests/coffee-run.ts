import type { TypedEmitter } from '../contracts/emitter';
import type { GameEventMap } from '../contracts/game-events';
import {
  ProgressStoreError,
  type CoffeeRun,
  type ProgressStore,
} from '../persistence/progress-store';

/**
 * The Player's side of "Bring Nicole a coffee before kickoff" (#141): starts
 * the run when Nicole gives the Quest, marks the Kitchen visit on
 * `room:enter`, asks Tom for the cup, delivers it when the Player talks to
 * Nicole, and runs the 1:00 countdown the HUD widget shows and the cup in
 * the Penguin's flipper follows. The countdown is display only: the server
 * (20261006020000_quest_nicole_coffee.sql) keeps its own time and refuses a
 * late delivery whatever this says. Every step re-reads Quest progress, so
 * the step toasts, the QUEST COMPLETE banner and the 75-Token claim come
 * from the quest controller as for every other steps Quest.
 */

/** The ticket's copy when the countdown reaches 0:00. */
export const COFFEE_COLD_MESSAGE = 'Your coffee went cold.';

/** Nicole's line when she gives the Quest (the ticket's step 1). */
export const NICOLE_COFFEE_LINE = 'Client call in five. I need an oat latte.';

/** Tom's dialog option for the cup (the ticket's step 3), shown next to Coffee Rush. */
export const TOM_COFFEE_ACTION_LABEL = "Nicole's oat latte, please";

/** How often the countdown re-renders while a cup is carried. */
export const COFFEE_TICK_MS = 250;

/** "mm:ss" for the widget, rounded up so 0:00 shows only once the cup is cold. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export interface CoffeeRunView {
  talkedToNicole: boolean;
  kitchenVisited: boolean;
  delivered: boolean;
  /** A hot cup is in the Penguin's flipper. */
  carrying: boolean;
  /** Seconds left on the countdown while carrying, else `null`. */
  secondsLeft: number | null;
}

export interface CoffeeRunSchedule {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface CoffeeRunControllerDeps {
  store: Pick<
    ProgressStore,
    'coffeeRun' | 'talkToNicole' | 'markKitchenVisited' | 'askTomForCoffee' | 'deliverCoffee'
  >;
  events: TypedEmitter<GameEventMap>;
  /** Re-reads Quest progress (the quest controller's `refresh`). */
  refreshQuests: () => void;
  /** Defaults to `Date.now`. */
  now?: () => number;
  /** Defaults to `window.setInterval`/`clearInterval`. */
  schedule?: CoffeeRunSchedule;
}

export interface CoffeeRunController {
  /** Loads the Player's run for a new Session (resuming a carried cup). */
  start(): Promise<void>;
  /** Ends it: forgets the run, stops the countdown and ignores events. */
  stop(): void;
  /** Nicole gives the Quest (step 1). Never rejects. */
  talkToNicole(): Promise<void>;
  /** Tom hands over a cup (step 3). Never rejects. */
  askTom(): Promise<void>;
  /** Whether Tom's "Nicole's coffee" option should show: talked to Nicole, not delivered, no hot cup. */
  canAskTom(): boolean;
  /** `null` outside a Session or before the first load. */
  view(): CoffeeRunView | null;
  onChange(listener: (view: CoffeeRunView) => void): () => void;
}

const DEFAULT_SCHEDULE: CoffeeRunSchedule = {
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
};

export function createCoffeeRunController(deps: CoffeeRunControllerDeps): CoffeeRunController {
  const { store, events, refreshQuests } = deps;
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? DEFAULT_SCHEDULE;

  let active = false;
  let generation = 0;
  let run: CoffeeRun | null = null;
  /** When the carried cup goes cold on this clock, or `null`. */
  let deadlineMs: number | null = null;
  let ticker: unknown = null;
  let kitchenRequested = false;
  let deliveryRequested = false;
  const listeners = new Set<(view: CoffeeRunView) => void>();

  function currentView(): CoffeeRunView | null {
    if (!active || run === null) return null;
    const carrying = deadlineMs !== null;
    return {
      talkedToNicole: run.talkedToNicole,
      kitchenVisited: run.kitchenVisited,
      delivered: run.delivered,
      carrying,
      secondsLeft: deadlineMs === null ? null : Math.max(0, (deadlineMs - now()) / 1000),
    };
  }

  function notify(): void {
    const view = currentView();
    if (!view) return;
    for (const listener of Array.from(listeners)) listener(view);
  }

  function stopTicker(): void {
    if (ticker !== null) schedule.clearInterval(ticker);
    ticker = null;
  }

  /** Drops the carried cup locally (the server already reads steps 3-5 as reset). */
  function dropCup(): void {
    deadlineMs = null;
    stopTicker();
    if (run) run = { ...run, handedOverAt: null, secondsLeft: null };
  }

  function tick(): void {
    if (deadlineMs !== null && now() >= deadlineMs) {
      dropCup();
      events.emit('ui:toast', { message: COFFEE_COLD_MESSAGE });
      refreshQuests();
    }
    notify();
  }

  /** Takes the server's run as the truth; the countdown starts from its `secondsLeft`. */
  function apply(next: CoffeeRun): void {
    run = next;
    if (next.secondsLeft === null) {
      dropCup();
    } else {
      deadlineMs = now() + next.secondsLeft * 1000;
      if (ticker === null) ticker = schedule.setInterval(tick, COFFEE_TICK_MS);
    }
    notify();
  }

  /** Runs one store write for the current Session; a failure is left to the store's own toast. */
  async function write(call: () => Promise<CoffeeRun>): Promise<void> {
    if (!active) return;
    const myGeneration = generation;
    try {
      const next = await call();
      if (myGeneration !== generation) return;
      apply(next);
      refreshQuests();
    } catch (err) {
      if (myGeneration !== generation) return;
      if (err instanceof ProgressStoreError && err.code === 'coffee_cold') {
        dropCup();
        notify();
        refreshQuests();
      }
    }
  }

  events.on('room:enter', ({ roomId }) => {
    if (!active || roomId !== 'the-melt' || kitchenRequested) return;
    if (!run?.talkedToNicole || run.kitchenVisited || run.delivered) return;
    kitchenRequested = true;
    void write(() => store.markKitchenVisited()).finally(() => {
      kitchenRequested = false;
    });
  });

  events.on('npc:talked', ({ npcId }) => {
    if (!active || npcId !== 'nicole' || deadlineMs === null || deliveryRequested) return;
    deliveryRequested = true;
    void write(() => store.deliverCoffee()).finally(() => {
      deliveryRequested = false;
    });
  });

  return {
    async start() {
      generation += 1;
      active = true;
      run = null;
      dropCup();
      const myGeneration = generation;
      try {
        const loaded = await store.coffeeRun();
        if (myGeneration !== generation) return;
        apply(loaded);
      } catch {
        // A failed read leaves the run unknown; Nicole can start it again.
      }
    },
    stop() {
      generation += 1;
      active = false;
      run = null;
      dropCup();
    },
    talkToNicole: () => write(() => store.talkToNicole()),
    askTom: () => write(() => store.askTomForCoffee()),
    canAskTom() {
      return active && run !== null && run.talkedToNicole && !run.delivered && deadlineMs === null;
    },
    view: currentView,
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
