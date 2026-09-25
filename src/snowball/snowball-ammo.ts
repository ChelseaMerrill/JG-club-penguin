/**
 * Snowball ammo (#53 D5): a pure bucket with an injectable clock, no timers
 * of its own. Capacity 3, starting full (approved deviation from the
 * ticket's "2 in hand": the design mock shows 3 pips). One snowball is
 * restored every `SNOWBALL_REFILL_MS` while below capacity; the 4s cycle
 * starts the moment the count first drops below capacity and keeps its
 * phase until the bucket is full again — a further reservation while
 * already below capacity does not restart the cycle.
 */

/** Ammo capacity. Approved deviation from the ticket's "2 in hand" (#53 human decision 1). */
export const SNOWBALL_CAPACITY = 3;

/** Milliseconds between each +1 refill tick while below capacity. */
export const SNOWBALL_REFILL_MS = 4000;

export interface SnowballAmmo {
  /** This bucket's capacity (fixed for its lifetime). */
  readonly capacity: number;
  /** Current count, after settling any refill ticks due by `now`. */
  count(now: number): number;
  /**
   * Reserves one ammo if available, decrementing the count and returning
   * `true`. Returns `false` without effect if the count is already 0. A
   * reservation that first drops the count below capacity starts the refill
   * cycle at `now`; one that doesn't (already below capacity) leaves the
   * cycle's phase untouched.
   */
  reserve(now: number): boolean;
  /**
   * Returns one previously reserved ammo (e.g. a failed send), without
   * disturbing the refill cycle's phase. A no-op once the bucket is full.
   */
  refund(now: number): void;
  /** Epoch ms (same clock as `now`) of the next scheduled +1 tick, or `null` when full. */
  nextRefillAt(now: number): number | null;
}

/** Creates a fresh ammo bucket, full at `capacity` (defaults to `SNOWBALL_CAPACITY`). */
export function createSnowballAmmo(capacity: number = SNOWBALL_CAPACITY): SnowballAmmo {
  let count = capacity;
  // The epoch ms at which the current refill cycle started, or `null` when
  // full (invariant: `cycleStart === null` iff `count === capacity`, once
  // `settle` has run).
  let cycleStart: number | null = null;

  function settle(now: number): void {
    if (cycleStart === null) return;
    const elapsed = now - cycleStart;
    if (elapsed < SNOWBALL_REFILL_MS) return;
    const ticks = Math.floor(elapsed / SNOWBALL_REFILL_MS);
    count = Math.min(capacity, count + ticks);
    cycleStart = count >= capacity ? null : cycleStart + ticks * SNOWBALL_REFILL_MS;
  }

  return {
    capacity,
    count(now: number): number {
      settle(now);
      return count;
    },
    reserve(now: number): boolean {
      settle(now);
      if (count <= 0) return false;
      const wasBelowCapacity = cycleStart !== null;
      count -= 1;
      if (!wasBelowCapacity) cycleStart = now;
      return true;
    },
    refund(now: number): void {
      settle(now);
      if (count >= capacity) return;
      count += 1;
      if (count >= capacity) cycleStart = null;
    },
    nextRefillAt(now: number): number | null {
      settle(now);
      return cycleStart === null ? null : cycleStart + SNOWBALL_REFILL_MS;
    },
  };
}
