import type { PhishingState } from './phishing-client';

/** Test-only control over the dev/e2e fake Phishing Quiz server (#146). */
export interface PhishingTestHandle {
  /** Sets (and freezes) the fake server's clock, then re-reads the guard window. */
  setNow(ms: number): Promise<void>;
  /** The open challenge's correct choice (0-3), read from the fake server; `null` with none open. */
  correctChoice(): number | null;
  /** The Player's quiz state as last read from the server. */
  state(): PhishingState | null;
}

declare global {
  interface Window {
    __phishingTest?: PhishingTestHandle;
  }
}

/**
 * Publishes `window.__phishingTest` for e2e specs, only with the dev server
 * or the Playwright preview build's `VITE_E2E_HOOKS`. Both checks are direct
 * `import.meta.env.*` reads, so a production build strips this body.
 */
export function exposePhishingTestHandle(handle: PhishingTestHandle): void {
  if (!(import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true')) return;
  window.__phishingTest = handle;
}
