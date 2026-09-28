// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPenguinLoadError, type PenguinLoadError } from './penguin-load-error';

let root: HTMLElement;
let panel: PenguinLoadError;
let onRetry: ReturnType<typeof vi.fn<() => void>>;
let onSignOut: ReturnType<typeof vi.fn<() => void>>;

function el(): HTMLElement {
  return root.querySelector<HTMLElement>('.penguin-load-error')!;
}
function retryButton(): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('.penguin-load-error__retry')!;
}
function signOutButton(): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('.penguin-load-error__signout')!;
}
function tab(shiftKey = false): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }));
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  onRetry = vi.fn<() => void>();
  onSignOut = vi.fn<() => void>();
  panel = createPenguinLoadError(root, { onRetry, onSignOut });
});

afterEach(() => {
  panel.destroy();
  root.remove();
});

describe('createPenguinLoadError', () => {
  it('starts hidden, with an accessible alertdialog labelled by its title and described by its body and detail', () => {
    expect(el().hidden).toBe(true);
    expect(panel.isOpen()).toBe(false);
    expect(el().getAttribute('role')).toBe('alertdialog');
    expect(el().getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(el().getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe("Couldn't load your Penguin");
    const [bodyId, detailId] = el().getAttribute('aria-describedby')!.split(' ');
    expect(document.getElementById(bodyId)?.textContent).toBe(
      "Your Penguin is safe. We just couldn't reach it right now. Check your connection, then try again.",
    );
    expect(document.getElementById(detailId)?.className).toBe('penguin-load-error__detail');
  });

  it('show(detail) un-hides it, renders the raw detail and focuses TRY AGAIN', () => {
    panel.show('column shop_items.placement does not exist');

    expect(el().hidden).toBe(false);
    expect(panel.isOpen()).toBe(true);
    expect(root.querySelector('.penguin-load-error__detail')?.textContent).toBe(
      'column shop_items.placement does not exist',
    );
    expect(retryButton().textContent).toBe('TRY AGAIN');
    expect(signOutButton().textContent).toBe('Sign out');
    expect(document.activeElement).toBe(retryButton());
  });

  it('clicks call onRetry and onSignOut', () => {
    panel.show('x');
    retryButton().click();
    signOutButton().click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('setRetrying(true) moves focus to Sign out, then disables TRY AGAIN with TRYING…, aria-busy and a status (RT W2)', () => {
    panel.show('x');

    panel.setRetrying(true);

    expect(document.activeElement).toBe(signOutButton());
    expect(retryButton().disabled).toBe(true);
    expect(retryButton().textContent).toBe('TRYING…');
    expect(el().getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Trying again…');
    expect(signOutButton().disabled).toBe(false);
  });

  it('setRetrying(false) restores TRY AGAIN, its text, aria-busy and the status', () => {
    panel.show('x');
    panel.setRetrying(true);

    panel.setRetrying(false);

    expect(retryButton().disabled).toBe(false);
    expect(retryButton().textContent).toBe('TRY AGAIN');
    expect(el().hasAttribute('aria-busy')).toBe(false);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('show() after setRetrying(true) resets to an enabled, focused TRY AGAIN (RT W1)', () => {
    panel.show('a');
    panel.setRetrying(true);

    panel.show('b');

    expect(retryButton().disabled).toBe(false);
    expect(retryButton().textContent).toBe('TRY AGAIN');
    expect(el().hasAttribute('aria-busy')).toBe(false);
    expect(document.activeElement).toBe(retryButton());
  });

  it('hide() then show() never inherits a stale retrying state (RT W1)', () => {
    panel.show('a');
    panel.setRetrying(true);
    panel.hide();

    panel.show('b');

    expect(retryButton().disabled).toBe(false);
    expect(retryButton().textContent).toBe('TRY AGAIN');
    expect(document.activeElement).toBe(retryButton());
  });

  it('Tab and Shift+Tab cycle between the two buttons', () => {
    panel.show('x');
    expect(document.activeElement).toBe(retryButton());

    tab();
    expect(document.activeElement).toBe(signOutButton());
    tab();
    expect(document.activeElement).toBe(retryButton());
    tab(true);
    expect(document.activeElement).toBe(signOutButton());
  });

  it('Tab while retrying stays on Sign out, the only enabled button (RT W2)', () => {
    panel.show('x');
    panel.setRetrying(true);

    tab();
    expect(document.activeElement).toBe(signOutButton());
    tab(true);
    expect(document.activeElement).toBe(signOutButton());
  });

  it('a Tab from body lands back on the first enabled button (RT W2)', () => {
    panel.show('x');
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    tab();

    expect(document.activeElement).toBe(retryButton());
  });

  it('after hide(), the document trap is removed and Tab no longer moves focus', () => {
    panel.show('x');
    panel.hide();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    tab();

    expect(document.activeElement).toBe(outside);
    expect(el().hidden).toBe(true);
    outside.remove();
  });

  it('a repeated show() adds the trap once, so one hide() removes it (RT round 2 M1)', () => {
    const add = vi.spyOn(document, 'addEventListener');
    panel.show('a');
    panel.show('b');
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    add.mockRestore();

    panel.hide();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    tab();

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('Escape leaves it open', () => {
    panel.show('x');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    el().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.isOpen()).toBe(true);
  });

  it('destroy() removes the element and the trap', () => {
    panel.show('x');
    panel.destroy();
    expect(root.querySelector('.penguin-load-error')).toBeNull();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    tab();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
