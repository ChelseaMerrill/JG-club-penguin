import type { QuestView } from '../quests/quest-controller';
import type { QuestStatus } from '../quests/quest-engine';
import './quests.css';

/** The id `main.ts` registers the Quests panel with on `hud.overlays`. */
export const QUESTS_OVERLAY_ID = 'quests';

export type QuestsTab = 'active' | 'done';

export interface QuestsPanelOptions {
  /** TRACK: the caller tracks the Quest (and re-renders with the new view). */
  onTrack: (questId: string) => void;
  /** The BADGES tab: the caller opens the Trophy Case (#42). */
  onBadges: () => void;
  /** The ✕ button; the caller also closes this via `hud.overlays`. */
  onClose: () => void;
}

export interface QuestsPanel {
  open(tab?: QuestsTab): void;
  close(): void;
  isOpen(): boolean;
  /** Re-renders from the controller's latest view (`null` renders empty tabs). */
  render(view: QuestView | null): void;
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

/** "150" for the main Quest's Tokens; "BADGE · +50" for a Minigame Quest (its existing Badge bonus). */
export function rewardLabel(status: QuestStatus): string {
  return status.quest.kind === 'steps' ? String(status.quest.rewardTokens) : 'BADGE · +50';
}

/** 0-100, for the progress bars. */
export function progressPercent(status: QuestStatus): number {
  if (status.target <= 0) return 0;
  return Math.round((Math.min(status.progress, status.target) / status.target) * 100);
}

/**
 * The Quests panel (#46), from `design/Club JenGuin HUD Menus.dc.html`'s
 * HUD-QUESTS screen: ACTIVE / DONE / BADGES tabs, one row per Quest (number,
 * title, location line, progress bar, "x / y", reward) and a TRACK button
 * for the selected row. Dropped from the design: the hackathon countdown,
 * the "New quests post on the igloo board at noon" sentence and "DEMO BY
 * 5PM". Renders only; `main.ts` owns the overlay registration.
 */
export function createQuestsPanel(root: HTMLElement, options: QuestsPanelOptions): QuestsPanel {
  let view: QuestView | null = null;
  let tab: QuestsTab = 'active';
  let selectedId: string | null = null;

  const panel = el('section', 'quests');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Quests');

  const header = el('div', 'quests__header');
  const title = el('div', 'quests__title', 'QUESTS');
  const closeButton = button('quests__close', '✕');
  closeButton.setAttribute('aria-label', 'Close quests');
  closeButton.addEventListener('click', () => options.onClose());
  header.append(title, closeButton);

  const tabs = el('div', 'quests__tabs');
  const activeTab = button('quests__tab');
  activeTab.dataset.questsTab = 'active';
  const doneTab = button('quests__tab');
  doneTab.dataset.questsTab = 'done';
  const badgesTab = button('quests__tab', 'BADGES');
  badgesTab.dataset.questsTab = 'badges';
  tabs.append(activeTab, doneTab, badgesTab);

  const list = el('div', 'quests__list');

  const footer = el('div', 'quests__footer');
  const footerText = el('div', 'quests__footer-text', 'Tracked quest shows on your HUD.');
  const trackButton = button('quests__track', 'TRACK');
  footer.append(footerText, trackButton);

  panel.append(header, tabs, list, footer);
  root.append(panel);

  function statusesFor(which: QuestsTab): QuestStatus[] {
    const all = view?.statuses ?? [];
    return all.filter((s) => (which === 'done' ? s.done : !s.done));
  }

  function renderRow(status: QuestStatus, index: number): HTMLButtonElement {
    const row = button('quests__row');
    row.dataset.questId = status.quest.id;
    const selected = status.quest.id === selectedId;
    row.setAttribute('aria-pressed', String(selected));
    row.classList.toggle('quests__row--selected', selected);

    const number = el('div', 'quests__row-number', String(index + 1));

    const middle = el('div', 'quests__row-middle');
    const rowTitle = el('div', 'quests__row-title', status.quest.title);
    const location = el('div', 'quests__row-location', status.quest.location);
    const bar = el('div', 'quests__row-bar');
    const fill = el('div', 'quests__row-bar-fill');
    fill.style.width = `${progressPercent(status)}%`;
    bar.append(fill);
    middle.append(rowTitle, location, bar);

    const right = el('div', 'quests__row-right');
    const progress = el('div', 'quests__row-progress', `${status.progress} / ${status.target}`);
    const reward = el('div', 'quests__row-reward-line');
    const icon = el('span', 'quests__token-icon');
    icon.setAttribute('aria-hidden', 'true');
    reward.append(icon, el('span', 'quests__row-reward', rewardLabel(status)));
    right.append(progress, reward);
    const statusText = status.done
      ? 'DONE'
      : status.quest.id === view?.trackedId
        ? 'TRACKING'
        : null;
    if (statusText) right.append(el('div', 'quests__row-status', statusText));

    row.append(number, middle, right);
    row.addEventListener('click', () => {
      selectedId = status.quest.id;
      render(view);
    });
    return row;
  }

  function render(next: QuestView | null): void {
    view = next;
    const active = statusesFor('active');
    const done = statusesFor('done');
    activeTab.textContent = `ACTIVE · ${active.length}`;
    doneTab.textContent = `DONE · ${done.length}`;
    activeTab.setAttribute('aria-pressed', String(tab === 'active'));
    doneTab.setAttribute('aria-pressed', String(tab === 'done'));
    badgesTab.setAttribute('aria-pressed', 'false');

    const shown = tab === 'done' ? done : active;
    if (!shown.some((s) => s.quest.id === selectedId)) {
      selectedId =
        shown.find((s) => s.quest.id === view?.trackedId)?.quest.id ?? shown[0]?.quest.id ?? null;
    }
    list.replaceChildren(...shown.map((status, index) => renderRow(status, index)));
    if (shown.length === 0) {
      list.append(
        el(
          'div',
          'quests__empty',
          tab === 'done' ? 'Nothing shipped yet.' : 'Every quest is done.',
        ),
      );
    }

    trackButton.hidden = tab === 'done';
    const selectedIsTracked = selectedId !== null && selectedId === view?.trackedId;
    trackButton.disabled = selectedId === null || selectedIsTracked;
    trackButton.textContent = selectedIsTracked ? 'TRACKING' : 'TRACK';
  }

  activeTab.addEventListener('click', () => {
    tab = 'active';
    render(view);
  });
  doneTab.addEventListener('click', () => {
    tab = 'done';
    render(view);
  });
  badgesTab.addEventListener('click', () => options.onBadges());
  trackButton.addEventListener('click', () => {
    if (selectedId !== null) options.onTrack(selectedId);
  });

  render(null);

  return {
    open(which: QuestsTab = 'active') {
      tab = which;
      selectedId = null;
      render(view);
      panel.hidden = false;
    },
    close() {
      panel.hidden = true;
    },
    isOpen() {
      return !panel.hidden;
    },
    render,
    destroy() {
      panel.remove();
    },
  };
}
