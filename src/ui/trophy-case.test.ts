// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, type BadgeId } from '../contracts';
import { emptySlots, type ProgressSnapshot } from '../persistence/progress-store';
import { createTrophyCase, TROPHY_CASE_BADGE_SLOTS, type TrophyCase } from './trophy-case';

function snapshotWith(badges: BadgeId[]): ProgressSnapshot {
  return {
    look: DEFAULT_LOOK,
    profileCreatedAt: null,
    tokens: 0,
    badges,
    bests: {},
    ownedItems: [],
    slots: emptySlots(),
    catalog: [],
  };
}

let currentTrophyCase: TrophyCase | undefined;

function setup(badges: BadgeId[] = []) {
  const root = document.createElement('div');
  document.body.append(root);
  const onClose = vi.fn();
  const loadAll = vi.fn().mockResolvedValue(snapshotWith(badges));
  const trophyCase = createTrophyCase(root, { store: { loadAll }, onClose });
  currentTrophyCase = trophyCase;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends Element = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(selector),
  ];
  return { root, trophyCase, onClose, loadAll, q, qa };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentTrophyCase?.destroy();
  currentTrophyCase = undefined;
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

  it('opens on the BADGES tab, loads the store, and shows the "n / 12 BADGES" count', async () => {
    const { q, trophyCase, loadAll } = setup(['exterminator']);

    await trophyCase.open();

    expect(loadAll).toHaveBeenCalledTimes(1);
    expect(q('.trophy-case').hidden).toBe(false);
    expect(q('[data-panel="badges"]').hidden).toBe(false);
    expect(q('[data-panel="trophies"]').hidden).toBe(true);
    expect(q('[data-panel="awards"]').hidden).toBe(true);
    expect(q('.trophy-case__subtitle').textContent).toBe(
      `YOUR IGLOO · 1 / ${TROPHY_CASE_BADGE_SLOTS} BADGES`,
    );
  });

  it("shows Beystadium's Let It Rip in the design's own 7th slot, unlocked once earned", async () => {
    const { q, qa, trophyCase } = setup(['let-it-rip']);

    await trophyCase.open();

    const letItRip = q('[data-badge-id="let-it-rip"]');
    expect(letItRip.classList.contains('trophy-case__badge--earned')).toBe(true);
    expect(letItRip.querySelector('.trophy-case__badge-name')?.textContent).toBe('Let It Rip');
    expect(letItRip.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      'WIN 3 BEY MATCHES',
    );
    expect(qa('.trophy-case__badge').indexOf(letItRip)).toBe(6);
  });

  it("shows Coffee Rush's Barista in the Mullet Mania slot (12th), unlocked once earned", async () => {
    const { q, qa, trophyCase } = setup(['barista']);

    await trophyCase.open();

    const barista = q('[data-badge-id="barista"]');
    expect(barista.classList.contains('trophy-case__badge--earned')).toBe(true);
    expect(barista.querySelector('.trophy-case__badge-name')?.textContent).toBe('Barista');
    expect(barista.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      '15 CUPS · COFFEE RUSH',
    );
    expect(qa('.trophy-case__badge').indexOf(barista)).toBe(11);
    const names = qa('.trophy-case__badge-name').map((el) => el.textContent);
    expect(names).not.toContain('Mullet Mania');
    expect(names).toHaveLength(12);
  });

  it('renders an earned Badge unlocked and the rest locked with their design hint', async () => {
    const { q, qa, trophyCase } = setup(['exterminator']);

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
    // Pancake Flip's Badge, not Coffee Rush's (the design's copy names the wrong game).
    expect(breakfastClub.querySelector('.trophy-case__badge-hint')?.textContent).toBe(
      '20 STACKED · PANCAKE FLIP',
    );

    // All 12 design tiles are present, each with its own hint.
    expect(qa('.trophy-case__badge')).toHaveLength(TROPHY_CASE_BADGE_SLOTS);
    const firstWaddle = q('[data-badge-id=""]');
    expect(firstWaddle.querySelector('.trophy-case__badge-name')?.textContent).toBe('First Waddle');
    expect(firstWaddle.querySelector('.trophy-case__badge-hint')?.textContent).toBe('LOG IN');
    expect(firstWaddle.classList.contains('trophy-case__badge--earned')).toBe(false);
  });

  it('re-reads the store every time it opens (no persistence yet, #34)', async () => {
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
