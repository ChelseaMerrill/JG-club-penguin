import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGE_CHECK_INTERVAL_MS, startBadgeChecks } from './badge-checks';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startBadgeChecks', () => {
  it('checks once at start, then every 5 minutes, and stops on stop()', () => {
    const checkBadges = vi.fn().mockResolvedValue({ badges: [], balance: 100 });

    const stop = startBadgeChecks({ store: { checkBadges } });
    expect(checkBadges).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(BADGE_CHECK_INTERVAL_MS - 1);
    expect(checkBadges).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(checkBadges).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(BADGE_CHECK_INTERVAL_MS);
    expect(checkBadges).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(BADGE_CHECK_INTERVAL_MS * 3);
    expect(checkBadges).toHaveBeenCalledTimes(3);
  });

  it('checks every 5 minutes by default', () => {
    expect(BADGE_CHECK_INTERVAL_MS).toBe(300_000);
  });

  it('swallows a failed check and keeps checking', async () => {
    const checkBadges = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ badges: [], balance: 100 });
    // An unhandled rejection here would fail the run (Vitest reports them).
    const stop = startBadgeChecks({ store: { checkBadges } });
    await vi.advanceTimersByTimeAsync(BADGE_CHECK_INTERVAL_MS);

    expect(checkBadges).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop() is idempotent', () => {
    const checkBadges = vi.fn().mockResolvedValue({ badges: [], balance: 100 });
    const stop = startBadgeChecks({ store: { checkBadges } });

    stop();
    expect(() => stop()).not.toThrow();
  });
});
