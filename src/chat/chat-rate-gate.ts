/**
 * Chat's rate limit (#44): about one message per second, per Player. Both the
 * field's own faster-send guard and a receiver's per-sender guard use the
 * same gate: an `accept()` within `CHAT_RATE_LIMIT_MS` of that key's last
 * *accepted* call is refused, and refusing never moves the window (only an
 * accepted call updates it), so a burst of refused calls doesn't itself keep
 * pushing the window forward.
 */
export const CHAT_RATE_LIMIT_MS = 1000;

export class ChatRateGate {
  private readonly lastAcceptedAt = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns whether `key` is accepted right now; only an accepted call moves its window. */
  accept(key: string): boolean {
    const at = this.now();
    const last = this.lastAcceptedAt.get(key);
    if (last !== undefined && at - last < CHAT_RATE_LIMIT_MS) return false;
    this.lastAcceptedAt.set(key, at);
    return true;
  }

  /** Forgets `key` (or every key, given none), so its next `accept()` is unconditional. */
  reset(key?: string): void {
    if (key === undefined) this.lastAcceptedAt.clear();
    else this.lastAcceptedAt.delete(key);
  }
}
