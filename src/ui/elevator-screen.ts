import { DEFAULT_LOOK, type PenguinLook, type RoomId } from '../contracts';
import {
  direction,
  floorLabel,
  floorsBetween,
  FLOOR_ORDER,
  MS_PER_FLOOR,
  rideDurationMs,
  type FloorId,
} from '../game/rooms/floors';
import { penguinLookHash } from '../game/penguin/look-hash';
import { prefersReducedMotion } from '../game/penguin/motion';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_VIEWBOX_WIDTH,
  renderPenguinSvg,
} from '../game/penguin/render-svg';
import { goingText, indicatorText, nextText, rideStateAt, statusText } from './elevator-ride';
import { ELEVATOR_SNOW } from './elevator-snow';
import './elevator-screen.css';

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

/** The design's sign and Penguin speech bubble, verbatim. */
const SIGN_TEXT = 'SOMEONE LEFT THE ROOF HATCH OPEN';
const BUBBLE_TEXT = 'elevator music intensifies';

/** The design draws the Penguin's 120-wide figure box at 180px: 1.5x (#163). */
const PENGUIN_SCALE = 180 / PENGUIN_VIEWBOX_WIDTH;

export interface ElevatorScreenOptions {
  /** `RoomId` -> its floor, or `null` for a Room with no floor (`ROOM_FLOORS` in production). */
  resolveFloor: (roomId: RoomId) => FloorId | null;
  /** The Player's own Look, drawn in the car (#163); `null` falls back to `DEFAULT_LOOK`. */
  resolveLook: () => PenguinLook | null;
  /** How long each floor crossed takes (#163); default `MS_PER_FLOOR` (1200ms). */
  msPerFloor?: number;
}

/**
 * The Elevator overlay's navigator-facing seam (#52 D3/D6): matches
 * `RoomNavigator`'s own `RoomTransitionScreen` dependency exactly, so
 * `main.ts` can pass this straight through.
 */
export interface ElevatorScreen {
  /** Shows the overlay (or retargets it if already visible) for a `from` -> `to` floor crossing. */
  begin(from: RoomId, to: RoomId): void;
  /** Signals the target Room is ready; hides at the later of this and the ride's end since `begin`. */
  ready(): void;
  /** Hides immediately and cancels any pending ride-end hide. */
  cancel(): void;
}

/**
 * `createElevatorScreen`'s return value: the navigator-facing `ElevatorScreen`
 * plus two test-only drivers (#163), used only by `main.ts`'s `HOOKS_ENABLED`
 * block to expose `window.__elevatorTest`.
 */
export interface ElevatorScreenHandle extends ElevatorScreen {
  /** `begin` between two floors directly, then an immediate `ready()`: no Room change needed. */
  previewRide(from: FloorId, to: FloorId): void;
  /** Stops the ride's clocks and shows the instant `elapsedMs` into it, with every animation paused there. */
  freezeAt(elapsedMs: number): void;
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

/** A `<div class="elevator-screen__<name>">` appended to `parent`, for the scenery's many plain layers. */
function layer(parent: HTMLElement, ...names: string[]): HTMLDivElement {
  const node = el('div', names.map((name) => `elevator-screen__${name}`).join(' '));
  parent.append(node);
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
 * The car is the whole design (#163), minus the coworker pop-ups and its
 * "You" tag: shaft windows, ceiling lights, snow, the Player's own Penguin
 * with their Room name tag, the floor strip, the FLOORS panel and the
 * progress block. A ride lasts `msPerFloor` for each floor crossed, and the
 * indicator, floor strip, FLOORS panel, status line and bar all read one
 * clock (`rideStateAt`, driven by one `requestAnimationFrame` loop).
 */
export function createElevatorScreen(
  root: HTMLElement,
  options: ElevatorScreenOptions,
): ElevatorScreenHandle {
  const msPerFloor = options.msPerFloor ?? MS_PER_FLOOR;

  const overlay = el('div', 'elevator-screen');
  overlay.hidden = true;
  overlay.setAttribute('aria-live', 'polite');

  // The scenery is decoration: only the heading and tip below are announced
  // (the ticking indicator and status would otherwise read out ~100 times).
  const car = layer(overlay, 'car');
  car.setAttribute('aria-hidden', 'true');
  layer(car, 'walls');
  layer(car, 'walls-shade');
  layer(car, 'wash');
  layer(car, 'top-bar');
  const lights = layer(car, 'lights');
  for (let i = 0; i < 3; i++) layer(lights, 'light');
  layer(car, 'floor-lip');
  layer(car, 'deck');
  layer(car, 'deck-grid');
  layer(car, 'handrail');
  for (const side of ['left', 'right']) {
    const shaft = layer(car, 'shaft', `shaft--${side}`);
    layer(shaft, 'shaft-lights');
    layer(shaft, 'shaft-shade');
  }

  const indicatorPanel = layer(car, 'indicator');
  const indicatorRow = layer(indicatorPanel, 'indicator-row');
  const goingEl = layer(indicatorRow, 'going');
  const arrowEl = layer(indicatorRow, 'arrow');
  const nextEl = layer(indicatorRow, 'next');
  const strip = layer(indicatorPanel, 'strip');
  const floorEls = new Map<FloorId, HTMLElement>();
  for (const floor of FLOOR_ORDER) {
    const floorEl = el('div', 'elevator-screen__floor', floor);
    floorEls.set(floor, floorEl);
    strip.append(floorEl);
  }

  const floorsPanel = layer(car, 'floors-panel');
  floorsPanel.append(el('div', 'elevator-screen__floors-label', 'FLOORS'));
  const hexEls = new Map<FloorId, HTMLElement>();
  for (const floor of [...FLOOR_ORDER].reverse()) {
    const hex = el('div', 'elevator-screen__hex', floor);
    hexEls.set(floor, hex);
    floorsPanel.append(hex);
  }
  layer(floorsPanel, 'floors-bar');
  const floorsDots = layer(floorsPanel, 'floors-dots');
  layer(floorsDots, 'floors-dot');
  layer(floorsDots, 'floors-dot', 'floors-dot--dim');

  const snow = layer(car, 'snow');
  for (const flake of ELEVATOR_SNOW) {
    const flakeEl = layer(snow, 'flake');
    flakeEl.style.left = `${flake.left}%`;
    flakeEl.style.width = `${flake.size}px`;
    flakeEl.style.height = `${flake.size}px`;
    flakeEl.style.opacity = String(flake.opacity);
    flakeEl.style.animationDuration = `${flake.durationS}s`;
    flakeEl.style.animationDelay = `${flake.delayS}s`;
  }

  car.append(el('div', 'elevator-screen__sign', SIGN_TEXT));

  const penguinBox = layer(car, 'penguin');
  const penguinArt = layer(penguinBox, 'penguin-art');
  // The SVG frame is drawn at 1.5x and offset by its padding, so the figure's
  // 120x130 core exactly fills the design's 180x195 box.
  penguinArt.style.setProperty('--elevator-art-width', `${PENGUIN_FRAME_WIDTH * PENGUIN_SCALE}px`);
  penguinArt.style.setProperty(
    '--elevator-art-height',
    `${PENGUIN_FRAME_HEIGHT * PENGUIN_SCALE}px`,
  );
  penguinArt.style.setProperty(
    '--elevator-art-left',
    `${-PENGUIN_FRAME_PADDING_X * PENGUIN_SCALE}px`,
  );
  penguinArt.style.setProperty(
    '--elevator-art-top',
    `${-PENGUIN_FRAME_PADDING_Y * PENGUIN_SCALE}px`,
  );
  layer(car, 'penguin-shadow');
  const nameTag = layer(car, 'name-tag');
  car.append(el('div', 'elevator-screen__bubble', BUBBLE_TEXT));

  const bottom = layer(overlay, 'bottom');
  const heading = layer(bottom, 'heading');
  const progress = layer(bottom, 'progress');
  progress.setAttribute('aria-hidden', 'true');
  const progressBar = layer(progress, 'progress-bar');
  const statusRow = layer(bottom, 'status-row');
  const statusEl = layer(statusRow, 'status');
  statusEl.setAttribute('aria-hidden', 'true');
  statusRow.append(el('div', 'elevator-screen__tip', TIP_TEXT));

  root.append(overlay);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;
  /** Set once the ride's own duration has elapsed since the current `begin()`. */
  let minElapsed = false;
  /** Set once `ready()` has been called for the current `begin()`. */
  let readyReceived = false;
  /** The floors of the current ride, or `null` when either could not be resolved. */
  let ride: { from: FloorId; to: FloorId } | null = null;
  /** The Look the Penguin art was last drawn for, to skip redrawing an unchanged one. */
  let drawnLook: string | null = null;
  /** What `applyRide` last wrote, so the DOM is only touched when a value changes. */
  const shown = { going: '', arrow: '', next: '', status: '', width: '', lit: '' };

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

  function stopRideLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function hide(): void {
    clearHideTimer();
    clearSafetyTimer();
    stopRideLoop();
    minElapsed = false;
    readyReceived = false;
    overlay.hidden = true;
  }

  /** Hides only once both the ride has ended and `ready()` has fired (#52 D4). */
  function maybeHide(): void {
    if (minElapsed && readyReceived) hide();
  }

  function setText(
    key: 'going' | 'arrow' | 'next' | 'status',
    node: HTMLElement,
    text: string,
  ): void {
    if (shown[key] === text) return;
    shown[key] = text;
    node.textContent = text;
  }

  /** Writes the ride's state `elapsedMs` in: indicator, status, bar and the lit FLOORS hex. */
  function applyRide(elapsedMs: number): void {
    if (ride === null) return;
    const state = rideStateAt(ride.from, ride.to, elapsedMs, msPerFloor);
    setText('going', goingEl, goingText(state.direction));
    setText('arrow', arrowEl, indicatorText(state));
    setText('next', nextEl, nextText(ride.to));
    setText('status', statusEl, statusText(state));
    const width = `${state.percent}%`;
    if (shown.width !== width) {
      shown.width = width;
      progressBar.style.width = width;
    }
    if (shown.lit !== state.passingFloor) {
      shown.lit = state.passingFloor;
      for (const [floor, hex] of hexEls) {
        hex.classList.toggle('elevator-screen__hex--lit', floor === state.passingFloor);
      }
    }
  }

  /** Blanks everything `applyRide` writes, so a stale ride never shows through a new one. */
  function clearRide(): void {
    ride = null;
    for (const key of Object.keys(shown) as (keyof typeof shown)[]) shown[key] = '';
    for (const node of [goingEl, arrowEl, nextEl, statusEl]) node.textContent = '';
    progressBar.style.width = '0%';
    for (const hex of hexEls.values()) hex.classList.remove('elevator-screen__hex--lit');
  }

  /** The floor strip: source, destination, off-path floors, and the in-between chips' lighting delays. */
  function applyFloors(source: FloorId | null, destination: FloorId | null): void {
    const indexes =
      source === null || destination === null
        ? null
        : [FLOOR_ORDER.indexOf(source), FLOOR_ORDER.indexOf(destination)];
    const lo = indexes === null ? -1 : Math.min(...indexes);
    const hi = indexes === null ? -1 : Math.max(...indexes);
    const between =
      source === null || destination === null ? [] : floorsBetween(source, destination);
    for (const [floor, floorEl] of floorEls) {
      const isDest = floor === destination;
      const isSource = floor === source && !isDest;
      const betweenIndex = between.indexOf(floor);
      const index = FLOOR_ORDER.indexOf(floor);
      floorEl.classList.toggle('elevator-screen__floor--dest', isDest);
      floorEl.classList.toggle('elevator-screen__floor--source', isSource);
      // Re-added by `restartFloorLights` once the overlay is visible.
      floorEl.classList.remove('elevator-screen__floor--between');
      floorEl.style.animationDelay = betweenIndex === -1 ? '' : `${betweenIndex * msPerFloor}ms`;
      if (isDest || isSource) floorEl.style.opacity = '';
      else floorEl.style.opacity = index < lo || index > hi ? '0.35' : '0.6';
    }
  }

  /**
   * Restarts the in-between chips' `floorlit` animations (#52 review MAJOR's
   * lesson): a class swap made while the overlay is still `display: none`
   * never restarts anything, so this runs *after* `overlay.hidden = false`,
   * with a forced reflow between the removal and the re-add.
   */
  function restartFloorLights(): void {
    const chips = [...floorEls.values()].filter((chip) => chip.style.animationDelay !== '');
    for (const chip of chips) chip.classList.remove('elevator-screen__floor--between');
    void overlay.offsetWidth;
    for (const chip of chips) chip.classList.add('elevator-screen__floor--between');
  }

  /** Draws the Player's Look and Room name tag, redrawing the SVG only when the Look changed. */
  function applyLook(): void {
    const look = options.resolveLook() ?? DEFAULT_LOOK;
    const hash = penguinLookHash(look);
    const drawn = `${hash}|${look.emote}`;
    if (drawn !== drawnLook) {
      drawnLook = drawn;
      penguinArt.innerHTML = renderPenguinSvg(
        look,
        { anim: look.emote, frame: 0 },
        { idPrefix: 'elevator-screen' },
      );
      penguinArt.dataset.lookHash = hash;
    }
    // The Room tag's own rule (`nameTagText`), reimplemented because that module imports Phaser.
    nameTag.textContent = look.name;
    nameTag.hidden = look.name === '';
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

  /** Shows (or retargets) the screen for a ride between two floors, either of which may be unresolved. */
  function startRide(source: FloorId | null, destination: FloorId | null): void {
    // #52 D5: re-`begin()` while already visible retargets everything
    // below and restarts the ride, rather than stacking onto whatever was
    // already pending.
    clearHideTimer();
    clearSafetyTimer();
    stopRideLoop();
    minElapsed = false;
    readyReceived = false;
    clearRide();

    // Resolved before `overlay.hidden = false` below so a defensively
    // unresolved floor (shouldn't happen given `floorsDiffer`) clears any
    // stale heading from a previous `begin()` instead of leaving it up.
    let headingText = '';
    let durationMs = msPerFloor;
    if (source !== null && destination !== null) {
      ride = { from: source, to: destination };
      durationMs = rideDurationMs(source, destination, msPerFloor);
      const dir = direction(source, destination);
      headingText = `WADDLING ${dir === 'up' ? 'UP' : 'DOWN'} TO ${floorLabel(destination)}`;
    }
    overlay.classList.toggle(
      'elevator-screen--down',
      source !== null && destination !== null && direction(source, destination) === 'down',
    );
    applyFloors(source, destination);
    applyLook();

    overlay.hidden = false;
    // The heading is only set once the overlay is actually visible, so its
    // `aria-live="polite"` announcement fires (#52 review NIT).
    heading.textContent = headingText;
    restartFloorLights();
    blurStrayFocus();

    if (prefersReducedMotion()) {
      // No ticking: the arrival state shows at once; only the ride's length stays.
      applyRide(durationMs);
    } else {
      applyRide(0);
      const startedAt = performance.now();
      const tick = (): void => {
        applyRide(performance.now() - startedAt);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
    hideTimer = setTimeout(() => {
      minElapsed = true;
      hideTimer = null;
      stopRideLoop();
      applyRide(durationMs);
      maybeHide();
    }, durationMs);
    safetyTimer = setTimeout(() => {
      safetyTimer = null;
      hide();
    }, SAFETY_HIDE_MS);
  }

  const screen: ElevatorScreenHandle = {
    begin(from, to) {
      startRide(options.resolveFloor(from), options.resolveFloor(to));
    },
    ready() {
      readyReceived = true;
      maybeHide();
    },
    cancel() {
      hide();
    },
    previewRide(from, to) {
      startRide(from, to);
      screen.ready();
    },
    freezeAt(elapsedMs) {
      clearHideTimer();
      clearSafetyTimer();
      stopRideLoop();
      applyRide(elapsedMs);
      for (const animation of overlay.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = elapsedMs;
      }
    },
  };
  return screen;
}
