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

type EditorStore = Pick<ProgressStore, 'loadAll' | 'saveLook'>;

export interface LoadFailureCounts {
  loadAll: number;
  saveLook: number;
}

/**
 * Test-only (#164): wraps `inner` so its first `failures` `loadAll` calls
 * reject with an injected error, then pass through. `counts` tallies only the
 * calls made through this wrapper, so a direct `inner` call (the dev hook's
 * seed `saveLook`, Quest loads) never shows up in them.
 */
export function createLoadFailureStore(
  inner: EditorStore,
  failures: number,
): { store: EditorStore; counts: LoadFailureCounts } {
  const counts: LoadFailureCounts = { loadAll: 0, saveLook: 0 };
  let remaining = failures;
  const store: EditorStore = {
    loadAll() {
      counts.loadAll += 1;
      if (remaining > 0) {
        remaining -= 1;
        return Promise.reject(new Error('Injected load failure (test)'));
      }
      return inner.loadAll();
    },
    saveLook(look) {
      counts.saveLook += 1;
      return inner.saveLook(look);
    },
  };
  return { store, counts };
}

/**
 * Test-only (#164): with `?creator` and `failLoads=<n>` in the URL, and hooks
 * enabled (the same direct `import.meta.env.*` checks as
 * `initDevCreatorHook`, so Vite strips this from a production build), wraps
 * the Penguin editor's store so its first `n` loads fail, and exposes the
 * editor's own call counts as `window.__creatorDebug`. Applied only to the
 * store passed to `createPenguinEditor` (#164 RT B1): Quest loads and the
 * `?creator=returning` seed go through the unwrapped store, so they neither
 * consume an injected failure nor show in the counts. Otherwise returns
 * `inner` unchanged.
 */
export function withDevLoadFailures(inner: EditorStore): EditorStore {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return inner;
  const params = new URLSearchParams(window.location.search);
  const failLoads = Number(params.get('failLoads'));
  if (!params.has('creator') || !Number.isInteger(failLoads) || failLoads <= 0) return inner;
  const { store, counts } = createLoadFailureStore(inner, failLoads);
  window.__creatorDebug = {
    get loadAllCalls() {
      return counts.loadAll;
    },
    get saveLookCalls() {
      return counts.saveLook;
    },
  };
  return store;
}

declare global {
  interface Window {
    /** Test-only (#164): the Penguin editor's own store call counts. */
    __creatorDebug?: { readonly loadAllCalls: number; readonly saveLookCalls: number };
  }
}
