import type { TypedEmitter } from '../contracts/emitter';
import type { GameEventMap, RoomId } from '../contracts';
import { planGuard, type RoomGuard } from './guard-placement';
import {
  msUntilWindowEnd,
  type GuardWindow,
  type PhishingAnswerResult,
  type PhishingChallenge,
  type PhishingChoice,
  type PhishingClient,
  type PhishingState,
} from './phishing-client';

/** A little past the window's end, so the server has moved on when we ask again. */
const WINDOW_END_MARGIN_MS = 250;

export interface PhishingControllerDeps {
  /** The signed-in Player's client (the real one, or the dev/e2e fake); `null` for none. */
  client: () => PhishingClient | null;
  /** `RoomScene.setGuard`. */
  scene: { setGuard(guard: RoomGuard | null): void };
  /** The Room the Player is in (the navigator's), `null` outside a Session. */
  currentRoomId: () => RoomId | null;
  hud: { setMapLocked(locked: boolean): void };
  /** The "Security Training is Required!" banner; `null` hides it. */
  banner: { render(state: PhishingState | null): void };
  /** Where `tokens:changed` and `badge:earned` go (the progress session's emitter). */
  emitter: TypedEmitter<GameEventMap>;
}

export interface PhishingController {
  /** Session start: loads the guard window and the Player's state from the server. */
  start(): Promise<void>;
  /** Session end: takes Anthony, the banner and the Map lock down. */
  stop(): void;
  /** Re-reads the guard window and state (on Room entry, and when the window ends). */
  refresh(): Promise<void>;
  /** A Room was entered: re-place Anthony for it, from a fresh read. */
  roomEntered(): void;
  /** For the quiz: starts a challenge. */
  startChallenge(): Promise<PhishingChallenge>;
  /** For the quiz: answers it and applies the server's result everywhere. */
  answer(challengeId: string, choice: PhishingChoice): Promise<PhishingAnswerResult>;
  /** The Player used the Map to leave `fromRoomId`; the server decides whether it counts. */
  mapUsed(fromRoomId: RoomId): Promise<void>;
  state(): PhishingState | null;
}

/**
 * Wires the Phishing Quiz (#146) into the Session: where Anthony stands
 * (`planGuard`, from the server's guard window and the Player's state), the
 * guarded door, the Map lock and the Security Training banner. Every rule
 * is the server's; this only reads its answers and applies them, and
 * re-reads when the guard window ends and on every Room entry.
 */
export function createPhishingController(deps: PhishingControllerDeps): PhishingController {
  let active = false;
  /** Bumped by `start`/`stop`, so a reply from an earlier Session is dropped. */
  let generation = 0;
  let window: GuardWindow | null = null;
  let state: PhishingState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function apply(): void {
    if (!active || !state) return;
    const roomId = deps.currentRoomId();
    deps.scene.setGuard(roomId ? planGuard(roomId, window, state) : null);
    deps.hud.setMapLocked(state.locked);
    deps.banner.render(state);
  }

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(next: GuardWindow): void {
    clearTimer();
    timer = setTimeout(() => void refresh(), msUntilWindowEnd(next) + WINDOW_END_MARGIN_MS);
  }

  async function refresh(): Promise<void> {
    const client = deps.client();
    if (!active || !client) return;
    const mine = generation;
    try {
      const [nextWindow, nextState] = await Promise.all([client.guardNow(), client.state()]);
      if (mine !== generation) return;
      window = nextWindow;
      state = nextState;
      schedule(nextWindow);
      apply();
    } catch (err) {
      console.error('[phishing] refresh failed', err);
    }
  }

  function applyState(next: PhishingState): void {
    state = {
      locked: next.locked,
      bypassCount: next.bypassCount,
      trainingCorrect: next.trainingCorrect,
      streak: next.streak,
      dailyCorrect: next.dailyCorrect,
      passedGuardWindow: next.passedGuardWindow,
    };
    apply();
  }

  function requireClient(): PhishingClient {
    const client = deps.client();
    if (!client) throw new Error('not_authenticated');
    return client;
  }

  return {
    async start() {
      generation += 1;
      active = true;
      await refresh();
    },

    stop() {
      generation += 1;
      active = false;
      clearTimer();
      window = null;
      state = null;
      deps.scene.setGuard(null);
      deps.hud.setMapLocked(false);
      deps.banner.render(null);
    },

    refresh,

    roomEntered() {
      // Re-placed straight away from what's known, then from a fresh read.
      apply();
      void refresh();
    },

    startChallenge() {
      return requireClient().startChallenge();
    },

    async answer(challengeId, choice) {
      const mine = generation;
      const result = await requireClient().answer(challengeId, choice);
      if (mine === generation && active) {
        deps.emitter.emit('tokens:changed', { balance: result.balance });
        for (const badgeId of result.badgesEarned) deps.emitter.emit('badge:earned', { badgeId });
        applyState(result);
      }
      return result;
    },

    async mapUsed(fromRoomId) {
      const client = deps.client();
      if (!active || !client) return;
      const mine = generation;
      try {
        const result = await client.recordMapBypass(fromRoomId);
        if (mine === generation) applyState(result);
      } catch (err) {
        console.error('[phishing] Map bypass record failed', err);
      }
    },

    state() {
      return state;
    },
  };
}
