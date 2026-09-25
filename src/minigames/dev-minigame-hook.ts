import type { MinigameId } from '../contracts';
import { MINIGAME_RULES } from '../persistence/minigame-rules';
import type { Hud } from '../ui/hud/hud';
import type { LaunchedMinigame, MinigameLauncher } from './minigame-launcher';
import type { MinigameTestHandle } from './minigame-test-handle';
import type { PancakeFlipTestHooks } from './pancake-flip/pancake-flip';
import type { SnowConeStandTestHooks } from './snow-cone-stand/snow-cone-stand';
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

function hasPancakeFlipHooks(value: unknown): value is PancakeFlipTestHooks {
  return !!value && typeof (value as Partial<PancakeFlipTestHooks>).debugFinishNow === 'function';
}

function hasSnowConeStandHooks(value: unknown): value is SnowConeStandTestHooks {
  return !!value && typeof (value as Partial<SnowConeStandTestHooks>).debugFinishNow === 'function';
}

/** True when `value` is one of `MINIGAME_RULES`'s registered ids. */
function isMinigameId(value: string): value is MinigameId {
  return value in MINIGAME_RULES;
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
  const rawId = params.get('minigame');
  // An unrecognized or not-yet-registered id (e.g. `?minigame=pancake-flip`
  // before #39 lands) is a no-op rather than an uncaught throw into the page.
  if (!rawId || !isMinigameId(rawId)) return false;

  let launched: LaunchedMinigame;
  try {
    launched = launcher.launch(rawId);
  } catch {
    return false;
  }

  hud.show();
  // `let`, not `const`: `launch()` (#46) swaps in the next Minigame so the
  // `finish*` methods below drive whichever one is currently loaded.
  let hooks: unknown = launched.minigame;
  let currentId: MinigameId = rawId;

  window.__minigameTest = {
    setStubScore(score) {
      if (hasStubHooks(hooks)) hooks.debugSetScore(score);
    },
    finishNow() {
      if (hasStubHooks(hooks)) hooks.debugFinishNow();
    },
    finishPancakeFlipNow() {
      // Gated on the requested id, not just the hook shape: Bug Squash's
      // own `debugFinishNow` would otherwise also match
      // `hasPancakeFlipHooks`'s duck-typing.
      if (currentId === 'pancake-flip' && hasPancakeFlipHooks(hooks)) hooks.debugFinishNow();
    },
    finishSnowConeStandNow() {
      // Gated on the requested id for the same reason as
      // `finishPancakeFlipNow` above.
      if (currentId === 'snow-cone-stand' && hasSnowConeStandHooks(hooks)) hooks.debugFinishNow();
    },
    launch(minigameId) {
      if (!isMinigameId(minigameId)) return;
      try {
        hooks = launcher.launch(minigameId).minigame;
        currentId = minigameId;
      } catch {
        // Not registered in this build: a no-op, like an unknown `?minigame=`.
      }
    },
  };

  return true;
}
