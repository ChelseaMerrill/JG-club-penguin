import { createLandingPage } from './landing-page';

export interface LoginOverlayCallbacks {
  onSignIn: () => void;
  onSignOut: () => void;
}

export interface LoginOverlay {
  showSignedOut(): void;
  showSignedIn(): void;
  showError(message: string): void;
  destroy(): void;
}

/**
 * Mounts the signed-out Landing page into `root` (the `#ui` overlay layer).
 * It covers the whole Stage while signed out and is hidden once signed in;
 * the signed-in chrome (including Sign out) is the HUD (#32).
 */
export function createLoginOverlay(
  root: HTMLElement,
  callbacks: LoginOverlayCallbacks,
): LoginOverlay {
  const landing = createLandingPage(callbacks);
  // Hidden until auth resolves (`showSignedOut()` reveals it), so a
  // returning Player never sees a flash of the Landing page.
  landing.el.hidden = true;

  root.append(landing.el);

  return {
    showSignedOut() {
      landing.setError('');
      landing.el.hidden = false;
    },
    showSignedIn() {
      landing.setError('');
      landing.el.hidden = true;
    },
    showError(message: string) {
      landing.setError(message);
      // The Landing page starts hidden, so a load error on a fresh page must
      // reveal it.
      if (message) landing.el.hidden = false;
    },
    destroy() {
      landing.el.remove();
    },
  };
}
