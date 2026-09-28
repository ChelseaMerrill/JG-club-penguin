import type { BadgeId } from '../contracts';
import { BADGE_CATALOG } from '../persistence/badge-catalog';
import type { BadgeDefinition, ProgressStore } from '../persistence/progress-store';
import './trophy-case.css';

/** The id `main.ts` registers this overlay with on `hud.overlays`. */
export const TROPHY_CASE_OVERLAY_ID = 'trophy-case';

type TabId = 'badges' | 'trophies' | 'awards';

/** Tiles per BADGES page: the design's 4 x 3 grid (`design/Trophy Case.dc.html`). */
export const TROPHY_CASE_PAGE_SIZE = 12;

/**
 * The BADGES tab's tile order (#138): earned Badges first, then locked ones
 * (earnable, not yet earned), then coming-soon ones (defined, not yet
 * earnable), each group by `sortOrder`, then id.
 */
export function orderBadgeTiles(
  catalog: readonly BadgeDefinition[],
  earned: readonly string[],
): BadgeDefinition[] {
  const group = (badge: BadgeDefinition) =>
    earned.includes(badge.id) ? 0 : badge.available ? 1 : 2;
  return [...catalog].sort(
    (a, b) => group(a) - group(b) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
}

/** TROPHIES tab content (`design/Trophy Case.dc.html`'s "HACKATHON TROPHIES" panel): static, not read from any store. */
const TROPHIES: readonly { rank: number; name: string; earned: boolean }[] = [
  { rank: 1, name: 'Team Pod · Ship It', earned: true },
  { rank: 2, name: '—', earned: false },
  { rank: 3, name: '—', earned: false },
];

/** JG AWARDS tab content: static, copied from the design verbatim. */
const AWARDS: readonly { key: string; alt: string; src: string }[] = [
  { key: 'bptw', alt: 'Best Places to Work', src: 'awards/bptw.svg' },
  { key: 'inc500', alt: 'Inc. 5000', src: 'awards/inc500.svg' },
  { key: 'top-wp', alt: 'Top Workplaces', src: 'awards/top-wp.svg' },
];

const AWARDS_CAPTION =
  'Best Places to Work · Inc. 5000 · Top Workplaces. Hang them in your igloo for 60 tokens each.';

export interface TrophyCaseOptions {
  store: Pick<ProgressStore, 'loadAll'>;
  /** The ✕ button; the caller also closes this via `hud.overlays` (Escape/another overlay opening). */
  onClose: () => void;
}

export interface TrophyCase {
  /**
   * Shows the overlay on the BADGES tab and reloads `store.loadAll()` so the
   * Badge grid is always current (#42 resolved decision 2: there is no
   * live update and no persistence yet, so every open is a fresh read).
   */
  open(): Promise<void>;
  close(): void;
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

/**
 * Mounts the Trophy Case (design: `design/Trophy Case.dc.html`) into `root`
 * (the `#ui` layer) as a full-Stage DOM overlay, hidden until `open()`,
 * following `penguin-creator.ts`'s pattern: this module only renders itself
 * and reads `store.loadAll()`; the caller (`main.ts`) registers it with the
 * HUD's `OverlayManager` so Escape closes it and it closes any other open
 * overlay first.
 */
export function createTrophyCase(root: HTMLElement, options: TrophyCaseOptions): TrophyCase {
  const overlay = el('div', 'trophy-case');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'trophy-case-title');

  const frame = el('div', 'trophy-case__frame');

  const header = el('div', 'trophy-case__header');
  const titleBlock = el('div', 'trophy-case__title-block');
  const title = el('div', 'trophy-case__title', 'TROPHY CASE');
  title.id = 'trophy-case-title';
  const subtitle = el('div', 'trophy-case__subtitle');
  titleBlock.append(title, subtitle);
  const closeButton = button('trophy-case__close', '✕');
  closeButton.setAttribute('aria-label', 'Close Trophy Case');
  closeButton.addEventListener('click', () => options.onClose());
  header.append(titleBlock, closeButton);

  const tabsRow = el('div', 'trophy-case__tabs');
  tabsRow.setAttribute('role', 'tablist');

  const panels: Record<TabId, HTMLElement> = {
    badges: el('div', 'trophy-case__panel'),
    trophies: el('div', 'trophy-case__panel'),
    awards: el('div', 'trophy-case__panel'),
  };
  panels.badges.dataset.panel = 'badges';
  panels.trophies.dataset.panel = 'trophies';
  panels.awards.dataset.panel = 'awards';

  const tabLabels: Record<TabId, string> = {
    badges: 'BADGES',
    trophies: 'TROPHIES',
    awards: 'JG AWARDS',
  };

  function showTab(next: TabId): void {
    for (const id of Object.keys(panels) as TabId[]) {
      panels[id].hidden = id !== next;
      tabButtons[id].setAttribute('aria-pressed', String(id === next));
    }
  }

  const tabButtons = {} as Record<TabId, HTMLButtonElement>;
  for (const id of Object.keys(tabLabels) as TabId[]) {
    const tabButton = button('trophy-case__tab', tabLabels[id]);
    tabButton.dataset.tab = id;
    tabButton.setAttribute('role', 'tab');
    tabButton.addEventListener('click', () => showTab(id));
    tabButtons[id] = tabButton;
    tabsRow.append(tabButton);
  }

  const body = el('div', 'trophy-case__body');
  body.append(panels.badges, panels.trophies, panels.awards);

  // ---- BADGES tab: the catalog, 12 tiles per page (#138) ----
  const badgesGrid = el('div', 'trophy-case__badges');
  const pager = el('div', 'trophy-case__pager');
  const prevButton = button('trophy-case__page-arrow', '‹');
  prevButton.setAttribute('aria-label', 'Previous page');
  const dots = el('div', 'trophy-case__page-dots');
  const nextButton = button('trophy-case__page-arrow', '›');
  nextButton.setAttribute('aria-label', 'Next page');
  pager.append(prevButton, dots, nextButton);
  panels.badges.append(badgesGrid, pager);

  let catalog: readonly BadgeDefinition[] = BADGE_CATALOG;
  let earned: readonly BadgeId[] = [];
  let page = 0;

  const pageCount = () => Math.max(1, Math.ceil(catalog.length / TROPHY_CASE_PAGE_SIZE));

  function renderTile(badge: BadgeDefinition): HTMLElement {
    const isEarned = earned.includes(badge.id as BadgeId);
    const comingSoon = !isEarned && !badge.available;
    const tileEl = el('div', 'trophy-case__badge');
    tileEl.dataset.badgeId = badge.id;
    tileEl.classList.toggle('trophy-case__badge--earned', isEarned);
    tileEl.classList.toggle('trophy-case__badge--coming-soon', comingSoon);
    tileEl.append(
      el('div', 'trophy-case__badge-icon', isEarned ? '✓' : '?'),
      el('div', 'trophy-case__badge-name', badge.name),
      el('div', 'trophy-case__badge-hint', badge.howToEarn),
    );
    if (comingSoon) tileEl.append(el('div', 'trophy-case__badge-tag', 'COMING SOON'));
    return tileEl;
  }

  function goToPage(next: number): void {
    page = Math.min(Math.max(next, 0), pageCount() - 1);
    renderBadges();
  }

  function renderBadges(): void {
    const tiles = orderBadgeTiles(catalog, earned);
    const pages = pageCount();
    page = Math.min(page, pages - 1);
    badgesGrid.replaceChildren(
      ...tiles
        .slice(page * TROPHY_CASE_PAGE_SIZE, (page + 1) * TROPHY_CASE_PAGE_SIZE)
        .map(renderTile),
    );

    pager.hidden = pages <= 1;
    prevButton.disabled = page === 0;
    nextButton.disabled = page === pages - 1;
    dots.replaceChildren(
      ...Array.from({ length: pages }, (_, index) => {
        const dot = button('trophy-case__page-dot');
        dot.setAttribute('aria-label', `Page ${index + 1}`);
        if (index === page) dot.setAttribute('aria-current', 'page');
        dot.addEventListener('click', () => goToPage(index));
        return dot;
      }),
    );

    const earnedCount = catalog.filter((badge) => earned.includes(badge.id as BadgeId)).length;
    subtitle.textContent = `YOUR IGLOO · BADGES · ${earnedCount} / ${catalog.length}`;
  }

  prevButton.addEventListener('click', () => goToPage(page - 1));
  nextButton.addEventListener('click', () => goToPage(page + 1));

  // ArrowLeft / ArrowRight page while the BADGES tab is showing.
  function onKeydown(event: KeyboardEvent): void {
    if (overlay.hidden || panels.badges.hidden) return;
    if (event.key === 'ArrowLeft') goToPage(page - 1);
    else if (event.key === 'ArrowRight') goToPage(page + 1);
  }
  window.addEventListener('keydown', onKeydown);

  // ---- TROPHIES tab: static podium ----
  const trophiesPanel = el('div', 'trophy-case__trophies');
  trophiesPanel.append(el('div', 'trophy-case__trophies-title', 'HACKATHON TROPHIES'));
  const trophyRow = el('div', 'trophy-case__trophy-row');
  for (const trophy of TROPHIES) {
    const trophyEl = el('div', 'trophy-case__trophy');
    trophyEl.classList.toggle('trophy-case__trophy--earned', trophy.earned);
    trophyEl.append(
      el('div', 'trophy-case__trophy-rank', String(trophy.rank)),
      el('div', 'trophy-case__trophy-name', trophy.name),
    );
    trophyRow.append(trophyEl);
  }
  trophiesPanel.append(trophyRow);
  panels.trophies.append(trophiesPanel);

  // ---- JG AWARDS tab: static wall of frames ----
  const awardsPanel = el('div', 'trophy-case__awards');
  awardsPanel.append(el('div', 'trophy-case__awards-title', 'JG AWARDS · ON THE WALL'));
  const awardsRow = el('div', 'trophy-case__award-row');
  for (const award of AWARDS) {
    const awardEl = el('div', 'trophy-case__award');
    const image = document.createElement('img');
    image.className = 'trophy-case__award-image';
    image.src = award.src;
    image.alt = award.alt;
    awardEl.append(image);
    awardsRow.append(awardEl);
  }
  awardsPanel.append(awardsRow, el('div', 'trophy-case__awards-caption', AWARDS_CAPTION));
  panels.awards.append(awardsPanel);

  frame.append(header, tabsRow, body);
  overlay.append(frame);
  root.append(overlay);

  showTab('badges');

  // Nothing earned yet, before the first `open()` resolves.
  renderBadges();

  return {
    async open() {
      overlay.hidden = false;
      showTab('badges');
      page = 0;
      renderBadges();
      const snapshot = await options.store.loadAll();
      if (overlay.hidden) return; // Closed again before `loadAll` resolved.
      // A store that returns no catalog (an older fake) keeps the built-in one.
      if (snapshot.badgeCatalog?.length) catalog = snapshot.badgeCatalog;
      earned = snapshot.badges;
      renderBadges();
    },
    close() {
      overlay.hidden = true;
    },
    isOpen: () => !overlay.hidden,
    destroy() {
      window.removeEventListener('keydown', onKeydown);
      overlay.remove();
    },
  };
}
