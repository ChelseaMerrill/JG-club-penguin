/**
 * The Emote picker's sender-side rate limit (#47): a new pick from the same
 * Player less than `EMOTE_RATE_LIMIT_MS` after the previous one is ignored
 * outright (no local play, no broadcast) rather than queued or throttled.
 * Structurally identical to `src/chat/chat-rate-gate.ts`'s `ChatRateGate`
 * (kept as its own small copy rather than a shared import, so this module
 * stays independent of `src/chat/`); only an accepted call moves the window.
 */
export const EMOTE_RATE_LIMIT_MS = 500;

export class EmoteRateGate {
  private readonly lastAcceptedAt = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns whether `key` is accepted right now; only an accepted call moves its window. */
  accept(key: string): boolean {
    const at = this.now();
    const last = this.lastAcceptedAt.get(key);
    if (last !== undefined && at - last < EMOTE_RATE_LIMIT_MS) return false;
    this.lastAcceptedAt.set(key, at);
    return true;
  }

  /** Forgets `key` (or every key, given none), so its next `accept()` is unconditional. */
  reset(key?: string): void {
    if (key === undefined) this.lastAcceptedAt.clear();
    else this.lastAcceptedAt.delete(key);
  }
}
