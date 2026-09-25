/**
 * Test-only Snowball mode visibility hook (#53 v4 change 4), gated by the
 * same `HOOKS_ENABLED` flag as `window.__roomDebug`
 * (`src/game/rooms/dev-room-hook.ts`), so it is compiled out of a real
 * (Vercel) production build.
 */
import type { Tile } from '../contracts';
import { HOOKS_ENABLED } from '../game/rooms/dev-room-hook';

/** One active snow hat, as the controller timed it and as the renderer actually draws it. */
export interface SnowHatDebugInfo {
  /** Epoch ms (this page's `Date.now()`) the hat was applied. */
  appliedAt: number;
  /** Epoch ms it expires: always `appliedAt + 10000`. */
  until: number;
  /** Read from the real Penguin (`hasSnowHat()`), never from controller state. */
  rendered: boolean;
}

/** One throw this client actually sent (its `snowball:throw` was acknowledged). */
export interface SnowballThrowLogEntry {
  target: Tile;
  at: number;
}

export interface SnowballDebugInfo {
  /** Whether Snowball mode is on. */
  mode: boolean;
  /** Snowballs in hand right now. */
  ammo: number;
  /** The aimed Tile, or `null` when not aiming, not yet moved, or right-click cancelled. */
  reticle: Tile | null;
  /** Every active snow hat keyed by playerId (the local Player included); removed on expiry. */
  snowHats: Record<string, SnowHatDebugInfo>;
  /** Every sent throw, oldest first. */
  throwLog: SnowballThrowLogEntry[];
}

declare global {
  interface Window {
    __snowballDebug?: SnowballDebugInfo;
  }
}

/**
 * Publishes `window.__snowballDebug` as a getter over `read`, so every read
 * (e.g. a Playwright `page.evaluate`) is a fresh snapshot, including
 * `rendered` read live from the Penguins. A no-op unless `HOOKS_ENABLED`.
 */
export function exposeSnowballDebug(read: () => SnowballDebugInfo): void {
  if (!HOOKS_ENABLED) return;
  Object.defineProperty(window, '__snowballDebug', { configurable: true, get: read });
}
