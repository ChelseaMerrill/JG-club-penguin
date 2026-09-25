import type { RoomChannel } from '../realtime/room-channel';
import { CHAT_RECEIVE_MIN_GAP_MS, ChatRateGate } from './chat-rate-gate';
import { prepareChatSend } from './chat-rules';

/** How long a speech bubble stays up before it's cleared (#44). */
export const CHAT_BUBBLE_LIFETIME_MS = 5000;

/** A single, unchanging key: the sender-side rate gate only ever tracks the local Player. */
const SENDER_KEY = 'self';

/**
 * Where the chat controller shows and clears speech bubbles: the #31 Penguin
 * renderer, via `RoomPenguinView.say`/`sayLocal` (`src/game/rooms/room-penguin-view.ts`).
 * A narrow, structural seam so this module never imports Phaser or the room
 * package. Returns whether a placed Penguin actually received the call (#44
 * review fix F1): the caller (`composeChatView` in `src/main.ts`) publishes a
 * debug snapshot only off that return value, rather than off what was merely
 * requested.
 */
export interface ChatBubbleView {
  /** Shows (or replaces) a remote Penguin's bubble, or clears it (`null`). */
  say(playerId: string, text: string | null): boolean;
  /** Shows (or replaces) the local Penguin's own bubble, or clears it (`null`). */
  sayLocal(text: string | null): boolean;
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
   * to the sender) — unless the Room changed or the controller was stopped
   * while the send was in flight (#44 review fix F4/F5), in which case the
   * bubble is skipped. A channel-refused send (`false`) resets the sender's
   * rate gate so an immediate retry is allowed (#44 review fix F8). Once
   * `stop()` has run, every further call resolves `false` without sending.
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
  const receiverGate = new ChatRateGate(now, CHAT_RECEIVE_MIN_GAP_MS);

  let localTimer: ReturnType<typeof scheduleTimer> | null = null;
  let localActive = false;
  const remoteTimers = new Map<string, ReturnType<typeof scheduleTimer>>();

  // Bumped on every Room change and on `stop()`, so a `send()` awaiting an
  // ack from a since-superseded Room (or a stopped controller) can tell its
  // ack arrived too late to show a bubble for (#44 review fix F4/F5).
  let generation = 0;
  let stopped = false;

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
    generation += 1;
    clearAllBubbles();
  });

  return {
    async send(raw: string): Promise<boolean> {
      if (stopped) return false;
      const text = prepareChatSend(raw);
      if (text === null) return false;
      if (!senderGate.accept(SENDER_KEY)) return false;
      const sentAtGeneration = generation;
      const ok = await channel.send('chat', { text });
      if (!ok) {
        // The rate gate's window already moved for this accepted attempt,
        // even though nothing was actually sent; reset it so the very next
        // attempt isn't wrongly rate-limited (#44 review fix F8).
        senderGate.reset(SENDER_KEY);
        return false;
      }
      // A Room change or `stop()` while the ack was in flight: the message
      // was sent and acknowledged, but this Player has left (or is leaving)
      // the Room the bubble would show in, so skip it (#44 review fix F4/F5).
      if (stopped || sentAtGeneration !== generation) return true;
      showLocalBubble(text);
      return true;
    },
    stop(): void {
      stopped = true;
      generation += 1;
      unsubscribeChat();
      unsubscribeRoomChange();
      clearAllBubbles();
    },
  };
}
