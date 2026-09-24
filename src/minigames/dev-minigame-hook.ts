import type { MinigameId } from '../contracts/game-events';
import type { Hud } from '../ui/hud/hud';
import type { MinigameLauncher } from './minigame-launcher';
import type { MinigameTestHandle } from './minigame-test-handle';
import type { StubMinigameTestHooks } from './stub-minigame';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

function hasStubHooks(value: unknown): value is StubMinigameTestHooks {
  return (
    !!value &&
    typeof (value as Partial<StubMinigameTestHooks>).debugSetScore === 'function' &&
    typeof (value as Partial<StubMinigameTestHooks>).debugFinishNow === 'function'
  );
}

/**
 * Test-only: with `?minigame=<id>` in the URL and either a dev server
 * (`import.meta.env.DEV`) or the Playwright preview server
 * (`VITE_E2E_HOOKS=true`), launches that Minigame immediately (skipping
 * #36's NPC dialog trigger) and shows the HUD the same way `?hud`
 * (`initDevHudHook`) does. Exposes `window.__minigameTest` so e2e specs can
 * drive the `bug-squash` stub without 50 clicks. Both env checks are direct
 * `import.meta.env.*` reads, so Vite strips this function's body from a
 * production build exactly as `initDevHudHook` documents.
 *
 * Returns whether the hook activated, for `main.ts` to skip wiring real
 * auth events the same way `devHudActive` already does.
 */
export function initDevMinigameHook(hud: Hud, launcher: MinigameLauncher): boolean {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;

  const params = new URLSearchParams(window.location.search);
  const minigameId = params.get('minigame') as MinigameId | null;
  if (!minigameId) return false;

  // An unrecognized or not-yet-registered id (e.g. `?minigame=pancake-flip`
  // before #39 lands) is a no-op rather than an uncaught throw into the page.
  let launched: ReturnType<MinigameLauncher['launch']>;
  try {
    launched = launcher.launch(minigameId);
  } catch {
    return false;
  }

  hud.show();
  const hooks = launched.minigame;

  window.__minigameTest = {
    setStubScore(score) {
      if (hasStubHooks(hooks)) hooks.debugSetScore(score);
    },
    finishNow() {
      if (hasStubHooks(hooks)) hooks.debugFinishNow();
    },
  };

  return true;
}
