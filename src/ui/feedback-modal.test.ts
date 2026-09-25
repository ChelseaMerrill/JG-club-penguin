// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../contracts';
import { FeedbackError, type FeedbackClient } from '../feedback/feedback-client';
import { createInMemoryFeedbackClient } from '../feedback/in-memory-feedback-client';
import { createHud, type Hud } from './hud/hud';
import { createOverlayManager, type OverlayManager } from './hud/overlay-manager';
import { createFeedbackButton, createFeedbackModal, FEEDBACK_OVERLAY_ID } from './feedback-modal';

const ROOM_TITLES: Record<string, string> = { 'dev-pit': 'Dev Pit', 'town-center': 'Town Center' };

const cleanups: Array<() => void> = [];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function setup(
  options: { client?: FeedbackClient; roomId?: RoomId | null; overlays?: OverlayManager } = {},
) {
  const root = document.createElement('div');
  document.body.append(root);
  const overlays = options.overlays ?? createOverlayManager();
  const client = options.client ?? createInMemoryFeedbackClient();
  const modal = createFeedbackModal(root, {
    client,
    overlays,
    currentRoomId: () => (options.roomId === undefined ? 'dev-pit' : options.roomId),
    resolveRoomTitle: (roomId) => ({ title: ROOM_TITLES[roomId] ?? roomId, subtitle: '' }),
    clientInfo: () => 'test agent',
  });
  const toasts: string[] = [];
  const unsubscribe = gameEvents.on('ui:toast', ({ message }) => toasts.push(message));
  cleanups.push(() => {
    unsubscribe();
    modal.destroy();
    overlays.destroy();
  });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  return { root, modal, overlays, client, toasts, q };
}

function type(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Resolves once every pending promise callback has run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferredClient() {
  let settle!: { resolve: () => void; reject: (err: unknown) => void };
  const submit = vi.fn(
    () =>
      new Promise<{ id: string }>((resolve, reject) => {
        settle = { resolve: () => resolve({ id: 'f-1' }), reject };
      }),
  );
  return { client: { submit } as FeedbackClient, submit, settle: () => settle };
}

describe('feedback modal', () => {
  it('is hidden until opened, then shows FEEDBACK and registers with the overlay manager', () => {
    const { q, modal, overlays } = setup();

    expect(q('.feedback').hidden).toBe(true);

    modal.open();

    expect(q('.feedback').hidden).toBe(false);
    expect(q('.feedback__title').textContent).toBe('FEEDBACK');
    expect(overlays.current()).toBe(FEEDBACK_OVERLAY_ID);
    expect(modal.isOpen()).toBe(true);
  });

  it('offers REPORT AN ISSUE (selected by default) and MAKE A SUGGESTION', () => {
    const { q, modal, root } = setup();
    modal.open();

    const toggles = [...root.querySelectorAll<HTMLButtonElement>('.feedback__kind')];
    expect(toggles.map((b) => b.textContent)).toEqual(['REPORT AN ISSUE', 'MAKE A SUGGESTION']);
    expect(toggles.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    q<HTMLButtonElement>('.feedback__kind[data-kind="suggestion"]').click();

    expect(toggles.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('caps the message at 2000 characters and shows a live counter', () => {
    const { q, modal } = setup();
    modal.open();
    const textarea = q<HTMLTextAreaElement>('.feedback__textarea');

    expect(textarea.maxLength).toBe(2000);
    expect(q('.feedback__counter').textContent).toBe('0 / 2000');

    type(textarea, 'Hello');

    expect(q('.feedback__counter').textContent).toBe('5 / 2000');
  });

  it('blocks SEND while the message is empty or only whitespace', () => {
    const { q, modal } = setup();
    modal.open();
    const send = q<HTMLButtonElement>('.feedback__send');
    const textarea = q<HTMLTextAreaElement>('.feedback__textarea');

    expect(send.disabled).toBe(true);
    type(textarea, '   \n  ');
    expect(send.disabled).toBe(true);
    type(textarea, ' ok ');
    expect(send.disabled).toBe(false);
  });

  it('shows the current Room as info', () => {
    const { q, modal } = setup({ roomId: 'dev-pit' });
    modal.open();

    expect(q('.feedback__room').textContent).toBe('Room: Dev Pit');
  });

  it('sends the chosen kind, the message, the Room id and client info; closes and toasts thanks', async () => {
    const client = createInMemoryFeedbackClient();
    const { q, modal, toasts } = setup({ client, roomId: 'dev-pit' });
    modal.open();
    q<HTMLButtonElement>('.feedback__kind[data-kind="suggestion"]').click();
    type(q<HTMLTextAreaElement>('.feedback__textarea'), 'A hot cocoa stall');

    q<HTMLButtonElement>('.feedback__send').click();
    await flush();

    expect(client.submissions()).toEqual([
      {
        id: expect.any(String),
        kind: 'suggestion',
        message: 'A hot cocoa stall',
        roomId: 'dev-pit',
        clientInfo: 'test agent',
      },
    ]);
    expect(modal.isOpen()).toBe(false);
    expect(toasts).toEqual(['Thanks! Your feedback was sent.']);

    // The next open starts fresh.
    modal.open();
    expect(q<HTMLTextAreaElement>('.feedback__textarea').value).toBe('');
    expect(q('.feedback__kind[data-kind="issue"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('disables SEND while sending', async () => {
    const { client, submit, settle } = deferredClient();
    const { q, modal } = setup({ client });
    modal.open();
    type(q<HTMLTextAreaElement>('.feedback__textarea'), 'bug');
    const send = q<HTMLButtonElement>('.feedback__send');

    send.click();
    send.click();

    expect(send.disabled).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);

    settle().resolve();
    await flush();
    expect(modal.isOpen()).toBe(false);
  });

  it('on feedback_rate_limited says to wait, keeps the text and stays open', async () => {
    const client = { submit: () => Promise.reject(new FeedbackError('feedback_rate_limited')) };
    const { q, modal, toasts } = setup({ client });
    modal.open();
    type(q<HTMLTextAreaElement>('.feedback__textarea'), 'one more thing');

    q<HTMLButtonElement>('.feedback__send').click();
    await flush();

    expect(q('.feedback__error').hidden).toBe(false);
    expect(q('.feedback__error').textContent).toBe(
      'Too many messages — try again in a few minutes.',
    );
    expect(q<HTMLTextAreaElement>('.feedback__textarea').value).toBe('one more thing');
    expect(q<HTMLButtonElement>('.feedback__send').disabled).toBe(false);
    expect(modal.isOpen()).toBe(true);
    expect(toasts).toEqual([]);
  });

  it('on any other error shows a generic retry message and keeps the text', async () => {
    const client = { submit: () => Promise.reject(new FeedbackError('unknown', 'offline')) };
    const { q, modal } = setup({ client });
    modal.open();
    type(q<HTMLTextAreaElement>('.feedback__textarea'), 'it broke');

    q<HTMLButtonElement>('.feedback__send').click();
    await flush();

    expect(q('.feedback__error').textContent).toBe(
      "Couldn't send your feedback. Please try again.",
    );
    expect(q<HTMLTextAreaElement>('.feedback__textarea').value).toBe('it broke');
    expect(modal.isOpen()).toBe(true);
  });

  it('CANCEL closes without sending', () => {
    const client = createInMemoryFeedbackClient();
    const { q, modal, overlays } = setup({ client });
    modal.open();
    type(q<HTMLTextAreaElement>('.feedback__textarea'), 'never mind');

    q<HTMLButtonElement>('.feedback__cancel').click();

    expect(modal.isOpen()).toBe(false);
    expect(overlays.current()).toBeNull();
    expect(client.submissions()).toEqual([]);
  });

  it('Escape closes it, including while typing in the textarea', () => {
    const { q, modal } = setup();

    modal.open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.isOpen()).toBe(false);

    modal.open();
    q('.feedback__textarea').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(modal.isOpen()).toBe(false);
  });

  it('closes when another overlay opens, and opening it closes the other overlay', () => {
    const overlays = createOverlayManager();
    const { modal } = setup({ overlays });
    const closeMenu = vi.fn();

    modal.open();
    overlays.open('menu', closeMenu);
    expect(modal.isOpen()).toBe(false);

    modal.open();
    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(overlays.current()).toBe(FEEDBACK_OVERLAY_ID);
  });

  it('keeps keystrokes in the textarea away from game hotkeys on window', () => {
    const { q, modal } = setup();
    modal.open();
    const heard: string[] = [];
    const listener = (event: KeyboardEvent) => heard.push(`${event.type}:${event.key}`);
    window.addEventListener('keydown', listener);
    window.addEventListener('keyup', listener);
    window.addEventListener('keypress', listener);
    cleanups.push(() => {
      window.removeEventListener('keydown', listener);
      window.removeEventListener('keyup', listener);
      window.removeEventListener('keypress', listener);
    });
    const textarea = q('.feedback__textarea');

    for (const key of ['1', 'e', 's', ' ']) {
      for (const eventType of ['keydown', 'keypress', 'keyup']) {
        textarea.dispatchEvent(new KeyboardEvent(eventType, { key, bubbles: true }));
      }
    }

    expect(heard).toEqual([]);
    expect(modal.isOpen()).toBe(true);
  });
});

describe('feedback button', () => {
  function hudWithButton() {
    const layer = document.createElement('div');
    document.body.append(layer);
    const hud: Hud = createHud(layer, {
      resolveRoomTitle: () => ({ title: 'Town Center', subtitle: '' }),
      onIgloo: () => {},
      onSignOut: () => {},
      initialBalance: 0,
      onChatSend: () => Promise.resolve(false),
      onEmotePick: () => {},
    });
    const onClick = vi.fn();
    const button = createFeedbackButton(hud.feedbackSlot, { onClick });
    cleanups.push(() => {
      button.destroy();
      hud.destroy();
    });
    const el = layer.querySelector<HTMLButtonElement>('.feedback-button')!;
    return { hud, el, onClick };
  }

  const isShown = (el: HTMLElement) => el.closest('[hidden]') === null;

  it('is shown only while the HUD is shown (a signed-in Player)', () => {
    const { hud, el } = hudWithButton();

    expect(isShown(el)).toBe(false);
    hud.show();
    expect(isShown(el)).toBe(true);
    hud.hide();
    expect(isShown(el)).toBe(false);
  });

  it('has an accessible name and opens the modal on click', () => {
    const { hud, el, onClick } = hudWithButton();
    hud.show();

    expect(el.getAttribute('aria-label')).toBe('Send feedback');
    el.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
