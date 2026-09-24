// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK } from '../contracts';
import { LANDING_CROWD } from './landing-art';
import { createLoginOverlay } from './login-overlay';

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const onSignIn = vi.fn();
  const onSignOut = vi.fn();
  const overlay = createLoginOverlay(root, { onSignIn, onSignOut });
  return { root, overlay, onSignIn, onSignOut };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createLoginOverlay', () => {
  it('hides both the Landing page and the badge until auth resolves', () => {
    const { root } = setup();

    expect(root.querySelector('.landing__play')?.textContent).toBe('PLAY NOW');
    expect(root.querySelector('.landing__login')?.textContent).toBe('LOG IN');
    expect((root.querySelector('.landing') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('showSignedOut reveals the Landing page', () => {
    const { root, overlay } = setup();

    overlay.showSignedOut();

    expect((root.querySelector('.landing') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it.each(['.landing__play', '.landing__login'])('clicking %s calls onSignIn', (selector) => {
    const { root, overlay, onSignIn } = setup();
    overlay.showSignedOut();

    (root.querySelector(selector) as HTMLButtonElement).click();

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('draws the logo, the hero and the full crowd', () => {
    const { root } = setup();

    expect(root.querySelector('.landing__logo')?.getAttribute('aria-label')).toBe('Club JenGuin');
    expect(root.querySelector('.landing__hero svg')).not.toBeNull();
    expect(root.querySelectorAll('.landing__crowd .landing__bob svg')).toHaveLength(
      LANDING_CROWD.length,
    );
  });

  it('showSignedIn shows the badge with name, swatch color and hides the Landing page', () => {
    const { root, overlay } = setup();

    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    const badge = root.querySelector('.player-badge') as HTMLElement;
    const card = root.querySelector('.landing') as HTMLElement;
    const swatch = root.querySelector('.player-badge__swatch') as HTMLElement;

    expect(badge.hidden).toBe(false);
    expect(card.hidden).toBe(true);
    expect(badge.querySelector('.player-badge__name')?.textContent).toBe('Ada Lovelace');
    expect(swatch.dataset.penguinColor).toBe('#00bdff');
  });

  it('the badge has no Sign out button (signing out lives in the HUD MENU)', () => {
    const { root, overlay } = setup();
    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    const badge = root.querySelector('.player-badge') as HTMLElement;
    expect(badge.querySelector('button')).toBeNull();
  });

  it('showSignedOut shows the Landing page again and hides the badge', () => {
    const { root, overlay } = setup();
    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    overlay.showSignedOut();

    expect((root.querySelector('.landing') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('showError renders the message in the Landing page', () => {
    const { root, overlay } = setup();

    overlay.showError('Sign-in failed');

    expect(root.querySelector('.landing__error')?.textContent).toBe('Sign-in failed');
  });

  it('showError reveals the Landing page when it is still hidden (load error on a fresh page)', () => {
    const { root, overlay } = setup();

    overlay.showError('Unable to load player');

    expect((root.querySelector('.landing') as HTMLElement).hidden).toBe(false);
  });

  it('showError reveals a Sign out escape hatch, hidden again once the error clears', () => {
    const { root, overlay } = setup();
    const signOutButton = () => root.querySelector('.landing__error-signout') as HTMLElement;

    expect(signOutButton().hidden).toBe(true);

    overlay.showError('Unable to load player');

    expect(signOutButton().hidden).toBe(false);

    overlay.showError('');

    expect(signOutButton().hidden).toBe(true);
  });

  it('clicking the error Sign out button calls onSignOut', () => {
    const { root, overlay, onSignOut } = setup();
    overlay.showError('Unable to load player');

    (root.querySelector('.landing__error-signout') as HTMLButtonElement).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('showSignedIn and showSignedOut both clear the error and hide its Sign out button', () => {
    const { root, overlay } = setup();
    overlay.showError('Unable to load player');

    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    expect(root.querySelector('.landing__error')?.textContent).toBe('');
    expect((root.querySelector('.landing__error-signout') as HTMLElement).hidden).toBe(true);

    overlay.showError('Unable to load player');
    overlay.showSignedOut();

    expect(root.querySelector('.landing__error')?.textContent).toBe('');
    expect((root.querySelector('.landing__error-signout') as HTMLElement).hidden).toBe(true);
  });
});
