import type { RoomFade } from '../game/rooms/room-navigator';
import './door-ui.css';

/** The fade's CSS transition, either way (door-nav.js: `opacity 250ms ease`). */
export const DOOR_FADE_MS = 250;
/** How long `out()` waits before resolving: the transition plus a frame's margin (door-nav.js's 260 ms). */
export const DOOR_FADE_OUT_WAIT_MS = 260;
/**
 * RT170-24's failsafe: a fade still up this long after `out()` takes itself
 * down, whatever happened to the change that started it. Longer than any
 * Room load, shorter than a stuck screen anyone would sit through.
 */
export const DOOR_FADE_FAILSAFE_MS = 8000;

export type DoorFadeState = 'hidden' | 'fading-out' | 'opaque' | 'fading-in';

export interface DoorFadeTimers {
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface DoorFade extends RoomFade {
  state(): DoorFadeState;
  /** Whether it is up and swallowing pointer input (every state but `hidden` and `fading-in`). */
  isBlocking(): boolean;
  /** Its opacity right now, as computed (for the e2e debug hook). */
  opacity(): number;
  destroy(): void;
}

const DEFAULT_TIMERS: DoorFadeTimers = {
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The door fade (#170 D5, after `design/door-nav.js`): a full-Stage
 * `#0E1013` layer in `#ui` that fades in over 250 ms before a door's Room
 * change and back out once the new Room is ready. While it's up it takes
 * every pointer event (`pointer-events: auto`), so nothing on the Stage can
 * be clicked mid-fade (RT170-10). It sits under the Elevator screen, which
 * takes over from it on a floor crossing.
 *
 * Every `out()`, `clear()` and `cancel()` takes a new generation, so a timer
 * left over from an earlier fade (its `out()` resolving, its fade-in ending,
 * its failsafe) never touches a later one (RT170-24).
 */
export function createDoorFade(
  root: HTMLElement,
  timers: DoorFadeTimers = DEFAULT_TIMERS,
): DoorFade {
  const layer = document.createElement('div');
  layer.className = 'door-fade';
  layer.setAttribute('aria-hidden', 'true');
  root.append(layer);

  let state: DoorFadeState = 'hidden';
  let generation = 0;
  let stateTimer: unknown = null;
  let failsafeTimer: unknown = null;

  function clearTimers(): void {
    if (stateTimer !== null) timers.clearTimer(stateTimer);
    if (failsafeTimer !== null) timers.clearTimer(failsafeTimer);
    stateTimer = null;
    failsafeTimer = null;
  }

  function cancel(): void {
    generation += 1;
    clearTimers();
    state = 'hidden';
    // Straight to hidden, with no transition back.
    layer.style.transition = 'none';
    layer.classList.remove('door-fade--on');
    void layer.offsetWidth;
    layer.style.transition = '';
  }

  return {
    out() {
      generation += 1;
      const mine = generation;
      clearTimers();
      state = 'fading-out';
      layer.classList.add('door-fade--on');
      failsafeTimer = timers.setTimer(() => {
        failsafeTimer = null;
        if (mine === generation) cancel();
      }, DOOR_FADE_FAILSAFE_MS);
      // Never cleared: the caller's await always ends, and a superseded
      // caller then bails on its own token.
      return new Promise<void>((resolve) => {
        timers.setTimer(() => {
          if (mine === generation) state = 'opaque';
          resolve();
        }, DOOR_FADE_OUT_WAIT_MS);
      });
    },
    clear() {
      if (state === 'hidden' || state === 'fading-in') return;
      generation += 1;
      const mine = generation;
      clearTimers();
      state = 'fading-in';
      layer.classList.remove('door-fade--on');
      stateTimer = timers.setTimer(() => {
        stateTimer = null;
        if (mine === generation) state = 'hidden';
      }, DOOR_FADE_MS);
    },
    cancel,
    state: () => state,
    isBlocking: () => state === 'fading-out' || state === 'opaque',
    opacity: () => Number(getComputedStyle(layer).opacity),
    destroy() {
      cancel();
      layer.remove();
    },
  };
}
