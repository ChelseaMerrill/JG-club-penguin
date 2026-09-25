import type { PenguinEditor } from './penguin-editor';

/**
 * Test-only: with `?creator` in the URL and either a dev server
 * (`import.meta.env.DEV`) or the Playwright preview server
 * (`VITE_E2E_HOOKS=true`), runs the Penguin Creator's sign-in flow without
 * real auth, against the in-memory ProgressStore: the Creator opens as on a
 * first sign-in, WADDLE IN shows the HUD, and the HUD's PENGUIN button
 * reopens it. No Session starts, since there is no signed-in Player. Both
 * env checks are direct `import.meta.env.*` reads, so Vite strips this
 * function's body from a production build, as `initDevHudHook` documents.
 *
 * Returns whether the hook activated, for `main.ts` to skip wiring real auth
 * events the same way `devHudActive` does.
 */
export function initDevCreatorHook(editor: Pick<PenguinEditor, 'playerSignedIn'>): boolean {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;
  if (!new URLSearchParams(window.location.search).has('creator')) return false;
  void editor.playerSignedIn();
  return true;
}
