import { DEFAULT_LOOK } from '../contracts';
import type { ProgressStore } from '../persistence/progress-store';
import type { PenguinEditor } from './penguin-editor';

/**
 * Test-only: with `?creator` in the URL and either a dev server
 * (`import.meta.env.DEV`) or the Playwright preview server
 * (`VITE_E2E_HOOKS=true`), runs the Penguin Creator's sign-in flow without
 * real auth, against the in-memory ProgressStore: the Creator opens as on a
 * first sign-in (unnamed, non-dismissible per the #75 name gate), WADDLE IN
 * shows the HUD, and the HUD's PENGUIN button reopens it. No Session starts,
 * since there is no signed-in Player.
 *
 * `?creator=returning` instead seeds the store with a completed, named
 * profile (`saveLook`) before signing in, so `playerSignedIn` finds a
 * returning, named Player and skips the Creator straight to the HUD — the
 * e2e fixture for #75's "an existing named Player skips the Creator" case.
 *
 * Both env checks are direct `import.meta.env.*` reads, so Vite strips this
 * function's body from a production build, as `initDevHudHook` documents.
 *
 * Returns whether the hook activated, for `main.ts` to skip wiring real auth
 * events the same way `devHudActive` does.
 */
export function initDevCreatorHook(
  editor: Pick<PenguinEditor, 'playerSignedIn'>,
  store: Pick<ProgressStore, 'saveLook'>,
): boolean {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('creator')) return false;

  if (params.get('creator') === 'returning') {
    void (async () => {
      await store.saveLook({ ...DEFAULT_LOOK, name: 'Waddles' });
      await editor.playerSignedIn();
    })();
  } else {
    void editor.playerSignedIn();
  }
  return true;
}
