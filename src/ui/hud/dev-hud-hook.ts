import { gameEvents, type RoomId } from '../../contracts';
import type { Hud } from './hud';

/** Test handle `initDevHudHook` exposes on `window` for e2e specs. */
export interface HudTestHandle {
  /** Emits `room:enter` for `roomId` with a throwaway entry tile. */
  emitRoomEnter(roomId: RoomId): void;
  /** Grows by one every time the HUD emits `ui:open-creator`. */
  openCreatorLog: number[];
}

declare global {
  interface Window {
    __hudTest?: HudTestHandle;
  }
}

/**
 * Test-only: with `?hud` in the URL and either a dev server
 * (`import.meta.env.DEV`) or the Playwright preview server
 * (`VITE_E2E_HOOKS=true`, set by `playwright.config.ts`'s `webServer.env`),
 * shows the given (already-created, otherwise auth-gated) Hud immediately
 * and exposes `window.__hudTest` so e2e specs can drive it without signing
 * in. Both checks are direct `import.meta.env.*` reads, so Vite's static
 * replacement turns them into literal `false` in a real (Vercel) production
 * build and the minifier strips this function's body as dead code.
 *
 * Returns whether the hook activated. `main.ts` uses that to stop wiring the
 * real (asynchronous) auth `SIGNED_OUT`/`SIGNED_IN` events into
 * `hud.show()`/`hud.hide()`: Supabase's `onAuthStateChange` always fires on a
 * later tick, so without this an unauthenticated `SIGNED_OUT` arriving after
 * this function's synchronous `hud.show()` would immediately hide it again.
 */
export function initDevHudHook(hud: Hud): boolean {
  const e2eHooksEnabled =
    import.meta.env.DEV ||
    (import.meta.env as unknown as { VITE_E2E_HOOKS?: string }).VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;

  const params = new URLSearchParams(window.location.search);
  if (!params.has('hud')) return false;

  const openCreatorLog: number[] = [];
  gameEvents.on('ui:open-creator', () => openCreatorLog.push(Date.now()));

  window.__hudTest = {
    emitRoomEnter(roomId) {
      gameEvents.emit('room:enter', { roomId, entryTile: { col: 0, row: 0 } });
    },
    openCreatorLog,
  };

  hud.show();
  return true;
}
