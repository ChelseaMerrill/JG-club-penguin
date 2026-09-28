// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BADGE_POPUP_MS,
  createBadgePopup,
  renderBadgeUnlock,
  type BadgePopup,
  type BadgePopupBlocker,
} from './badge-unlock-panel';

/** A blocker the test drives by hand, standing in for the QUEST COMPLETE banner. */
function fakeBlocker(): BadgePopupBlocker & { set(visible: boolean): void } {
  let visible = false;
  const listeners = new Set<(visible: boolean) => void>();
  return {
    isVisible: () => visible,
    onVisibilityChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      visible = next;
      for (const listener of listeners) listener(next);
    },
  };
}

let popups: BadgePopup[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  for (const popup of popups) popup.destroy();
  popups = [];
  vi.useRealTimers();
});

function setup(blockers: BadgePopupBlocker[] = []) {
  const root = document.createElement('div');
  document.body.append(root);
  const popup = createBadgePopup(root, { blockers });
  popups.push(popup);
  const panel = () => root.querySelector<HTMLElement>('.badge-popup')!;
  const text = () => (panel().hidden ? null : panel().textContent);
  return { root, popup, panel, text };
}

describe('renderBadgeUnlock', () => {
  it("renders the done screen's panel markup, unchanged without a bonus", () => {
    const panel = renderBadgeUnlock('Badge unlocked: Exterminator');

    expect(panel.className).toBe('minigame__done-badge');
    expect([...panel.children].map((child) => [child.className, child.textContent])).toEqual([
      ['minigame__done-badge-name', 'Badge unlocked: Exterminator'],
      ['minigame__done-badge-caption', 'ADDED TO YOUR TROPHY CASE'],
    ]);
  });

  it('adds a +N TOKENS line with a bonus', () => {
    const panel = renderBadgeUnlock('Badge unlocked: Ship It', { bonus: 50 });

    expect(panel.querySelector('.minigame__done-badge-bonus')?.textContent).toBe('+50 TOKENS');
  });
});

describe('createBadgePopup', () => {
  it('shows the panel with +50 TOKENS, and dismisses it 6 s after it appears', () => {
    const { popup, text, panel } = setup();

    popup.show('ship-it');

    expect(text()).toContain('Badge unlocked: Ship It');
    expect(text()).toContain('+50 TOKENS');
    vi.advanceTimersByTime(BADGE_POPUP_MS - 1);
    expect(panel().hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(panel().hidden).toBe(true);
  });

  it('closes on a click on the panel', () => {
    const { popup, panel } = setup();

    popup.show('first-waddle');
    panel().click();

    expect(panel().hidden).toBe(true);
    expect(popup.current()).toBeNull();
  });

  it('queues popups one at a time, each for its own full 6 s', () => {
    const { popup, text } = setup();

    popup.show('first-waddle');
    popup.show('night-owl');

    expect(text()).toContain('First Waddle');
    vi.advanceTimersByTime(BADGE_POPUP_MS);
    expect(text()).toContain('Night Owl');
    vi.advanceTimersByTime(BADGE_POPUP_MS - 1);
    expect(text()).toContain('Night Owl');
    vi.advanceTimersByTime(1);
    expect(text()).toBeNull();
  });

  it('falls back to the catalog name for an id this build has no name for', () => {
    const { popup, text } = setup();

    popup.show('stair-master');

    expect(text()).toContain('Badge unlocked: Stair Master');
  });

  it('waits while a blocker is visible, then shows for a full 6 s after it hides', () => {
    const banner = fakeBlocker();
    const { popup, panel } = setup([banner]);
    banner.set(true);

    popup.show('ship-it');
    expect(panel().hidden).toBe(true);
    vi.advanceTimersByTime(BADGE_POPUP_MS * 2);
    expect(panel().hidden).toBe(true);

    banner.set(false);
    expect(panel().hidden).toBe(false);
    vi.advanceTimersByTime(BADGE_POPUP_MS - 1);
    expect(panel().hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(panel().hidden).toBe(true);
  });

  it('hides a showing popup when a blocker appears, and re-shows it for a full 6 s after', () => {
    const banner = fakeBlocker();
    const { popup, panel, text } = setup([banner]);

    // The real order: the store announces Ship It just before the Quest
    // controller shows the QUEST COMPLETE banner.
    popup.show('ship-it');
    expect(panel().hidden).toBe(false);
    vi.advanceTimersByTime(1000);
    banner.set(true);
    expect(panel().hidden).toBe(true);

    vi.advanceTimersByTime(4000);
    banner.set(false);
    expect(text()).toContain('Ship It');
    vi.advanceTimersByTime(BADGE_POPUP_MS - 1);
    expect(panel().hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(panel().hidden).toBe(true);
  });

  it('is never visible at the same time as a blocker, at any step', () => {
    const banner = fakeBlocker();
    const { popup, panel } = setup([banner]);
    const neverBoth = () => expect(banner.isVisible() && !panel().hidden).toBe(false);

    popup.show('ship-it');
    neverBoth();
    banner.set(true);
    neverBoth();
    popup.show('first-waddle');
    neverBoth();
    vi.advanceTimersByTime(BADGE_POPUP_MS * 3);
    neverBoth();
    banner.set(false);
    neverBoth();
    banner.set(true);
    neverBoth();
    banner.set(false);
    vi.advanceTimersByTime(BADGE_POPUP_MS);
    neverBoth();
    vi.advanceTimersByTime(BADGE_POPUP_MS);
    neverBoth();
    expect(panel().hidden).toBe(true);
  });

  it('puts the clickable panel inside its full-Stage layer (the CSS makes only the panel take clicks)', () => {
    const { root } = setup();

    expect(root.querySelector('.badge-popup-layer')).not.toBeNull();
    expect(root.querySelector('.badge-popup-layer > .badge-popup')).not.toBeNull();
  });
});
