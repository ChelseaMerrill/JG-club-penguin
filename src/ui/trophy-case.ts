import type { BadgeId } from '../contracts';
import { badgeDisplayName } from '../minigames/badge-names';
import type { ProgressStore } from '../persistence/progress-store';
import './trophy-case.css';

/** The id `main.ts` registers this overlay with on `hud.overlays`. */
export const TROPHY_CASE_OVERLAY_ID = 'trophy-case';

type TabId = 'badges' | 'trophies' | 'awards';

interface BadgeTile {
  /**
   * Exactly the design's tile title (`design/Trophy Case.dc.html`); equal to
   * `badgeDisplayName(badgeId)` for the three tiles this build can actually
   * earn.
   */
  title: string;
  /**
   * The design's own hint text, except "Breakfast Club": the design says
   * "20 SERVED · COFFEE RUSH", but Breakfast Club is Pancake Flip's Badge
   * (20 stacked, `minigame-rules.ts`), so its hint names Pancake Flip.
   */
  hint: string;
  /**
   * `null` for a design badge this build has no earning logic for yet (it
   * always renders locked). A real `BadgeId` otherwise.
   */
  badgeId: BadgeId | null;
}

/**
 * The Trophy Case's 12 BADGES tiles, in the design's own order. Four carry
 * a real `BadgeId` that `ProgressStore.loadAll` can report earned: one per
 * Minigame (Breakfast Club/Pancake Flip, Brain Freeze/Snow Cone Stand,
 * Exterminator/Bug Squash, Barista/Coffee Rush). The design has no Barista
 * tile, so Barista takes the design's "Let It Rip · WIN 3 BEY MATCHES" slot,
 * which has no game behind it. The other eight have no earning logic in this
 * prototype and always render locked with their design hint.
 */
const BADGE_TILES: readonly BadgeTile[] = [
  { title: 'First Waddle', hint: 'LOG IN', badgeId: null },
  { title: 'Snowmageddon', hint: '5 SNOWBALL HITS / DAY', badgeId: null },
  { title: 'Ship It', hint: 'FINISH THE MAIN QUEST', badgeId: null },
  { title: 'Breakfast Club', hint: '20 STACKED · PANCAKE FLIP', badgeId: 'breakfast-club' },
  { title: 'Brain Freeze', hint: '200 TOKENS · SNOW CONES', badgeId: 'brain-freeze' },
  { title: 'Exterminator', hint: '500 · BUG SQUASH', badgeId: 'exterminator' },
  { title: 'Barista', hint: '15 CUPS · COFFEE RUSH', badgeId: 'barista' },
  { title: 'Rail Rider', hint: 'SLIDE THE STAIRWELL', badgeId: null },
  { title: 'Hexle Parent', hint: 'ADOPT A HEXLE', badgeId: null },
  { title: 'Interior Penguin', hint: '6 IGLOO ITEMS', badgeId: null },
  { title: 'Night Owl', hint: 'ONLINE AFTER 2AM', badgeId: null },
  { title: 'Mullet Mania', hint: 'HIGH SCORE · ARCADE', badgeId: null },
];

/** The design's "n / 12 BADGES" denominator. */
export const TROPHY_CASE_BADGE_SLOTS = BADGE_TILES.length;

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

  // ---- BADGES tab: the 12-tile grid ----
  const badgesGrid = el('div', 'trophy-case__badges');
  panels.badges.append(badgesGrid);

  const badgeTiles = BADGE_TILES.map((tile) => {
    const tileEl = el('div', 'trophy-case__badge');
    tileEl.dataset.badgeId = tile.badgeId ?? '';
    const icon = el('div', 'trophy-case__badge-icon');
    const name = el(
      'div',
      'trophy-case__badge-name',
      tile.badgeId ? badgeDisplayName(tile.badgeId) : tile.title,
    );
    const hint = el('div', 'trophy-case__badge-hint', tile.hint);
    tileEl.append(icon, name, hint);
    badgesGrid.append(tileEl);
    return { tile, tileEl, icon };
  });

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

  function renderCount(earnedCount: number): void {
    subtitle.textContent = `YOUR IGLOO · ${earnedCount} / ${TROPHY_CASE_BADGE_SLOTS} BADGES`;
  }

  function applyBadges(earnedBadges: readonly BadgeId[]): void {
    let earnedCount = 0;
    for (const { tile, tileEl, icon } of badgeTiles) {
      const earned = tile.badgeId !== null && earnedBadges.includes(tile.badgeId);
      if (earned) earnedCount += 1;
      tileEl.classList.toggle('trophy-case__badge--earned', earned);
      icon.textContent = earned ? '✓' : '?';
    }
    renderCount(earnedCount);
  }

  // Nothing earned yet, before the first `open()` resolves.
  applyBadges([]);

  return {
    async open() {
      overlay.hidden = false;
      showTab('badges');
      const snapshot = await options.store.loadAll();
      if (overlay.hidden) return; // Closed again before `loadAll` resolved.
      applyBadges(snapshot.badges);
    },
    close() {
      overlay.hidden = true;
    },
    isOpen: () => !overlay.hidden,
    destroy() {
      overlay.remove();
    },
  };
}
