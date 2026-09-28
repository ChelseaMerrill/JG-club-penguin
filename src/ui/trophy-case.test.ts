// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, type BadgeId } from '../contracts';
import { BADGE_CATALOG } from '../persistence/badge-catalog';
import {
  emptySlots,
  type BadgeDefinition,
  type ProgressSnapshot,
} from '../persistence/progress-store';
import {
  createTrophyCase,
  orderBadgeTiles,
  TROPHY_CASE_PAGE_SIZE,
  type TrophyCase,
} from './trophy-case';

function snapshotWith(
  badges: BadgeId[],
  badgeCatalog: BadgeDefinition[] = [...BADGE_CATALOG],
): ProgressSnapshot {
  return {
    look: DEFAULT_LOOK,
    profileCreatedAt: null,
    tokens: 0,
    badges,
    bests: {},
    ownedItems: [],
    slots: emptySlots(),
    catalog: [],
    badgeCatalog,
  };
}

/** A synthetic catalog of `count` Badges, the first `available` of them earnable. */
function syntheticCatalog(count: number, available = count): BadgeDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `badge-${index + 1}`,
    name: `Badge ${index + 1}`,
    howToEarn: `HINT ${index + 1}`,
    sortOrder: index + 1,
    available: index < available,
  }));
}

let currentTrophyCase: TrophyCase | undefined;

function setup(badges: BadgeId[] = [], badgeCatalog?: BadgeDefinition[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const onClose = vi.fn();
  const loadAll = vi.fn().mockResolvedValue(snapshotWith(badges, badgeCatalog));
  const trophyCase = createTrophyCase(root, { store: { loadAll }, onClose });
  currentTrophyCase = trophyCase;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends Element = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(selector),
  ];
  const tileIds = () => qa('.trophy-case__badge').map((tile) => tile.dataset.badgeId);
  const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  return { root, trophyCase, onClose, loadAll, q, qa, tileIds, press };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentTrophyCase?.destroy();
  currentTrophyCase = undefined;
});

describe('orderBadgeTiles', () => {
  it('puts earned Badges first, then locked, then coming soon, each by sortOrder', () => {
    const ordered = orderBadgeTiles(BADGE_CATALOG, ['night-owl', 'exterminator']);

    expect(ordered.map((badge) => badge.id)).toEqual([
      'exterminator',
      'night-owl',
      'first-waddle',
      'ship-it',
      'breakfast-club',
      'brain-freeze',
      'barista',
      'interior-penguin',
      'snowmageddon',
      'rail-rider',
      'hexle-parent',
      'mullet-mania',
      'let-it-rip',
      'stair-master',
      'phish-fry',
    ]);
  });
});

describe('createTrophyCase', () => {
  it('is hidden until opened', () => {
    const { q, trophyCase } = setup();

    expect(q('.trophy-case').hidden).toBe(true);
    expect(trophyCase.isOpen()).toBe(false);
  });

  it('renders the BADGES, TROPHIES and JG AWARDS tabs', () => {
    const { qa } = setup();

    const tabs = qa<HTMLButtonElement>('.trophy-case__tab').map((b) => b.textContent);
    expect(tabs).toEqual(['BADGES', 'TROPHIES', 'JG AWARDS']);
  });

  it('opens on the BADGES tab, loads the store, and counts earned Badges across the whole catalog', async () => {
    const { q, trophyCase, loadAll } = setup(['exterminator']);

    await trophyCase.open();

    expect(loadAll).toHaveBeenCalledTimes(1);
    expect(q('.trophy-case').hidden).toBe(false);
    expect(q('[data-panel="badges"]').hidden).toBe(false);
    expect(q('[data-panel="trophies"]').hidden).toBe(true);
    expect(q('[data-panel="awards"]').hidden).toBe(true);
    expect(q('.trophy-case__subtitle').textContent).toBe('YOUR IGLOO · BADGES · 1 / 15');
  });

  it('shows 15 Badges over two pages: 12 on page 1 and 3 on page 2', async () => {
    const { q, qa, trophyCase } = setup([]);

    await trophyCase.open();

    expect(qa('.trophy-case__badge')).toHaveLength(TROPHY_CASE_PAGE_SIZE);
    expect(qa('.trophy-case__page-dot')).toHaveLength(2);
    expect(q('.trophy-case__pager').hidden).toBe(false);

    q<HTMLButtonElement>('[aria-label="Next page"]').click();

    expect(qa('.trophy-case__badge')).toHaveLength(3);
  });

  it.each([
    [12, 1],
    [13, 2],
    [15, 2],
    [25, 3],
  ])('pages a %i-Badge catalog into %i page(s), with no code change', async (count, pages) => {
    const { q, qa, trophyCase } = setup([], syntheticCatalog(count));

    await trophyCase.open();

    expect(q('.trophy-case__subtitle').textContent).toBe(`YOUR IGLOO · BADGES · 0 / ${count}`);
    expect(q('.trophy-case__pager').hidden).toBe(pages === 1);
    expect(qa('.trophy-case__page-dot')).toHaveLength(pages);
  });

  it('shows an earned Badge unlocked, a locked one with its hint, and a coming-soon one with its tag', async () => {
    const { q, trophyCase } = setup(['exterminator']);

    await trophyCase.open();

    const exterminator = q('[data-badge-id="exterminator"]');
    expect(exterminator.classList.contains('trophy-case__badge--earned')).toBe(true);
    expect(exterminator.querySelector('.trophy-case__badge-icon')?.textContent).toBe('✓');
    expect(exterminator.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      '500 · BUG SQUASH',
    );

    const breakfastClub = q('[data-badge-id="breakfast-club"]');
    expect(breakfastClub.classList.contains('trophy-case__badge--earned')).toBe(false);
    expect(breakfastClub.querySelector('.trophy-case__badge-icon')?.textContent).toBe('?');
    expect(breakfastClub.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      '20 STACKED · PANCAKE FLIP',
    );
    expect(breakfastClub.querySelector('.trophy-case__badge-tag')).toBeNull();

    const nightOwl = q('[data-badge-id="night-owl"]');
    expect(nightOwl.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      'ONLINE 2–5 AM ET',
    );

    const snowmageddon = q('[data-badge-id="snowmageddon"]');
    expect(snowmageddon.classList.contains('trophy-case__badge--coming-soon')).toBe(true);
    expect(snowmageddon.querySelector('.trophy-case__badge-tag')?.textContent).toBe('COMING SOON');
    expect(snowmageddon.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      '5 SNOWBALL HITS / DAY',
    );
  });

  it('pages with the arrows and the dots, disabling the arrows at the ends', async () => {
    const { q, qa, trophyCase, tileIds } = setup([]);
    await trophyCase.open();
    const prev = q<HTMLButtonElement>('[aria-label="Previous page"]');
    const next = q<HTMLButtonElement>('[aria-label="Next page"]');
    const firstPage = tileIds();

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(q('[aria-label="Page 1"]').getAttribute('aria-current')).toBe('page');

    next.click();
    expect(tileIds()).toEqual(['let-it-rip', 'stair-master', 'phish-fry']);
    expect(q<HTMLButtonElement>('[aria-label="Next page"]').disabled).toBe(true);
    expect(q('[aria-label="Page 2"]').getAttribute('aria-current')).toBe('page');

    qa<HTMLButtonElement>('.trophy-case__page-dot')[0].click();
    expect(tileIds()).toEqual(firstPage);
  });

  it('pages with ArrowLeft and ArrowRight while the BADGES tab shows, and not on another tab', async () => {
    const { q, trophyCase, tileIds, press } = setup([]);
    await trophyCase.open();
    const firstPage = tileIds();

    press('ArrowRight');
    expect(tileIds()).toHaveLength(3);
    press('ArrowRight'); // Already on the last page.
    expect(tileIds()).toHaveLength(3);
    press('ArrowLeft');
    expect(tileIds()).toEqual(firstPage);

    q<HTMLButtonElement>('[data-tab="trophies"]').click();
    press('ArrowRight');
    q<HTMLButtonElement>('[data-tab="badges"]').click();
    expect(tileIds()).toEqual(firstPage);
  });

  it('resets to page 1 every time it opens', async () => {
    const { trophyCase, tileIds, press } = setup([]);
    await trophyCase.open();
    const firstPage = tileIds();
    press('ArrowRight');

    trophyCase.close();
    await trophyCase.open();

    expect(tileIds()).toEqual(firstPage);
  });

  it('re-reads the store every time it opens', async () => {
    const { trophyCase, loadAll, q } = setup([]);

    await trophyCase.open();
    expect(
      q('[data-badge-id="exterminator"]').classList.contains('trophy-case__badge--earned'),
    ).toBe(false);

    loadAll.mockResolvedValueOnce(snapshotWith(['exterminator']));
    trophyCase.close();
    await trophyCase.open();

    expect(loadAll).toHaveBeenCalledTimes(2);
    expect(
      q('[data-badge-id="exterminator"]').classList.contains('trophy-case__badge--earned'),
    ).toBe(true);
  });

  it('switches tabs, showing the static TROPHIES and JG AWARDS content', async () => {
    const { q, qa, trophyCase } = setup();
    await trophyCase.open();

    q<HTMLButtonElement>('[data-tab="trophies"]').click();

    expect(q('[data-panel="badges"]').hidden).toBe(true);
    expect(q('[data-panel="trophies"]').hidden).toBe(false);
    expect(q('.trophy-case__trophy-name').textContent).toBe('Team Pod · Ship It');
    expect(q('[data-tab="trophies"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-tab="badges"]').getAttribute('aria-pressed')).toBe('false');

    q<HTMLButtonElement>('[data-tab="awards"]').click();

    expect(q('[data-panel="trophies"]').hidden).toBe(true);
    expect(q('[data-panel="awards"]').hidden).toBe(false);
    const images = qa<HTMLImageElement>('.trophy-case__award-image');
    expect(images.map((img) => img.alt)).toEqual([
      'Best Places to Work',
      'Inc. 5000',
      'Top Workplaces',
    ]);
  });

  it('the close button calls onClose, leaving Escape to the OverlayManager', async () => {
    const { q, trophyCase, onClose } = setup();
    await trophyCase.open();

    q<HTMLButtonElement>('.trophy-case__close').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close() hides the overlay', async () => {
    const { q, trophyCase } = setup();
    await trophyCase.open();

    trophyCase.close();

    expect(q('.trophy-case').hidden).toBe(true);
    expect(trophyCase.isOpen()).toBe(false);
  });
});
