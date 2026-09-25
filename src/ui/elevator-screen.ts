import type { RoomId } from '../contracts';
import { direction, floorLabel, FLOOR_ORDER, type FloorId } from '../game/rooms/floors';
import './elevator-screen.css';

/** Default `minDurationMs`: 1.2s, the Elevator's own minimum ride time (#52 D4). */
const DEFAULT_MIN_DURATION_MS = 1200;

/**
 * Safety cap (#52 review MINOR): if `ready()` never arrives -- a bug
 * elsewhere, or a Room whose `create()` never resolves -- the overlay force-
 * hides itself rather than staying stuck over the Stage forever.
 */
const SAFETY_HIDE_MS = 10_000;

/** The chat input's own class (`hud.ts`); `begin()` never blurs it (#52 review MINOR). */
const CHAT_INPUT_SELECTOR = '.hud__chat-input';

/** The Elevator's own tip text, from `design/Elevator.dc.html`'s bottom bar. */
const TIP_TEXT = 'TIP: JG HQ IS ON 5 · THE ROOF DECK IS ONE MORE UP';

export interface ElevatorScreenOptions {
  /** `RoomId` -> its floor, or `null` for a Room with no floor (`ROOM_FLOORS` in production). */
  resolveFloor: (roomId: RoomId) => FloorId | null;
  /** The Elevator's own minimum ride time (#52 D4); default 1200ms. */
  minDurationMs?: number;
}

/**
 * The Elevator overlay's navigator-facing seam (#52 D3/D6): matches
 * `RoomNavigator`'s own `RoomTransitionScreen` dependency exactly, so
 * `main.ts` can pass this straight through.
 */
export interface ElevatorScreen {
  /** Shows the overlay (or retargets it if already visible) for a `from` -> `to` floor crossing. */
  begin(from: RoomId, to: RoomId): void;
  /** Signals the target Room is ready; hides at the later of this and `minDurationMs` since `begin`. */
  ready(): void;
  /** Hides immediately and cancels any pending minimum-duration hide. */
  cancel(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mounts the Elevator loading screen (#52; design: `design/Elevator.dc.html`)
 * into `root` (the `#ui` layer) as a full-Stage DOM overlay, hidden until the
 * `RoomNavigator` calls `begin()`. Unlike the Map/Market/Creator/Trophy Case,
 * this overlay is deliberately *not* registered with the HUD's
 * `OverlayManager` (#52 D6): it isn't dismissible (no Escape, no close
 * button) and it must be able to show over whichever of those overlays (or
 * none) happened to trigger the Room change underneath it, hence its higher
 * `z-index` (see `elevator-screen.css`).
 *
 * Content is deliberately a subset of the design (#52 D6): the floor strip
 * (destination lit, source outlined), the "WADDLING UP/DOWN TO ..." heading,
 * a progress line that fills over `minDurationMs`, and the tip text. The
 * design's NPC pop-ups, penguin sprite and snow particles are left out.
 */
export function createElevatorScreen(
  root: HTMLElement,
  options: ElevatorScreenOptions,
): ElevatorScreen {
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;

  const overlay = el('div', 'elevator-screen');
  overlay.hidden = true;
  overlay.setAttribute('aria-live', 'polite');

  const frame = el('div', 'elevator-screen__frame');

  const strip = el('div', 'elevator-screen__strip');
  const floorEls = new Map<FloorId, HTMLElement>();
  for (const floor of FLOOR_ORDER) {
    const floorEl = el('div', 'elevator-screen__floor', floor);
    floorEls.set(floor, floorEl);
    strip.append(floorEl);
  }

  const heading = el('div', 'elevator-screen__heading');
  const progress = el('div', 'elevator-screen__progress');
  const progressBar = el('div', 'elevator-screen__progress-bar');
  progress.append(progressBar);
  const tip = el('div', 'elevator-screen__tip', TIP_TEXT);

  frame.append(strip, heading, progress, tip);
  overlay.append(frame);
  root.append(overlay);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set once `minDurationMs` has elapsed since the current `begin()`. */
  let minElapsed = false;
  /** Set once `ready()` has been called for the current `begin()`. */
  let readyReceived = false;

  function clearHideTimer(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function clearSafetyTimer(): void {
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  }

  function hide(): void {
    clearHideTimer();
    clearSafetyTimer();
    minElapsed = false;
    readyReceived = false;
    overlay.hidden = true;
  }

  /** Hides only once both the minimum duration has elapsed and `ready()` has fired (#52 D4). */
  function maybeHide(): void {
    if (minElapsed && readyReceived) hide();
  }

  /** Distance-from-destination opacity step, matching the design's own .9/.6/.35 floor-strip dimming. */
  function farFloorOpacity(floor: FloorId, destIndex: number): string {
    const distance = Math.abs(FLOOR_ORDER.indexOf(floor) - destIndex);
    if (distance <= 1) return '0.9';
    if (distance === 2) return '0.6';
    return '0.35';
  }

  function applyFloors(source: FloorId | null, destination: FloorId | null): void {
    const destIndex = destination === null ? null : FLOOR_ORDER.indexOf(destination);
    for (const [floor, floorEl] of floorEls) {
      const isDest = floor === destination;
      const isSource = floor === source && !isDest;
      floorEl.classList.toggle('elevator-screen__floor--dest', isDest);
      floorEl.classList.toggle('elevator-screen__floor--source', isSource);
      floorEl.style.opacity =
        isDest || isSource || destIndex === null ? '' : farFloorOpacity(floor, destIndex);
    }
  }

  /**
   * Resets the progress bar to empty, then restarts its `elevator-fill`
   * keyframes animation from scratch (#52 review MAJOR). Must run *after*
   * `overlay.hidden = false`: a class swap made while the overlay is still
   * `display: none` never triggers a restart, so the bar would show full the
   * instant it appears instead of filling over `minDurationMs`.
   */
  function restartProgress(): void {
    progressBar.style.setProperty('--elevator-fill-duration', `${minDurationMs}ms`);
    progressBar.classList.remove('elevator-screen__progress-bar--filling');
    // Forces a reflow so the removal above lands before the class is
    // re-added below, rather than the browser coalescing both into one
    // frame and never restarting the animation at all.
    void progressBar.offsetWidth;
    progressBar.classList.add('elevator-screen__progress-bar--filling');
  }

  /**
   * Blurs whatever has focus, unless it's the HUD's chat input (#52 review
   * MINOR): otherwise a lingering focus ring on a door or the Map button
   * lets Enter/Space "click" it again while the overlay is covering it.
   */
  function blurStrayFocus(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest(CHAT_INPUT_SELECTOR)) {
      active.blur();
    }
  }

  return {
    begin(from, to) {
      const sourceFloor = options.resolveFloor(from);
      const destFloor = options.resolveFloor(to);
      applyFloors(sourceFloor, destFloor);
      // Resolved outside `overlay.hidden = false` below so a defensively
      // unresolved floor (shouldn't happen given `floorsDiffer`) clears any
      // stale heading from a previous `begin()` instead of leaving it up.
      let headingText = '';
      if (sourceFloor !== null && destFloor !== null) {
        const dir = direction(sourceFloor, destFloor) === 'up' ? 'UP' : 'DOWN';
        headingText = `WADDLING ${dir} TO ${floorLabel(destFloor)}`;
      }
      // #52 D5: re-`begin()` while already visible retargets everything
      // below and restarts the minimum duration, rather than stacking onto
      // whatever was already pending.
      clearHideTimer();
      clearSafetyTimer();
      minElapsed = false;
      readyReceived = false;
      overlay.hidden = false;
      // The heading is only set once the overlay is actually visible, so its
      // `aria-live="polite"` announcement fires (#52 review NIT).
      heading.textContent = headingText;
      restartProgress();
      blurStrayFocus();
      hideTimer = setTimeout(() => {
        minElapsed = true;
        hideTimer = null;
        maybeHide();
      }, minDurationMs);
      safetyTimer = setTimeout(() => {
        safetyTimer = null;
        hide();
      }, SAFETY_HIDE_MS);
    },
    ready() {
      readyReceived = true;
      maybeHide();
    },
    cancel() {
      hide();
    },
  };
}
