import { EMOTES, type EmoteId } from '../../contracts';
import type { OverlayManager } from './overlay-manager';

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
