import type { ProgressStore } from '../persistence/progress-store';

/** How often the Session Badge check runs while a Session is live (#138, decided 2026-09-27). */
export const BADGE_CHECK_INTERVAL_MS = 5 * 60_000;

export interface BadgeCheckTimers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface StartBadgeChecksOptions {
  store: Pick<ProgressStore, 'checkBadges'>;
  intervalMs?: number;
  /** Defaults to the browser's own timers; tests pass fakes. */
  timers?: BadgeCheckTimers;
}

const browserTimers: BadgeCheckTimers = {
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as number),
};

/**
 * Runs the Session Badge check (#138 D11) once straight away, then every
 * `intervalMs` until the returned `stop()` is called. That's how First
 * Waddle is awarded at Session start, and Night Owl within 5 minutes of
 * 02:00 Eastern for a Player already online; the server decides both with
 * its own clock. A failed check is swallowed, never toasted, like
 * `questProgress`. Producer: #138. Consumer: `main.ts`'s `startSession`.
 */
export function startBadgeChecks(options: StartBadgeChecksOptions): () => void {
  const timers = options.timers ?? browserTimers;
  let stopped = false;

  function check(): void {
    if (stopped) return;
    options.store.checkBadges().catch(() => undefined);
  }

  check();
  const handle = timers.setInterval(check, options.intervalMs ?? BADGE_CHECK_INTERVAL_MS);

  return () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(handle);
  };
}
