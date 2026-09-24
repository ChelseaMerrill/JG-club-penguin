import type { Player } from '../auth/player';

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
 * Mounts the DOM login card (signed-out) and Player badge (signed-in) into
 * `root` (the `#ui` overlay layer). No full-screen backdrop: only the card
 * and badge themselves receive pointer events, via the `#ui > *` rule in
 * `style.css`.
 */
export function createLoginOverlay(
  root: HTMLElement,
  callbacks: LoginOverlayCallbacks,
): LoginOverlay {
  const card = document.createElement('div');
  card.className = 'login-card';
  // Hidden until auth resolves (`showSignedOut()` reveals it), so a
  // returning Player never sees a flash of a clickable login card.
  card.hidden = true;

  const signInButton = document.createElement('button');
  signInButton.type = 'button';
  signInButton.className = 'login-card__button';
  signInButton.textContent = 'Sign in with Google';
  signInButton.addEventListener('click', () => callbacks.onSignIn());

  const errorEl = document.createElement('p');
  errorEl.className = 'login-card__error';
  errorEl.setAttribute('role', 'alert');

  // A way out when a load error strands the Player with a live Supabase auth
  // session but no loaded Player row: shown only while an error is set.
  const errorSignOutButton = document.createElement('button');
  errorSignOutButton.type = 'button';
  errorSignOutButton.className = 'login-card__error-signout';
  errorSignOutButton.textContent = 'Sign out';
  errorSignOutButton.hidden = true;
  errorSignOutButton.addEventListener('click', () => callbacks.onSignOut());

  card.append(signInButton, errorEl, errorSignOutButton);

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

  root.append(card, badge);

  return {
    showSignedOut() {
      errorEl.textContent = '';
      errorSignOutButton.hidden = true;
      card.hidden = false;
      badge.hidden = true;
    },
    showSignedIn(player: Player) {
      nameEl.textContent = player.displayName;
      swatchEl.style.backgroundColor = player.look.body;
      swatchEl.dataset.penguinColor = player.look.body;
      errorEl.textContent = '';
      errorSignOutButton.hidden = true;
      card.hidden = true;
      badge.hidden = false;
    },
    showError(message: string) {
      errorEl.textContent = message;
      errorSignOutButton.hidden = !message;
      // The card starts hidden, so a load error on a fresh page must reveal it.
      if (message) card.hidden = false;
    },
    destroy() {
      card.remove();
      badge.remove();
    },
  };
}
