// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK } from '../contracts/penguin';
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
  it('hides both the login card and the badge until auth resolves', () => {
    const { root } = setup();

    const button = root.querySelector('.login-card__button');
    expect(button?.textContent).toBe('Sign in with Google');
    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('showSignedOut reveals the login card', () => {
    const { root, overlay } = setup();

    overlay.showSignedOut();

    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('clicking the sign-in button calls onSignIn', () => {
    const { root, overlay, onSignIn } = setup();
    overlay.showSignedOut();

    (root.querySelector('.login-card__button') as HTMLButtonElement).click();

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('showSignedIn shows the badge with name, swatch color and hides the card', () => {
    const { root, overlay } = setup();

    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    const badge = root.querySelector('.player-badge') as HTMLElement;
    const card = root.querySelector('.login-card') as HTMLElement;
    const swatch = root.querySelector('.player-badge__swatch') as HTMLElement;

    expect(badge.hidden).toBe(false);
    expect(card.hidden).toBe(true);
    expect(badge.querySelector('.player-badge__name')?.textContent).toBe('Ada Lovelace');
    expect(swatch.dataset.penguinColor).toBe('#00bdff');
  });

  it('clicking sign out calls onSignOut', () => {
    const { root, overlay, onSignOut } = setup();
    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    (root.querySelector('.player-badge__signout') as HTMLButtonElement).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('showSignedOut shows the card again and hides the badge', () => {
    const { root, overlay } = setup();
    overlay.showSignedIn({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      look: { ...DEFAULT_LOOK, body: '#00bdff' },
    });

    overlay.showSignedOut();

    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('showError renders the message in the card', () => {
    const { root, overlay } = setup();

    overlay.showError('Sign-in failed');

    expect(root.querySelector('.login-card__error')?.textContent).toBe('Sign-in failed');
  });

  it('showError reveals the card when it is still hidden (load error on a fresh page)', () => {
    const { root, overlay } = setup();

    overlay.showError('Unable to load player');

    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(false);
  });

  it('showError reveals a Sign out escape hatch, hidden again once the error clears', () => {
    const { root, overlay } = setup();
    const signOutButton = () => root.querySelector('.login-card__error-signout') as HTMLElement;

    expect(signOutButton().hidden).toBe(true);

    overlay.showError('Unable to load player');

    expect(signOutButton().hidden).toBe(false);

    overlay.showError('');

    expect(signOutButton().hidden).toBe(true);
  });

  it('clicking the error Sign out button calls onSignOut', () => {
    const { root, overlay, onSignOut } = setup();
    overlay.showError('Unable to load player');

    (root.querySelector('.login-card__error-signout') as HTMLButtonElement).click();

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

    expect(root.querySelector('.login-card__error')?.textContent).toBe('');
    expect((root.querySelector('.login-card__error-signout') as HTMLElement).hidden).toBe(true);

    overlay.showError('Unable to load player');
    overlay.showSignedOut();

    expect(root.querySelector('.login-card__error')?.textContent).toBe('');
    expect((root.querySelector('.login-card__error-signout') as HTMLElement).hidden).toBe(true);
  });
});
