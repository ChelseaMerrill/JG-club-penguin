import { EMOTE_DURATION_MS, type EmoteId } from '../contracts';
import type { RoomChannel } from '../realtime/room-channel';
import { EmoteRateGate } from './emote-rate-gate';

/** A single, unchanging key: the sender-side rate gate only ever tracks the local Player. */
const SENDER_KEY = 'self';

/**
 * Where the Emote controller plays and clears Emote poses: the #31 Penguin
 * renderer, via `RoomScene.playEmoteLocal`/`clearEmoteLocal` (the local
 * Penguin) and `RoomPenguinView.playEmote` (remote Penguins, #28). A narrow,
 * structural seam so this module never imports Phaser or the room package,
 * mirroring `ChatBubbleView` (`src/chat/chat-controller.ts`, #44).
 */
export interface EmotePenguinView {
  /** Plays `emoteId` on a remote Penguin, or clears it back to idle (`null`). Returns whether a placed Penguin actually received the call. */
  play(playerId: string, emoteId: EmoteId | null): boolean;
  /** Plays `emoteId` on the local Penguin, or clears it back to idle/walk (`null`). */
  playLocal(emoteId: EmoteId | null): boolean;
}

/** The narrow slice of `RoomChannel` the Emote controller depends on. */
export type EmoteRoomChannel = Pick<RoomChannel, 'send' | 'on' | 'onRoomChange'>;

export interface EmoteControllerOptions {
  channel: EmoteRoomChannel;
  view: EmotePenguinView;
  /** Clock for the sender-side rate gate and Emote durations. Defaults to `Date.now`. */
  now?: () => number;
  /** Timer used for Emote durations. Defaults to the global `setTimeout`, injectable for deterministic tests. */
  setTimeout?: typeof setTimeout;
  /** Timer used to cancel an Emote duration. Defaults to the global `clearTimeout`. */
  clearTimeout?: typeof clearTimeout;
}

export interface EmoteController {
  /**
   * Plays `emoteId` on the local Penguin immediately (optimistic: unlike
   * `ChatController.send`, this never waits for the broadcast to be
   * acknowledged first) and best-effort broadcasts it on the Room channel,
   * unless this Player picked an Emote less than `EMOTE_RATE_LIMIT_MS` ago
   * (`EmoteRateGate`), in which case it does neither and resolves `false`.
   * Resolves whether the broadcast itself was pushed and acknowledged `'ok'`
   * (`false` with no Room channel joined, e.g. the Igloo when it isn't, or
   * once `stop()` has run) — the local play already happened either way.
   */
  send(emoteId: EmoteId): Promise<boolean>;
  /** Unsubscribes from the channel and clears every active Emote and timer. Call once, at session end. */
  stop(): void;
}

/**
 * Joins the HUD Emote picker to the Room channel and the #31 Penguin
 * renderer (#47): sends a picked Emote, plays it on the local Penguin right
 * away, and renders incoming `emote` broadcasts on their sender's Penguin.
 * Each Emote clears back to idle/walk after `EMOTE_DURATION_MS`; a new pick
 * (local or remote) for the same Penguin replaces the running one and resets
 * its timer. Every active Emote is cleared, and the sender-side rate gate
 * left untouched (mirroring `ChatController`'s own Room-change handling), on
 * every Room change (#44 D2's same reasoning applies here).
 */
export function createEmoteController(options: EmoteControllerOptions): EmoteController {
  const { channel, view } = options;
  const now = options.now ?? Date.now;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const cancelTimer = options.clearTimeout ?? clearTimeout;

  const senderGate = new EmoteRateGate(now);

  let localTimer: ReturnType<typeof scheduleTimer> | null = null;
  let localActive = false;
  const remoteTimers = new Map<string, ReturnType<typeof scheduleTimer>>();

  let stopped = false;

  function showLocal(emoteId: EmoteId): void {
    view.playLocal(emoteId);
    localActive = true;
    if (localTimer !== null) cancelTimer(localTimer);
    localTimer = scheduleTimer(() => {
      localTimer = null;
      localActive = false;
      view.playLocal(null);
    }, EMOTE_DURATION_MS);
  }

  function showRemote(playerId: string, emoteId: EmoteId): void {
    view.play(playerId, emoteId);
    const existing = remoteTimers.get(playerId);
    if (existing !== undefined) cancelTimer(existing);
    remoteTimers.set(
      playerId,
      scheduleTimer(() => {
        remoteTimers.delete(playerId);
        view.play(playerId, null);
      }, EMOTE_DURATION_MS),
    );
  }

  function clearAll(): void {
    if (localTimer !== null) cancelTimer(localTimer);
    localTimer = null;
    if (localActive) view.playLocal(null);
    localActive = false;
    for (const [playerId, timer] of remoteTimers) {
      cancelTimer(timer);
      view.play(playerId, null);
    }
    remoteTimers.clear();
  }

  const unsubscribeEmote = channel.on('emote', ({ playerId, emoteId }) => {
    showRemote(playerId, emoteId);
  });
  const unsubscribeRoomChange = channel.onRoomChange(() => {
    clearAll();
  });

  return {
    async send(emoteId: EmoteId): Promise<boolean> {
      if (stopped) return false;
      if (!senderGate.accept(SENDER_KEY)) return false;
      showLocal(emoteId);
      return channel.send('emote', { emoteId });
    },
    stop(): void {
      stopped = true;
      unsubscribeEmote();
      unsubscribeRoomChange();
      clearAll();
    },
  };
}
