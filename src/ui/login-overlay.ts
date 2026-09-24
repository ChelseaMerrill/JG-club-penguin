import type { Player } from '../auth/player';
import { createLandingPage } from './landing-page';

export interface LoginOverlayCallbacks {
  onSignIn: () => void;
  onSignOut: () => void;
}

export interface LoginOverlay {
  showSignedOut(): void;
  showSignedIn(player: Player): void;
  showError(message: string): void;
  destroy(): void;
}

/**
 * Mounts the Landing page (signed-out) and Player badge (signed-in) into
 * `root` (the `#ui` overlay layer). The Landing page covers the whole Stage;
 * the badge is a small corner element, so the canvas keeps its input.
 */
export function createLoginOverlay(
  root: HTMLElement,
  callbacks: LoginOverlayCallbacks,
): LoginOverlay {
  const landing = createLandingPage(callbacks);
  // Hidden until auth resolves (`showSignedOut()` reveals it), so a
  // returning Player never sees a flash of the Landing page.
  landing.el.hidden = true;

  const badge = document.createElement('div');
  badge.className = 'player-badge';
  badge.hidden = true;

  const nameEl = document.createElement('span');
  nameEl.className = 'player-badge__name';

  const swatchEl = document.createElement('span');
  swatchEl.className = 'player-badge__swatch';

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'player-badge__signout';
  signOutButton.textContent = 'Sign out';
  signOutButton.addEventListener('click', () => callbacks.onSignOut());

  badge.append(nameEl, swatchEl, signOutButton);

  root.append(landing.el, badge);

  return {
    showSignedOut() {
      landing.setError('');
      landing.el.hidden = false;
      badge.hidden = true;
    },
    showSignedIn(player: Player) {
      nameEl.textContent = player.displayName;
      swatchEl.style.backgroundColor = player.look.body;
      swatchEl.dataset.penguinColor = player.look.body;
      landing.setError('');
      landing.el.hidden = true;
      badge.hidden = false;
    },
    showError(message: string) {
      landing.setError(message);
      // The Landing page starts hidden, so a load error on a fresh page must
      // reveal it.
      if (message) landing.el.hidden = false;
    },
    destroy() {
      landing.el.remove();
      badge.remove();
    },
  };
}
