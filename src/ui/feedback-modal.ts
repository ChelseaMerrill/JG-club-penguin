import { gameEvents, type RoomId } from '../contracts';
import {
  FEEDBACK_CLIENT_INFO_MAX,
  FEEDBACK_MESSAGE_MAX,
  FeedbackError,
  type FeedbackClient,
  type FeedbackKind,
} from '../feedback/feedback-client';
import type { OverlayManager } from './hud/overlay-manager';
import './feedback.css';

/** The id this modal registers with on `hud.overlays`. */
export const FEEDBACK_OVERLAY_ID = 'feedback';

export const FEEDBACK_SENT_TOAST = 'Thanks! Your feedback was sent.';
export const FEEDBACK_RATE_LIMITED_MESSAGE = 'Too many messages — try again in a few minutes.';
export const FEEDBACK_GENERIC_ERROR = "Couldn't send your feedback. Please try again.";

const KIND_LABELS: Record<FeedbackKind, string> = {
  issue: 'REPORT AN ISSUE',
  suggestion: 'MAKE A SUGGESTION',
};

export interface FeedbackModalOptions {
  client: FeedbackClient;
  /** The HUD's shared overlay manager: Escape closes this, and opening it closes any other overlay. */
  overlays: OverlayManager;
  /** The Room the Player is in right now, read each time the modal opens. */
  currentRoomId: () => RoomId | null;
  resolveRoomTitle: (roomId: RoomId) => { title: string };
  /** Short client description sent with the feedback (cut to 300 characters). */
  clientInfo: () => string | null;
}

export interface FeedbackModal {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

/**
 * The FEEDBACK modal: a Player reports an issue or makes a suggestion. A
 * full-Stage DOM overlay in `root` (the `#ui` layer), like the Market and the
 * Trophy Case, registered with the HUD's `OverlayManager` by `open()` itself.
 * Keystrokes in the textarea never reach `window`, so typing never triggers
 * an Emote, Snowball mode or any other game hotkey (the chat field's #44 D3
 * rule); Escape there still closes the modal.
 */
export function createFeedbackModal(
  root: HTMLElement,
  options: FeedbackModalOptions,
): FeedbackModal {
  const overlay = el('div', 'feedback');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'feedback-title');

  const frame = el('div', 'feedback__frame');
  const title = el('div', 'feedback__title', 'FEEDBACK');
  title.id = 'feedback-title';
  const subtitle = el('div', 'feedback__subtitle', 'TELL THE CLUB JENGUIN TEAM');

  const kinds = el('div', 'feedback__kinds');
  kinds.setAttribute('role', 'group');
  kinds.setAttribute('aria-label', 'Feedback type');
  const kindButtons = (Object.keys(KIND_LABELS) as FeedbackKind[]).map((kind) => {
    const b = button('feedback__kind', KIND_LABELS[kind]);
    b.dataset.kind = kind;
    b.addEventListener('click', () => setKind(kind));
    return b;
  });
  kinds.append(...kindButtons);

  const textarea = el('textarea', 'feedback__textarea');
  textarea.maxLength = FEEDBACK_MESSAGE_MAX;
  textarea.rows = 7;
  textarea.setAttribute('aria-label', 'Your message');

  const meta = el('div', 'feedback__meta');
  const roomEl = el('div', 'feedback__room');
  const counter = el('div', 'feedback__counter');
  meta.append(roomEl, counter);

  const errorEl = el('div', 'feedback__error');
  errorEl.hidden = true;
  errorEl.setAttribute('role', 'alert');

  const actions = el('div', 'feedback__actions');
  const cancelButton = button('feedback__button feedback__cancel', 'CANCEL');
  const sendButton = button('feedback__button feedback__button--primary feedback__send', 'SEND');
  actions.append(cancelButton, sendButton);

  frame.append(title, subtitle, kinds, textarea, meta, errorEl, actions);
  overlay.append(frame);
  root.append(overlay);

  let kind: FeedbackKind = 'issue';
  let roomId: RoomId | null = null;
  let sending = false;

  function setKind(next: FeedbackKind): void {
    kind = next;
    for (const b of kindButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.kind === next));
    }
  }

  function render(): void {
    counter.textContent = `${textarea.value.length} / ${FEEDBACK_MESSAGE_MAX}`;
    sendButton.disabled = sending || textarea.value.trim().length === 0;
  }

  function showError(message: string | null): void {
    errorEl.textContent = message ?? '';
    errorEl.hidden = message === null;
  }

  function hide(): void {
    overlay.hidden = true;
  }

  function close(): void {
    options.overlays.close(FEEDBACK_OVERLAY_ID);
    hide();
  }

  function stopKeyPropagation(event: KeyboardEvent): void {
    event.stopPropagation();
  }
  textarea.addEventListener('keyup', stopKeyPropagation);
  textarea.addEventListener('keypress', stopKeyPropagation);
  textarea.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) close();
  });
  textarea.addEventListener('input', () => {
    showError(null);
    render();
  });

  cancelButton.addEventListener('click', close);

  sendButton.addEventListener('click', () => {
    const message = textarea.value;
    if (sending || message.trim().length === 0) return;
    sending = true;
    showError(null);
    render();
    const info = options.clientInfo();
    void options.client
      .submit({
        kind,
        message,
        roomId,
        clientInfo: info === null ? null : info.slice(0, FEEDBACK_CLIENT_INFO_MAX),
      })
      .then(
        () => {
          sending = false;
          textarea.value = '';
          setKind('issue');
          render();
          close();
          gameEvents.emit('ui:toast', { message: FEEDBACK_SENT_TOAST });
        },
        (err: unknown) => {
          sending = false;
          const rateLimited = err instanceof FeedbackError && err.code === 'feedback_rate_limited';
          showError(rateLimited ? FEEDBACK_RATE_LIMITED_MESSAGE : FEEDBACK_GENERIC_ERROR);
          render();
        },
      );
  });

  setKind('issue');
  render();

  return {
    open() {
      options.overlays.open(FEEDBACK_OVERLAY_ID, hide);
      roomId = options.currentRoomId();
      roomEl.textContent = roomId ? `Room: ${options.resolveRoomTitle(roomId).title}` : '';
      roomEl.hidden = roomId === null;
      showError(null);
      render();
      overlay.hidden = false;
      textarea.focus();
    },
    close,
    isOpen() {
      return !overlay.hidden;
    },
    destroy() {
      close();
      overlay.remove();
    },
  };
}

export interface FeedbackButton {
  destroy(): void;
}

/**
 * The HUD's feedback icon: a small hexagon "!?" button mounted into
 * `hud.feedbackSlot` (bottom right, above the bottom bar), so it shows and
 * hides with the HUD itself, i.e. only while a Player is signed in.
 */
export function createFeedbackButton(
  slot: HTMLElement,
  options: { onClick: () => void },
): FeedbackButton {
  const b = button('hud__button hud__button--bottom feedback-button', '!?');
  b.setAttribute('aria-label', 'Send feedback');
  b.title = 'Report an issue or make a suggestion';
  b.addEventListener('click', () => options.onClick());
  slot.append(b);
  return {
    destroy() {
      b.remove();
    },
  };
}
