import type { RoomId } from '../../contracts';
import type { RoomDoor } from './room-definition';
import { isStairwellRoom } from './stairwell';

/** How long ↑ or ↓ must be held before it climbs or descends a flight (S4-D10). */
export const STAIR_HOLD_MS = 800;

/**
 * The least time between two flights while a key stays held: the server's
 * own `too_soon` floor (S4-D10, SC9), mirrored so a held key never asks too
 * soon.
 */
export const STAIR_CHAIN_MIN_MS = 2000;

/**
 * How often a hold that came due mid-transition checks again. The Elevator
 * can stay up for the rest of its ride after the Room is ready (#163), so a
 * hold can't simply wait for the next `room:enter`.
 */
export const STAIR_TRANSITION_POLL_MS = 100;

/** A keyboard event, narrowed to what the controller reads. */
export interface StairKeyEvent {
  key: string;
  repeat: boolean;
  preventDefault(): void;
}

export interface StairKeysDeps {
  currentRoomId(): RoomId | null;
  /** The door a floor's ↑ or ↓ uses (`stairwellExit`), or `undefined`. */
  exitFor(roomId: RoomId, direction: 'up' | 'down'): RoomDoor | undefined;
  /**
   * Uses `door` exactly as reaching it does (`RoomNavigator.useDoor`).
   * `main.ts` tags the Room change it makes with the 'keys' source.
   */
  useDoor(door: RoomDoor): void;
  /** Whether a Room transition is still in flight, or the Elevator still showing. */
  isTransitioning(): boolean;
  /** Whether any HUD overlay is open (`hud.overlays.current() !== null`, RT2-6). */
  overlayOpen(): boolean;
  /** Whether a text field has focus: an input, textarea, select or contenteditable. */
  editableFocused(): boolean;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Called on every move the keys make (the hint goes, as in the design). */
  onMove?(): void;
}

export interface StairKeysController {
  keydown(event: StairKeyEvent): void;
  keyup(event: StairKeyEvent): void;
  /** The window lost focus: a held key can never climb on its own (S4-D10). */
  blur(): void;
  /** A Room finished loading (`room:enter`): a key still held may climb on. */
  roomReady(): void;
  /** Cancels any hold (sign-out). */
  reset(): void;
}

const DIRECTIONS: Readonly<Record<string, 'up' | 'down'>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Keyboard climbing, the Stairwell's one exception to "no keyboard movement"
 * (#51 slice 4, HD-2, S4-D10 as amended, RT2-5, RT2-6):
 * - holding ↑ or ↓ for `STAIR_HOLD_MS` on a Stairwell floor uses that
 *   floor's ↑ or ↓ door, exactly as walking to it does; releasing sooner
 *   cancels;
 * - keeping it held climbs (or descends) on to the next floor once that floor
 *   has loaded and `STAIR_CHAIN_MIN_MS` has passed since the last move;
 * - the exits that aren't a flight (floor 5's Roof Deck, floor 0's LOBBY
 *   door) need a fresh press and never continue a hold, so the coming-soon
 *   hint shows once per press;
 * - nothing happens off the Stairwell, while a text field has focus, while a
 *   HUD overlay is open or while a transition is in flight; only a key it
 *   handles is `preventDefault`ed, so arrow keys scroll and edit as usual
 *   everywhere else;
 * - auto-repeat only keeps a hold alive.
 */
export function createStairKeys(deps: StairKeysDeps): StairKeysController {
  /** The key held since a fresh keydown, or `null`. */
  let held: 'up' | 'down' | null = null;
  /** This press already made a move that a held key may not continue (a non-flight exit). */
  let spent = false;
  /** Moves made by this press, so far. */
  let moves = 0;
  /** A move was made and the hold waits for the next floor to load. */
  let awaitingRoom = false;
  let timer: unknown = null;
  let lastMoveAt = -Infinity;

  function clearPending(): void {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    awaitingRoom = false;
  }

  function release(): void {
    clearPending();
    held = null;
    spent = false;
    moves = 0;
  }

  /** The keys work only here: a Stairwell floor, no focused text field, no overlay. */
  function inPlay(): RoomId | null {
    const roomId = deps.currentRoomId();
    if (roomId === null || !isStairwellRoom(roomId)) return null;
    if (deps.editableFocused() || deps.overlayOpen()) return null;
    return roomId;
  }

  function schedule(ms: number): void {
    clearPending();
    timer = deps.setTimer(attempt, Math.max(0, ms));
  }

  function attempt(): void {
    timer = null;
    if (held === null || spent) return;
    const roomId = inPlay();
    if (roomId === null) {
      release();
      return;
    }
    if (deps.isTransitioning()) {
      schedule(STAIR_TRANSITION_POLL_MS);
      return;
    }
    const door = deps.exitFor(roomId, held);
    if (!door) {
      spent = true;
      return;
    }
    const flight = door.targetRoomId !== null && isStairwellRoom(door.targetRoomId);
    // RT2-5: only a fresh press takes a non-flight exit.
    if (!flight && moves > 0) {
      spent = true;
      return;
    }
    moves += 1;
    lastMoveAt = deps.now();
    deps.onMove?.();
    deps.useDoor(door);
    if (flight) awaitingRoom = true;
    else spent = true;
  }

  return {
    keydown(event) {
      const direction = DIRECTIONS[event.key];
      if (!direction || inPlay() === null) return;
      event.preventDefault();
      if (event.repeat || held === direction) return;
      release();
      held = direction;
      schedule(STAIR_HOLD_MS);
    },
    keyup(event) {
      if (DIRECTIONS[event.key] === held) release();
    },
    blur: release,
    roomReady() {
      if (held === null || spent || !awaitingRoom) return;
      awaitingRoom = false;
      schedule(lastMoveAt + STAIR_CHAIN_MIN_MS - deps.now());
    },
    reset: release,
  };
}

/** Whether `element` takes typed text: an input, textarea, select or contenteditable. */
export function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return (
    (element as HTMLElement).isContentEditable === true ||
    element.closest('[contenteditable]') !== null
  );
}

/**
 * Installs `controller` on `target`'s `keydown`/`keyup`/`blur` (S4-D10's
 * wiring). Returns the uninstaller, which also cancels any hold (sign-out).
 */
export function installStairKeys(target: Window, controller: StairKeysController): () => void {
  const onKeydown = (event: KeyboardEvent) => controller.keydown(event);
  const onKeyup = (event: KeyboardEvent) => controller.keyup(event);
  const onBlur = () => controller.blur();
  target.addEventListener('keydown', onKeydown);
  target.addEventListener('keyup', onKeyup);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeydown);
    target.removeEventListener('keyup', onKeyup);
    target.removeEventListener('blur', onBlur);
    controller.reset();
  };
}
