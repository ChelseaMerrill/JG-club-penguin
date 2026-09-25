import { EMOTES, type EmoteId } from '../../contracts';
import type { OverlayManager } from './overlay-manager';

const ICON_INK = '#161719';
const ICON_TEXT_FONT = 'Anton, Impact, sans-serif';

/** Wraps an icon body in the design's 40x36 SVG frame. */
function iconSvg(body: string): string {
  return `<svg width="40" height="36" viewBox="0 0 40 36" aria-hidden="true">${body}</svg>`;
}

/**
 * Each tile's icon, copied from the HUD-EMOTE screen's inline SVGs
 * (`design/Club JenGuin HUD Menus.dc.html`), drawn in the design's dark ink
 * over the tile's hexagon.
 */
const EMOTE_ICONS: Record<EmoteId, string> = {
  wave: iconSvg(
    `<path d="M12 22 V10 M17 22 V7 M22 22 V9 M27 22 V12 M12 22 c0 8 15 10 15 0 v-6" fill="none" stroke="${ICON_INK}" stroke-width="3" stroke-linecap="round"/>`,
  ),
  dance: iconSvg(
    `<path d="M15 26 V8 l14 -4 v18" fill="none" stroke="${ICON_INK}" stroke-width="3" stroke-linecap="round"/><circle cx="11" cy="26" r="4" fill="${ICON_INK}"/><circle cx="25" cy="22" r="4" fill="${ICON_INK}"/>`,
  ),
  laugh: iconSvg(
    `<circle cx="20" cy="18" r="12" fill="none" stroke="${ICON_INK}" stroke-width="3"/><path d="M13 19 a7 7 0 0 0 14 0 z" fill="${ICON_INK}"/><circle cx="15" cy="14" r="1.8" fill="${ICON_INK}"/><circle cx="25" cy="14" r="1.8" fill="${ICON_INK}"/>`,
  ),
  sit: iconSvg(
    `<path d="M10 8 v20 M10 20 h18 v8 M14 20 v-6 h10 v6" fill="none" stroke="${ICON_INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  'thumbs-up': iconSvg(
    `<path d="M9 17 h5 v11 h-5 z M14 18 l5 -11 c3 0 4 2 3 5 l-1 4 h7 c2 0 3 2 2 4 l-2 7 c0 1 -1 2 -3 2 h-11" fill="none" stroke="${ICON_INK}" stroke-width="3" stroke-linejoin="round"/>`,
  ),
  brb: iconSvg(
    `<text x="20" y="24" text-anchor="middle" font-family="${ICON_TEXT_FONT}" font-size="15" fill="${ICON_INK}">BRB</text>`,
  ),
  'jg-flash': iconSvg(
    `<polygon points="20,6 31,12.5 31,25.5 20,32 9,25.5 9,12.5" fill="${ICON_INK}"/><text x="20" y="24" text-anchor="middle" font-family="${ICON_TEXT_FONT}" font-size="12" fill="#00BDFF">JG</text>`,
  ),
  'ship-it': iconSvg(
    `<path d="M8 22 h24 l-4 6 h-16 z M14 22 v-9 h8 v9 M22 13 l8 4" fill="none" stroke="${ICON_INK}" stroke-width="3" stroke-linejoin="round"/>`,
  ),
};

/** The id `createEmotePicker` registers with `hud.overlays`, so opening it closes MENU (and vice versa) and Escape closes it. */
export const EMOTE_OVERLAY_ID = 'emote';

/**
 * Display labels for the HUD-EMOTE picker (`design/Club JenGuin HUD
 * Menus.dc.html`'s HUD-EMOTE screen), one per `EmoteId` in `EMOTES`' own
 * order; keys 1-8 map to that same order (`handleKeydown` below).
 */
const EMOTE_LABELS: Record<EmoteId, string> = {
  wave: 'WAVE',
  dance: 'DANCE',
  laugh: 'LAUGH',
  sit: 'SIT',
  'thumbs-up': 'THUMBS UP',
  brb: 'BRB',
  'jg-flash': 'JG FLASH',
  'ship-it': 'SHIP IT',
};

export interface EmotePickerDeps {
  /** The HUD's `OverlayManager` (`hud.overlays`); opening the picker closes MENU, and Escape closes the picker. */
  overlays: OverlayManager;
  /** Called once per pick (click or key); the picker closes right after. */
  onPick: (emoteId: EmoteId) => void;
}

export interface EmotePicker {
  /** Opens the picker if closed, or closes it if open. */
  toggle(): void;
  /** Removes the picker's DOM and any listener it still holds. */
  destroy(): void;
}

/**
 * The EMOTE button's picker overlay (#47): a title bar ("EMOTES" / "KEYS 1-8
 * · ESC TO CLOSE") over a row of the eight HUD Emotes, reproducing
 * `design/Club JenGuin HUD Menus.dc.html`'s HUD-EMOTE screen in Stage
 * pixels. Mounted once into `layer` (the HUD root), hidden until
 * `toggle()`'s first `open()`.
 *
 * Keys 1-8 pick only while the picker is open (#47 D: the design gives no
 * signal either way, so this ticket resolves it to "only while open" — a
 * global 1-8 binding would collide with typing digits anywhere else later).
 * The HUD chat field already stops every keydown from reaching `window`
 * (`hud.ts`'s `stopKeyPropagation`), so a digit typed there never reaches
 * this picker's own `window` listener regardless of open/closed state.
 */
export function createEmotePicker(layer: HTMLElement, deps: EmotePickerDeps): EmotePicker {
  const panel = document.createElement('div');
  panel.className = 'emote-picker';
  panel.hidden = true;

  const header = document.createElement('div');
  header.className = 'emote-picker__header';
  const title = document.createElement('div');
  title.className = 'emote-picker__title';
  title.textContent = 'EMOTES';
  const hint = document.createElement('div');
  hint.className = 'emote-picker__hint';
  hint.textContent = 'KEYS 1-8 · ESC TO CLOSE';
  header.append(title, hint);

  const grid = document.createElement('div');
  grid.className = 'emote-picker__grid';

  for (const emoteId of EMOTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emote-picker__tile';
    button.dataset.emote = emoteId;

    const icon = document.createElement('span');
    icon.className = 'emote-picker__icon';
    // A constant from `EMOTE_ICONS` below, never user input.
    icon.innerHTML = EMOTE_ICONS[emoteId];

    const label = document.createElement('span');
    label.className = 'emote-picker__label';
    label.textContent = EMOTE_LABELS[emoteId];

    button.append(icon, label);
    button.addEventListener('click', () => pick(emoteId));
    grid.append(button);
  }

  panel.append(header, grid);
  layer.append(panel);

  function pick(emoteId: EmoteId): void {
    deps.onPick(emoteId);
    close();
    deps.overlays.close(EMOTE_OVERLAY_ID);
  }

  function handleKeydown(event: KeyboardEvent): void {
    const index = Number(event.key) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= EMOTES.length) return;
    event.stopPropagation();
    pick(EMOTES[index]!);
  }

  function open(): void {
    panel.hidden = false;
    window.addEventListener('keydown', handleKeydown);
    deps.overlays.open(EMOTE_OVERLAY_ID, close);
  }

  function close(): void {
    if (panel.hidden) return;
    panel.hidden = true;
    window.removeEventListener('keydown', handleKeydown);
  }

  return {
    toggle() {
      if (panel.hidden) {
        open();
        return;
      }
      deps.overlays.close(EMOTE_OVERLAY_ID);
      close();
    },
    destroy() {
      window.removeEventListener('keydown', handleKeydown);
      panel.remove();
    },
  };
}
