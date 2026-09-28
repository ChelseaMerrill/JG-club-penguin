import type { BadgeId } from '../contracts';
import { badgeDisplayName } from '../minigames/badge-names';
import { BADGE_BONUS } from '../persistence/minigame-rules';
import './badge-unlock-panel.css';

/** How long a Badge popup stays up once it actually appears (#138, decided 2026-09-27). */
export const BADGE_POPUP_MS = 6000;

/**
 * The Minigame done screen's "Badge unlocked" panel (#37), as its own piece
 * so #138's Badge popup reuses exactly the same markup. `name` is the text
 * of the name line; `bonus` adds a "+N TOKENS" line under it. Without
 * `bonus` the markup is identical to the done screen's original panel.
 */
export function renderBadgeUnlock(name: string, options: { bonus?: number } = {}): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'minigame__done-badge';
  const nameEl = document.createElement('div');
  nameEl.className = 'minigame__done-badge-name';
  nameEl.textContent = name;
  panel.append(nameEl);
  if (options.bonus !== undefined) {
    panel.classList.add('minigame__done-badge--bonus');
    const bonus = document.createElement('div');
    bonus.className = 'minigame__done-badge-bonus';
    bonus.textContent = `+${options.bonus} TOKENS`;
    panel.append(bonus);
  }
  const caption = document.createElement('div');
  caption.className = 'minigame__done-badge-caption';
  caption.textContent = 'ADDED TO YOUR TROPHY CASE';
  panel.append(caption);
  return panel;
}

/**
 * Something the Badge popup must never show over (#138): today the QUEST
 * COMPLETE banner, which shows at the same moment Ship It is earned.
 */
export interface BadgePopupBlocker {
  isVisible(): boolean;
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}

export interface BadgePopupOptions {
  /** The popup waits while any of these is visible. */
  blockers?: readonly BadgePopupBlocker[];
}

export interface BadgePopup {
  /** Queues `badgeId`'s popup; popups show one at a time. */
  show(badgeId: BadgeId): void;
  /** The id currently on screen, or null. */
  current(): BadgeId | null;
  destroy(): void;
}

/**
 * The Badge popup (#138 D13): the done screen's panel with "+50 TOKENS", as
 * a transient overlay at the top centre of the Stage for any Badge earned
 * outside a Minigame done screen. It closes after `BADGE_POPUP_MS` from when
 * it actually appears, or when its panel is clicked; popups queue one at a
 * time. It never overlaps a blocker: it waits while one is visible, and if a
 * blocker appears while a popup is showing, that popup hides at once, goes
 * back to the front of the queue and reappears for a full `BADGE_POPUP_MS`
 * once the blocker hides. The full-Stage layer lets clicks through; only
 * the panel itself takes them.
 */
export function createBadgePopup(root: HTMLElement, options: BadgePopupOptions = {}): BadgePopup {
  const blockers = options.blockers ?? [];

  const layer = document.createElement('div');
  layer.className = 'badge-popup-layer';
  const slot = document.createElement('div');
  slot.className = 'badge-popup';
  slot.hidden = true;
  slot.setAttribute('role', 'status');
  slot.setAttribute('aria-live', 'polite');
  slot.title = 'Close';
  layer.append(slot);
  root.append(layer);

  const queue: BadgeId[] = [];
  let showing: BadgeId | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function blocked(): boolean {
    return blockers.some((blocker) => blocker.isVisible());
  }

  function pump(): void {
    if (showing !== null || blocked()) return;
    const next = queue.shift();
    if (next === undefined) return;
    showing = next;
    slot.replaceChildren(
      renderBadgeUnlock(`Badge unlocked: ${badgeDisplayName(next)}`, { bonus: BADGE_BONUS }),
    );
    slot.hidden = false;
    timer = setTimeout(dismiss, BADGE_POPUP_MS);
  }

  function hide(): void {
    clearTimer();
    slot.hidden = true;
    slot.replaceChildren();
  }

  function dismiss(): void {
    hide();
    showing = null;
    pump();
  }

  slot.addEventListener('click', () => {
    if (showing !== null) dismiss();
  });

  const unsubscribers = blockers.map((blocker) =>
    blocker.onVisibilityChange((visible) => {
      if (visible) {
        if (showing === null) return;
        // Paused by a blocker: back to the front of the queue, and a full
        // BADGE_POPUP_MS again once it reappears.
        queue.unshift(showing);
        showing = null;
        hide();
        return;
      }
      pump();
    }),
  );

  return {
    show(badgeId) {
      queue.push(badgeId);
      pump();
    },
    current: () => showing,
    destroy() {
      clearTimer();
      for (const unsubscribe of unsubscribers) unsubscribe();
      queue.length = 0;
      showing = null;
      layer.remove();
    },
  };
}
