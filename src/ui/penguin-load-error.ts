import './penguin-load-error.css';

export interface PenguinLoadErrorCallbacks {
  onRetry: () => void;
  onSignOut: () => void;
}

export interface PenguinLoadError {
  /** Shows the panel with `detail` (the raw load error) and focuses TRY AGAIN. */
  show(detail: string): void;
  hide(): void;
  /** Disables TRY AGAIN (reading TRYING…) while a retry is in flight. */
  setRetrying(on: boolean): void;
  isOpen(): boolean;
  destroy(): void;
}

const RETRY_LABEL = 'TRY AGAIN';
const RETRYING_LABEL = 'TRYING…';

/**
 * The retryable "Couldn't load your Penguin" state (#164): shown instead of
 * the Penguin Creator when the sign-in load fails, so a Player with a saved
 * Penguin is never invited to create (and save over) a new one. A full-Stage
 * plain DOM overlay in the `#ui` layer, like the Creator, so the Stage can't
 * be clicked behind it. It is deliberately not registered with the HUD's
 * `OverlayManager`, which would let Escape close it: the only ways out are
 * TRY AGAIN (a load that succeeds) and Sign out.
 *
 * While open, a single `document`-level keydown listener keeps Tab on the
 * panel's enabled buttons even once focus has fallen to `body` (#164 RT W2).
 * `setRetrying(true)` moves focus to Sign out before disabling TRY AGAIN, so
 * focus never drops to `body` while a retry is in flight. `show()` and
 * `hide()` both reset the retrying state (#164 RT W1).
 */
export function createPenguinLoadError(
  root: HTMLElement,
  callbacks: PenguinLoadErrorCallbacks,
): PenguinLoadError {
  const el = document.createElement('div');
  el.className = 'penguin-load-error';
  el.hidden = true;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'penguin-load-error-title');
  el.setAttribute('aria-describedby', 'penguin-load-error-body penguin-load-error-detail');

  const card = document.createElement('div');
  card.className = 'penguin-load-error__card';

  const title = document.createElement('h2');
  title.className = 'penguin-load-error__title';
  title.id = 'penguin-load-error-title';
  title.textContent = "Couldn't load your Penguin";

  const body = document.createElement('p');
  body.className = 'penguin-load-error__body';
  body.id = 'penguin-load-error-body';
  body.textContent =
    "Your Penguin is safe. We just couldn't reach it right now. Check your connection, then try again.";

  const detail = document.createElement('p');
  detail.className = 'penguin-load-error__detail';
  detail.id = 'penguin-load-error-detail';

  const actions = document.createElement('div');
  actions.className = 'penguin-load-error__actions';

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'penguin-load-error__retry';
  retryButton.textContent = RETRY_LABEL;
  retryButton.addEventListener('click', () => callbacks.onRetry());

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'penguin-load-error__signout';
  signOutButton.textContent = 'Sign out';
  signOutButton.addEventListener('click', () => callbacks.onSignOut());

  const status = document.createElement('p');
  status.className = 'penguin-load-error__status';
  status.setAttribute('role', 'status');

  actions.append(retryButton, signOutButton);
  card.append(title, body, detail, actions, status);
  el.append(card);
  root.append(el);

  let trapping = false;

  function enabledButtons(): HTMLButtonElement[] {
    return [retryButton, signOutButton].filter((button) => !button.disabled);
  }

  // One stable reference, so a repeated `show()` never adds it twice and a
  // single `removeEventListener` always removes it (#164 RT round 2 M1).
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const buttons = enabledButtons();
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) {
      buttons[0].focus();
      return;
    }
    const step = event.shiftKey ? -1 : 1;
    buttons[(index + step + buttons.length) % buttons.length].focus();
  }

  function startTrap(): void {
    if (trapping) return;
    trapping = true;
    document.addEventListener('keydown', onDocumentKeydown);
  }

  function stopTrap(): void {
    if (!trapping) return;
    trapping = false;
    document.removeEventListener('keydown', onDocumentKeydown);
  }

  function setRetrying(on: boolean): void {
    if (on) {
      // Focus Sign out first, so disabling the focused TRY AGAIN never drops
      // focus to `body` (#164 RT W2).
      signOutButton.focus();
      retryButton.disabled = true;
      retryButton.textContent = RETRYING_LABEL;
      el.setAttribute('aria-busy', 'true');
      status.textContent = 'Trying again…';
    } else {
      retryButton.disabled = false;
      retryButton.textContent = RETRY_LABEL;
      el.removeAttribute('aria-busy');
      status.textContent = '';
    }
  }

  return {
    show(message) {
      setRetrying(false);
      detail.textContent = message;
      el.hidden = false;
      startTrap();
      retryButton.focus();
    },
    hide() {
      setRetrying(false);
      el.hidden = true;
      stopTrap();
    },
    setRetrying,
    isOpen: () => !el.hidden,
    destroy() {
      stopTrap();
      el.remove();
    },
  };
}
