/**
 * Chat's rate limit (#44): about one message per second, per Player. Both the
 * field's own faster-send guard and a receiver's per-sender guard use the
 * same gate: an `accept()` within `CHAT_RATE_LIMIT_MS` of that key's last
 * *accepted* call is refused, and refusing never moves the window (only an
 * accepted call updates it), so a burst of refused calls doesn't itself keep
 * pushing the window forward.
 */
export const CHAT_RATE_LIMIT_MS = 1000;

/**
 * The receiver's own gap tolerance (#44 review fix F9): looser than the
 * sender's `CHAT_RATE_LIMIT_MS` so ordinary network jitter between a sender's
 * two genuinely-1s-apart messages doesn't drop the second one at the
 * receiver. `ChatController` uses this for its `receiverGate`; the sender's
 * own `senderGate` keeps the stricter `CHAT_RATE_LIMIT_MS` window.
 */
export const CHAT_RECEIVE_MIN_GAP_MS = 800;

export class ChatRateGate {
  private readonly lastAcceptedAt = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    /** The gate's own window, in ms. Defaults to the sender-side `CHAT_RATE_LIMIT_MS`. */
    private readonly windowMs: number = CHAT_RATE_LIMIT_MS,
  ) {}

  /** Returns whether `key` is accepted right now; only an accepted call moves its window. */
  accept(key: string): boolean {
    const at = this.now();
    const last = this.lastAcceptedAt.get(key);
    if (last !== undefined && at - last < this.windowMs) return false;
    this.lastAcceptedAt.set(key, at);
    return true;
  }

  /** Forgets `key` (or every key, given none), so its next `accept()` is unconditional. */
  reset(key?: string): void {
    if (key === undefined) this.lastAcceptedAt.clear();
    else this.lastAcceptedAt.delete(key);
  }
}
