import type { RoomChannel } from '../realtime/room-channel';
import { ChatRateGate } from './chat-rate-gate';
import { prepareChatSend } from './chat-rules';

/** How long a speech bubble stays up before it's cleared (#44). */
export const CHAT_BUBBLE_LIFETIME_MS = 5000;

/** A single, unchanging key: the sender-side rate gate only ever tracks the local Player. */
const SENDER_KEY = 'self';

/**
 * Where the chat controller shows and clears speech bubbles: the #31 Penguin
 * renderer, via `RoomPenguinView.say`/`sayLocal` (`src/game/rooms/room-penguin-view.ts`).
 * A narrow, structural seam so this module never imports Phaser or the room
 * package.
 */
export interface ChatBubbleView {
  /** Shows (or replaces) a remote Penguin's bubble, or clears it (`null`). */
  say(playerId: string, text: string | null): void;
  /** Shows (or replaces) the local Penguin's own bubble, or clears it (`null`). */
  sayLocal(text: string | null): void;
}

/** The narrow slice of `RoomChannel` the chat controller depends on. */
export type ChatRoomChannel = Pick<RoomChannel, 'send' | 'on' | 'onRoomChange'>;

export interface ChatControllerOptions {
  channel: ChatRoomChannel;
  view: ChatBubbleView;
  /** Clock for the rate gates and bubble lifetimes. Defaults to `Date.now`. */
  now?: () => number;
  /** Timer used for bubble lifetimes. Defaults to the global `setTimeout`, injectable for deterministic tests. */
  setTimeout?: typeof setTimeout;
  /** Timer used to cancel a bubble's lifetime. Defaults to the global `clearTimeout`. */
  clearTimeout?: typeof clearTimeout;
}

export interface ChatController {
  /**
   * Prepares and sends `raw` on the Room channel: trims, cuts to
   * `CHAT_TEXT_MAX`, and drops whitespace-only input (`prepareChatSend`),
   * then refuses a send inside the sender's own rate-limit window. Resolves
   * `true` only for a message that was actually pushed and acknowledged, at
   * which point the local Penguin's own bubble shows (broadcast never echoes
   * to the sender).
   */
  send(raw: string): Promise<boolean>;
  /** Unsubscribes from the channel and clears every bubble and timer. Call once, at session end. */
  stop(): void;
}

/**
 * Joins the HUD chat field to the Room channel and the #31 Penguin renderer
 * (#44): sends outgoing chat, shows the sender's own bubble once the send is
 * acknowledged, and renders incoming `chat` broadcasts as bubbles above their
 * sender's Penguin, dropping a sender's message that arrives inside that
 * sender's own rate-limit window (by local arrival time). Every bubble is
 * cleared, and the receive-side rate gate reset, on every Room change (#44 D2).
 */
export function createChatController(options: ChatControllerOptions): ChatController {
  const { channel, view } = options;
  const now = options.now ?? Date.now;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const cancelTimer = options.clearTimeout ?? clearTimeout;

  const senderGate = new ChatRateGate(now);
  const receiverGate = new ChatRateGate(now);

  let localTimer: ReturnType<typeof scheduleTimer> | null = null;
  let localActive = false;
  const remoteTimers = new Map<string, ReturnType<typeof scheduleTimer>>();

  function showLocalBubble(text: string): void {
    view.sayLocal(text);
    localActive = true;
    if (localTimer !== null) cancelTimer(localTimer);
    localTimer = scheduleTimer(() => {
      localTimer = null;
      localActive = false;
      view.sayLocal(null);
    }, CHAT_BUBBLE_LIFETIME_MS);
  }

  function showRemoteBubble(playerId: string, text: string): void {
    view.say(playerId, text);
    const existing = remoteTimers.get(playerId);
    if (existing !== undefined) cancelTimer(existing);
    remoteTimers.set(
      playerId,
      scheduleTimer(() => {
        remoteTimers.delete(playerId);
        view.say(playerId, null);
      }, CHAT_BUBBLE_LIFETIME_MS),
    );
  }

  function clearAllBubbles(): void {
    if (localTimer !== null) cancelTimer(localTimer);
    localTimer = null;
    if (localActive) view.sayLocal(null);
    localActive = false;
    for (const [playerId, timer] of remoteTimers) {
      cancelTimer(timer);
      view.say(playerId, null);
    }
    remoteTimers.clear();
    receiverGate.reset();
  }

  const unsubscribeChat = channel.on('chat', ({ playerId, text }) => {
    if (!receiverGate.accept(playerId)) return;
    showRemoteBubble(playerId, text);
  });
  const unsubscribeRoomChange = channel.onRoomChange(() => {
    clearAllBubbles();
  });

  return {
    async send(raw: string): Promise<boolean> {
      const text = prepareChatSend(raw);
      if (text === null) return false;
      if (!senderGate.accept(SENDER_KEY)) return false;
      const ok = await channel.send('chat', { text });
      if (ok) showLocalBubble(text);
      return ok;
    },
    stop(): void {
      unsubscribeChat();
      unsubscribeRoomChange();
      clearAllBubbles();
    },
  };
}
