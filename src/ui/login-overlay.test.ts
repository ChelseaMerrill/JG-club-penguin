// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('shows a Sign in with Google button and hides the badge by default', () => {
    const { root } = setup();

    const button = root.querySelector('.login-card__button');
    expect(button?.textContent).toBe('Sign in with Google');
    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('clicking the sign-in button calls onSignIn', () => {
    const { root, onSignIn } = setup();

    (root.querySelector('.login-card__button') as HTMLButtonElement).click();

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('showSignedIn shows the badge with name, swatch color and hides the card', () => {
    const { root, overlay } = setup();

    overlay.showSignedIn({ id: 'user-1', displayName: 'Ada Lovelace', penguinColor: '#00bdff' });

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
    overlay.showSignedIn({ id: 'user-1', displayName: 'Ada Lovelace', penguinColor: '#00bdff' });

    (root.querySelector('.player-badge__signout') as HTMLButtonElement).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('showSignedOut shows the card again and hides the badge', () => {
    const { root, overlay } = setup();
    overlay.showSignedIn({ id: 'user-1', displayName: 'Ada Lovelace', penguinColor: '#00bdff' });

    overlay.showSignedOut();

    expect((root.querySelector('.login-card') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.player-badge') as HTMLElement).hidden).toBe(true);
  });

  it('showError renders the message in the card', () => {
    const { root, overlay } = setup();

    overlay.showError('Sign-in failed');

    expect(root.querySelector('.login-card__error')?.textContent).toBe('Sign-in failed');
  });
});
