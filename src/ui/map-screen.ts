import { gameEvents, type RoomId } from '../contracts';
import type { OverlayManager } from './hud/overlay-manager';
import { isMapTileClickable, MAP_ROOMS, type MapRoomTile } from './map-rooms';
import './map-screen.css';

/** The id `main.ts` registers this overlay with on `hud.overlays`. */
export const MAP_OVERLAY_ID = 'map';

export interface MapScreenOptions {
  /** The HUD's `OverlayManager` (`hud.overlays`): one overlay open at a time. */
  overlays: OverlayManager;
  /** #15's `navigator.changeRoom`. */
  changeRoom: (roomId: RoomId) => void;
  /** #15's `navigator.currentRoomId`: `null` before a Session starts, which gates `ui:open-map` (D4). */
  currentRoomId: () => RoomId | null;
}

export interface MapScreen {
  isOpen(): boolean;
  destroy(): void;
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

function button(className: string, text?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

interface TileEntry {
  tile: MapRoomTile;
  tileButton: HTMLButtonElement;
  pill: HTMLElement;
  clickable: boolean;
}

/**
 * Mounts the Map screen (design: `design/Club JenGuin Map.dc.html`'s "JG HQ
 * MAP" card gallery) into `root` (the `#ui` layer) as a full-Stage DOM
 * overlay, hidden until `ui:open-map` fires, following `trophy-case.ts`'s
 * pattern. Unlike the Trophy Case and Market, this module owns its own
 * trigger (`ui:open-map`, the HUD MAP button) and its own `room:leave` close,
 * rather than the caller wiring a hotspot/button click into `open()`
 * (#33 D5): `main.ts` only needs the one `createMapScreen` call.
 */
export function createMapScreen(root: HTMLElement, options: MapScreenOptions): MapScreen {
  const overlay = el('div', 'map-screen');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'map-screen-title');

  const frame = el('div', 'map-screen__frame');

  const header = el('div', 'map-screen__header');
  const title = el('div', 'map-screen__title', 'JG HQ MAP');
  title.id = 'map-screen-title';
  const closeButton = button('map-screen__close', '✕');
  closeButton.setAttribute('aria-label', 'Close Map');
  closeButton.addEventListener('click', () => options.overlays.close(MAP_OVERLAY_ID));
  header.append(title, closeButton);

  const grid = el('div', 'map-screen__grid');

  const entries: TileEntry[] = MAP_ROOMS.map((tile) => {
    const clickable = isMapTileClickable(tile);

    const tileButton = button('map-screen__tile');
    tileButton.dataset.mapRoom = tile.roomId ?? '';
    tileButton.dataset.mapNumber = tile.number;
    tileButton.setAttribute('aria-disabled', String(!clickable));

    const thumb = el('div', 'map-screen__thumb');
    if (clickable) {
      const image = document.createElement('img');
      image.className = 'map-screen__thumb-image';
      image.src = `rooms/${tile.roomId}.png`;
      image.alt = '';
      thumb.append(image);
    } else {
      thumb.classList.add('map-screen__thumb--placeholder');
    }

    const label = el('div', 'map-screen__label', tile.label);
    const subtitle = el('div', 'map-screen__subtitle', tile.subtitle);
    const pill = el('div', 'map-screen__pill', clickable ? 'YOU ARE HERE' : 'COMING SOON');
    // A coming-soon tile's pill is always shown; a clickable tile's pill is
    // shown only for the current Room (toggled by `applyCurrent` on open).
    pill.hidden = clickable;

    tileButton.append(thumb, label, subtitle, pill);
    tileButton.addEventListener('click', () => {
      if (!clickable) return;
      const roomId = tile.roomId as RoomId;
      // D3: a clickable tile closes the Map, then calls changeRoom -- unless
      // it's the current Room, which only closes the Map.
      options.overlays.close(MAP_OVERLAY_ID);
      if (roomId !== options.currentRoomId()) options.changeRoom(roomId);
    });

    grid.append(tileButton);
    return { tile, tileButton, pill, clickable };
  });

  frame.append(header, grid);
  overlay.append(frame);
  root.append(overlay);

  function applyCurrent(current: RoomId): void {
    for (const { tile, tileButton, pill, clickable } of entries) {
      const isCurrent = clickable && tile.roomId === current;
      tileButton.classList.toggle('map-screen__tile--current', isCurrent);
      if (isCurrent) tileButton.setAttribute('aria-current', 'location');
      else tileButton.removeAttribute('aria-current');
      if (clickable) pill.hidden = !isCurrent;
    }
  }

  /** Whatever had focus right before `open()`, so `hide()` can put it back
   *  regardless of which close path (Escape, close button, another overlay
   *  opening, room:leave, or a tile click) fired -- following
   *  `core-values-card.ts`'s modal-focus pattern (#77). */
  let previouslyFocused: HTMLElement | null = null;

  function hide(): void {
    overlay.hidden = true;
    // Only refocus an element still attached to the document: one removed
    // (or replaced) while the Map was open would otherwise throw nothing,
    // but `.focus()` on a detached element is also simply a no-op, so this
    // guard exists to make that explicit rather than to avoid an error.
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
  }

  function open(): void {
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    const current = options.currentRoomId();
    if (current !== null) applyCurrent(current);
    // Moves focus into the dialog (`aria-modal="true"` requires it): the
    // current Room's own tile when there is one, or the close button
    // otherwise (defensive -- every real RoomId currently has a tile).
    const currentEntry = entries.find((entry) => entry.clickable && entry.tile.roomId === current);
    (currentEntry?.tileButton ?? closeButton).focus();
  }

  /** Every focusable element inside the dialog frame, in DOM/tab order (the close button, then each tile). */
  function focusableElements(): HTMLElement[] {
    return Array.from(frame.querySelectorAll<HTMLButtonElement>('button'));
  }

  /** Keeps Tab/Shift+Tab cycling inside the dialog frame while it's open (`aria-modal="true"`'s focus-trap requirement). */
  function trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !frame.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !frame.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener('keydown', trapTab);

  const unsubscribeOpen = gameEvents.on('ui:open-map', () => {
    // D4: ignored while no Session is active yet (before the first `room:enter`).
    if (options.currentRoomId() === null) return;
    open();
    options.overlays.open(MAP_OVERLAY_ID, hide);
  });

  // D4: closes on ESC (the OverlayManager itself), the close button, another
  // overlay opening (the OverlayManager itself), or any room:leave.
  const unsubscribeLeave = gameEvents.on('room:leave', () => {
    options.overlays.close(MAP_OVERLAY_ID);
  });

  return {
    isOpen: () => !overlay.hidden,
    destroy() {
      unsubscribeOpen();
      unsubscribeLeave();
      overlay.removeEventListener('keydown', trapTab);
      overlay.remove();
    },
  };
}
