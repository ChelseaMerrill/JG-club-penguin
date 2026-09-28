import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import { ProgressStoreError, type ProgressStore } from '../persistence/progress-store';
import { createPenguinEditor, PENGUIN_CREATOR_OVERLAY_ID } from './penguin-editor';

const saved: PenguinLook = {
  ...DEFAULT_LOOK,
  name: 'Waddles',
  body: '#3a4046',
  emote: 'DANCE',
};

function setup(store: Pick<ProgressStore, 'loadAll' | 'saveLook'> = createInMemoryProgressStore()) {
  const creator = {
    open: vi.fn(),
    close: vi.fn(),
    setSaving: vi.fn(),
    showError: vi.fn(),
  };
  const overlays = { open: vi.fn(), close: vi.fn() };
  const loadError = { show: vi.fn(), hide: vi.fn(), setRetrying: vi.fn() };
  const onLookChanged = vi.fn();
  const onReady = vi.fn();
  const onError = vi.fn();
  const editor = createPenguinEditor({
    creator,
    store,
    overlays,
    loadError,
    onLookChanged,
    onReady,
    onError,
  });
  return { creator, overlays, loadError, store, onLookChanged, onReady, onError, editor };
}

type Snapshot = Awaited<ReturnType<ProgressStore['loadAll']>>;

/**
 * A store whose `loadAll` answers are scripted in order: `'fail'` rejects
 * with `not_authenticated`, a store resolves with that store's snapshot, and
 * `'defer'` returns a promise the test settles later through `pending`.
 */
function scriptedStore(script: Array<'fail' | 'defer' | Pick<ProgressStore, 'loadAll'>>) {
  const pending: Array<{ resolve: (s: Snapshot) => void; reject: (e: unknown) => void }> = [];
  let call = 0;
  const loadAll = vi.fn((): Promise<Snapshot> => {
    const step = script[Math.min(call, script.length - 1)];
    call += 1;
    if (step === 'fail') return Promise.reject(new ProgressStoreError('not_authenticated'));
    if (step === 'defer') {
      return new Promise<Snapshot>((resolve, reject) => pending.push({ resolve, reject }));
    }
    return step.loadAll();
  });
  const saveLook = vi.fn<(look: PenguinLook) => Promise<void>>(async () => {});
  return { store: { loadAll, saveLook }, pending };
}

/** Exactly one settled place for the Player (#164 D8): never hidden with no control. */
function settledPlaces(s: {
  loadError: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  creator: { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  onReady: ReturnType<typeof vi.fn>;
  signedOut: boolean;
}): string[] {
  const lastShow = s.loadError.show.mock.invocationCallOrder.at(-1) ?? 0;
  const lastHide = s.loadError.hide.mock.invocationCallOrder.at(-1) ?? 0;
  const lastOpen = s.creator.open.mock.invocationCallOrder.at(-1) ?? 0;
  const lastClose = s.creator.close.mock.invocationCallOrder.at(-1) ?? 0;
  const places: string[] = [];
  if (s.signedOut) return ['signed out'];
  if (lastShow > lastHide) places.push('load error');
  if (lastOpen > lastClose) places.push('creator');
  if (s.onReady.mock.calls.length > 0) places.push('world');
  return places;
}

/** A store whose first save has already completed the Creator, with a valid name. */
async function returningStore(): Promise<ProgressStore> {
  const store = createInMemoryProgressStore();
  await store.saveLook(saved);
  return store;
}

/**
 * A store whose Creator "completed" with an empty name. The real `saveLook`
 * rejects that (`players_penguin_name_check`), but a profile created before
 * names were required, or corrupted some other way, must still be caught by
 * the gate rather than trusted (#75).
 */
function createdButUnnamedStore(): Pick<ProgressStore, 'loadAll' | 'saveLook'> {
  const inner = createInMemoryProgressStore();
  return {
    loadAll: async () => ({
      ...(await inner.loadAll()),
      profileCreatedAt: '2020-01-01T00:00:00.000Z',
    }),
    saveLook: inner.saveLook,
  };
}

describe('createPenguinEditor', () => {
  it('opens the Creator, not dismissible, when the Creator was never completed', async () => {
    const { editor, creator, onReady, onLookChanged } = setup();

    await editor.playerSignedIn();

    // The default look, with an empty name: never seeded from Google.
    expect(creator.open).toHaveBeenCalledWith(DEFAULT_LOOK, { dismissible: false });
    expect(onReady).not.toHaveBeenCalled();
    expect(onLookChanged).not.toHaveBeenCalled();
  });

  it('opens the Creator, not dismissible, when the profile was created but the name is empty (#75)', async () => {
    const { editor, creator, onReady, onLookChanged } = setup(createdButUnnamedStore());

    await editor.playerSignedIn();

    expect(creator.open).toHaveBeenCalledWith(DEFAULT_LOOK, { dismissible: false });
    expect(onReady).not.toHaveBeenCalled();
    expect(onLookChanged).not.toHaveBeenCalled();
  });

  it('sends a returning, named Player straight in with their saved look', async () => {
    const { editor, creator, onReady, onLookChanged } = setup(await returningStore());

    await editor.playerSignedIn();

    expect(creator.open).not.toHaveBeenCalled();
    expect(onLookChanged).toHaveBeenCalledWith(saved);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('the first save completes the Creator, then lets the Player in', async () => {
    const { editor, creator, store, overlays, onReady, onLookChanged } = setup();
    await editor.playerSignedIn();

    await editor.submit(saved);

    expect(creator.setSaving).toHaveBeenNthCalledWith(1, true);
    expect(creator.setSaving).toHaveBeenLastCalledWith(false);
    expect(onLookChanged).toHaveBeenCalledWith(saved);
    expect(creator.close).toHaveBeenCalled();
    expect(overlays.close).toHaveBeenCalledWith(PENGUIN_CREATOR_OVERLAY_ID);
    expect(onReady).toHaveBeenCalledTimes(1);
    const snapshot = await store.loadAll();
    expect(snapshot.look).toEqual(saved);
    expect(snapshot.profileCreatedAt).not.toBeNull();
  });

  it('edit() reopens the saved look as a dismissible HUD overlay', async () => {
    const { editor, creator, overlays } = setup(await returningStore());
    await editor.playerSignedIn();

    editor.edit();

    expect(creator.open).toHaveBeenCalledWith(saved, { dismissible: true });
    expect(overlays.open).toHaveBeenCalledWith(PENGUIN_CREATOR_OVERLAY_ID, expect.any(Function));
    // The OverlayManager's close (Escape, or another overlay opening) closes
    // the Creator.
    overlays.open.mock.calls[0][1]();
    expect(creator.close).toHaveBeenCalled();
  });

  it('edit() does nothing while signed out or before the Creator is completed', async () => {
    const { editor, creator, overlays } = setup();

    editor.edit();
    await editor.playerSignedIn();
    creator.open.mockClear();
    editor.edit();

    expect(creator.open).not.toHaveBeenCalled();
    expect(overlays.open).not.toHaveBeenCalled();
  });

  it('cancel() closes only once the Player has a Penguin', async () => {
    const first = setup();
    await first.editor.playerSignedIn();
    first.editor.cancel();
    expect(first.creator.close).not.toHaveBeenCalled();

    const returning = setup(await returningStore());
    await returning.editor.playerSignedIn();
    returning.editor.edit();
    returning.editor.cancel();
    expect(returning.creator.close).toHaveBeenCalled();
    expect(returning.overlays.close).toHaveBeenCalledWith(PENGUIN_CREATOR_OVERLAY_ID);
  });

  it('a later save updates the look without calling onReady again', async () => {
    const { editor, onReady, onLookChanged } = setup(await returningStore());
    await editor.playerSignedIn();
    editor.edit();

    const next: PenguinLook = { ...saved, hat: 'NONE', emote: 'SIT' };
    await editor.submit(next);

    expect(onLookChanged).toHaveBeenLastCalledWith(next);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid name at the editor level without saving (#75)', async () => {
    const { editor, store, creator, onLookChanged, onReady } = setup();
    await editor.playerSignedIn();
    const saveLookSpy = vi.spyOn(store, 'saveLook');

    await editor.submit({ ...saved, name: '   ' });

    expect(saveLookSpy).not.toHaveBeenCalled();
    expect(creator.setSaving).not.toHaveBeenCalledWith(true);
    expect(onLookChanged).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(creator.close).not.toHaveBeenCalled();
  });

  it('shows the error and stays open when the store rejects the save', async () => {
    const { editor, creator, onLookChanged, onReady } = setup();
    await editor.playerSignedIn();

    await editor.submit({ ...saved, hat: 'NOT-A-HAT' as PenguinLook['hat'] });

    expect(creator.showError).toHaveBeenCalledWith("Couldn't save your Penguin: invalid_look");
    expect(creator.setSaving).toHaveBeenLastCalledWith(false);
    expect(onLookChanged).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(creator.close).not.toHaveBeenCalled();
  });

  // ---- #164: a failed load never opens the Creator, and never leads to a save ----

  it('(a) a load error shows the load-error state with the raw detail, never the Creator, and keeps the Player out', async () => {
    const { store } = scriptedStore(['fail']);
    const { editor, onError, onReady, creator, loadError } = setup(store);

    await editor.playerSignedIn();

    expect(loadError.show).toHaveBeenCalledWith('not_authenticated');
    expect(onError).toHaveBeenCalledWith("Couldn't load your Penguin: not_authenticated");
    expect(creator.open).not.toHaveBeenCalled();
    expect(creator.showError).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('(b) load fails, retry fails, submit: nothing is saved (the #164 test)', async () => {
    const { store } = scriptedStore(['fail', 'fail']);
    const s = setup(store);
    await s.editor.playerSignedIn();
    await s.editor.retry();

    await s.editor.submit(saved);

    expect(store.saveLook).not.toHaveBeenCalled();
    expect(s.creator.open).not.toHaveBeenCalled();
    expect(s.onReady).not.toHaveBeenCalled();
    expect(s.loadError.show).toHaveBeenCalledTimes(2);
    expect(settledPlaces({ ...s, signedOut: false })).toEqual(['load error']);
  });

  it('(c) submit straight after a load error saves nothing and does not reload', async () => {
    const { store } = scriptedStore(['fail']);
    const { editor } = setup(store);
    await editor.playerSignedIn();

    await editor.submit(saved);

    expect(store.saveLook).not.toHaveBeenCalled();
    expect(store.loadAll).toHaveBeenCalledTimes(1);
  });

  it('(d) a retry that finds no profile opens the new-Player Creator, whose save then lets the Player in', async () => {
    const { store } = scriptedStore(['fail', createInMemoryProgressStore()]);
    const s = setup(store);
    await s.editor.playerSignedIn();

    await s.editor.retry();

    expect(s.loadError.hide).toHaveBeenCalled();
    expect(s.creator.open).toHaveBeenCalledWith(DEFAULT_LOOK, { dismissible: false });
    expect(settledPlaces({ ...s, signedOut: false })).toEqual(['creator']);

    await s.editor.submit(saved);

    expect(store.saveLook).toHaveBeenCalledTimes(1);
    expect(store.saveLook).toHaveBeenCalledWith(saved);
    expect(s.onReady).toHaveBeenCalledTimes(1);
  });

  it('(e) a retry that finds a complete profile lets the Player in with it, without saving or the Creator', async () => {
    const { store } = scriptedStore(['fail', await returningStore()]);
    const s = setup(store);
    await s.editor.playerSignedIn();

    await s.editor.retry();

    expect(s.loadError.hide).toHaveBeenCalled();
    expect(s.onLookChanged).toHaveBeenCalledWith(saved);
    expect(s.onReady).toHaveBeenCalledTimes(1);
    expect(store.saveLook).not.toHaveBeenCalled();
    expect(s.creator.open).not.toHaveBeenCalled();
    expect(settledPlaces({ ...s, signedOut: false })).toEqual(['world']);
  });

  it('(f) signing out during an in-flight retry hides the state and drops the late result', async () => {
    const { store, pending } = scriptedStore(['fail', 'defer']);
    const s = setup(store);
    await s.editor.playerSignedIn();

    const done = s.editor.retry();
    s.editor.playerSignedOut();
    pending[0].resolve(await (await returningStore()).loadAll());
    await done;

    expect(s.loadError.hide).toHaveBeenCalled();
    expect(s.onReady).not.toHaveBeenCalled();
    expect(s.onLookChanged).not.toHaveBeenCalled();
    expect(s.creator.open).not.toHaveBeenCalled();
    expect(store.saveLook).not.toHaveBeenCalled();
    expect(settledPlaces({ ...s, signedOut: true })).toEqual(['signed out']);
  });

  it('(g) an account switch during an in-flight retry hides the old state first; only the new load decides', async () => {
    const { store, pending } = scriptedStore(['fail', 'defer', 'defer']);
    const s = setup(store);
    await s.editor.playerSignedIn();

    const staleRetry = s.editor.retry();
    const hidesBefore = s.loadError.hide.mock.calls.length;
    const nextSignIn = s.editor.playerSignedIn();
    expect(s.loadError.hide.mock.calls.length).toBe(hidesBefore + 1);
    // The new sign-in's load (pending[1]) finds a complete profile; the stale
    // retry (pending[0]) then resolves with an empty one and must be dropped.
    pending[1].resolve(await (await returningStore()).loadAll());
    await nextSignIn;
    pending[0].resolve(await createInMemoryProgressStore().loadAll());
    await staleRetry;

    expect(s.onReady).toHaveBeenCalledTimes(1);
    expect(s.onLookChanged).toHaveBeenCalledWith(saved);
    expect(s.creator.open).not.toHaveBeenCalled();
    expect(store.saveLook).not.toHaveBeenCalled();
    expect(settledPlaces({ ...s, signedOut: false })).toEqual(['world']);
  });

  it('(h) after every settled path exactly one place holds: load error, Creator, World or signed out', async () => {
    const cases: Array<
      [string, () => Promise<{ s: ReturnType<typeof setup>; signedOut: boolean }>]
    > = [
      [
        'load fails',
        async () => {
          const s = setup(scriptedStore(['fail']).store);
          await s.editor.playerSignedIn();
          return { s, signedOut: false };
        },
      ],
      [
        'retry fails',
        async () => {
          const s = setup(scriptedStore(['fail', 'fail']).store);
          await s.editor.playerSignedIn();
          await s.editor.retry();
          return { s, signedOut: false };
        },
      ],
      [
        'retry finds no profile',
        async () => {
          const s = setup(scriptedStore(['fail', createInMemoryProgressStore()]).store);
          await s.editor.playerSignedIn();
          await s.editor.retry();
          return { s, signedOut: false };
        },
      ],
      [
        'retry finds a profile',
        async () => {
          const s = setup(scriptedStore(['fail', await returningStore()]).store);
          await s.editor.playerSignedIn();
          await s.editor.retry();
          return { s, signedOut: false };
        },
      ],
      [
        'sign out from the error',
        async () => {
          const s = setup(scriptedStore(['fail']).store);
          await s.editor.playerSignedIn();
          s.editor.playerSignedOut();
          return { s, signedOut: true };
        },
      ],
    ];
    for (const [name, run] of cases) {
      const { s, signedOut } = await run();
      expect(settledPlaces({ ...s, signedOut }), name).toHaveLength(1);
    }
  });

  it('(i) a submit while the first load is still pending saves nothing', async () => {
    const { store, pending } = scriptedStore(['defer']);
    const { editor } = setup(store);

    const signIn = editor.playerSignedIn();
    await editor.submit(saved);
    pending[0].resolve(await createInMemoryProgressStore().loadAll());
    await signIn;

    expect(store.saveLook).not.toHaveBeenCalled();
  });

  it('(j) retry is a no-op while one is in flight or when not failed, and each retry is bracketed by setRetrying(true)/(false) before show/hide', async () => {
    // Not failed: a no-op.
    const idle = setup(scriptedStore([await returningStore()]).store);
    await idle.editor.retry();
    await idle.editor.playerSignedIn();
    await idle.editor.retry();
    expect(idle.store.loadAll).toHaveBeenCalledTimes(1);
    expect(idle.loadError.setRetrying).not.toHaveBeenCalledWith(true);

    // A second retry while one is in flight: one extra loadAll only.
    const { store, pending } = scriptedStore(['fail', 'defer']);
    const s = setup(store);
    await s.editor.playerSignedIn();
    s.loadError.setRetrying.mockClear();
    s.loadError.show.mockClear();
    const first = s.editor.retry();
    const second = s.editor.retry();
    expect(store.loadAll).toHaveBeenCalledTimes(2);
    pending[0].reject(new ProgressStoreError('not_authenticated'));
    await Promise.all([first, second]);
    // Failure path: exactly true, then false, and the false before the show.
    expect(s.loadError.setRetrying.mock.calls).toEqual([[true], [false]]);
    const failFalse = s.loadError.setRetrying.mock.invocationCallOrder[1];
    expect(failFalse).toBeLessThan(s.loadError.show.mock.invocationCallOrder[0]);

    // Success path: the next retry succeeds; false comes before hide.
    const ok = setup(scriptedStore(['fail', await returningStore()]).store);
    await ok.editor.playerSignedIn();
    ok.loadError.setRetrying.mockClear();
    ok.loadError.hide.mockClear();
    await ok.editor.retry();
    expect(ok.loadError.setRetrying.mock.calls).toEqual([[true], [false]]);
    expect(ok.loadError.setRetrying.mock.invocationCallOrder[1]).toBeLessThan(
      ok.loadError.hide.mock.invocationCallOrder[0],
    );
  });

  it('(l) after a sign-out or account switch during a retry, the next failure starts with a usable TRY AGAIN, and the stale retry makes no calls (RT W1)', async () => {
    for (const exit of ['sign-out', 'switch'] as const) {
      const { store, pending } = scriptedStore(['fail', 'defer', 'fail', 'fail']);
      const s = setup(store);
      await s.editor.playerSignedIn();
      const staleRetry = s.editor.retry();
      expect(s.loadError.setRetrying).toHaveBeenLastCalledWith(true);

      if (exit === 'sign-out') s.editor.playerSignedOut();
      const signIn = s.editor.playerSignedIn();
      expect(s.loadError.setRetrying, exit).toHaveBeenLastCalledWith(false);
      await signIn;
      // The new sign-in's load failed: shown, with no setRetrying(true) since the reset.
      expect(s.loadError.show, exit).toHaveBeenCalledTimes(2);
      expect(s.loadError.setRetrying, exit).toHaveBeenLastCalledWith(false);

      // The stale retry's guard is not left set: a new retry runs.
      const loadsBefore = store.loadAll.mock.calls.length;
      await s.editor.retry();
      expect(store.loadAll.mock.calls.length, exit).toBe(loadsBefore + 1);

      // The stale retry resolves afterwards and makes no call at all.
      const retryingCalls = s.loadError.setRetrying.mock.calls.length;
      const showCalls = s.loadError.show.mock.calls.length;
      const hideCalls = s.loadError.hide.mock.calls.length;
      pending[0].resolve(await (await returningStore()).loadAll());
      await staleRetry;
      expect(s.loadError.setRetrying.mock.calls.length, exit).toBe(retryingCalls);
      expect(s.loadError.show.mock.calls.length, exit).toBe(showCalls);
      expect(s.loadError.hide.mock.calls.length, exit).toBe(hideCalls);
      expect(s.onReady, exit).not.toHaveBeenCalled();
    }
  });

  it('signing out, and signing in, hide any load-error state and reset its retrying UI', async () => {
    const s = setup(scriptedStore(['fail', 'fail']).store);
    await s.editor.playerSignedIn();
    s.loadError.hide.mockClear();
    s.loadError.setRetrying.mockClear();

    s.editor.playerSignedOut();

    expect(s.loadError.setRetrying).toHaveBeenCalledWith(false);
    expect(s.loadError.hide).toHaveBeenCalled();

    // A new sign-in resets the same load-error state up front, before its
    // own load settles (even one that will itself fail).
    s.loadError.hide.mockClear();
    s.loadError.setRetrying.mockClear();
    const signIn = s.editor.playerSignedIn();
    expect(s.loadError.setRetrying).toHaveBeenCalledWith(false);
    expect(s.loadError.hide).toHaveBeenCalled();
    await signIn;
  });

  it('drops a load that finishes after the Player signed out', async () => {
    let finishLoad: () => void = () => {};
    const inner = await returningStore();
    const store = {
      loadAll: () =>
        new Promise<Awaited<ReturnType<ProgressStore['loadAll']>>>((resolve) => {
          finishLoad = () => void inner.loadAll().then(resolve);
        }),
      saveLook: inner.saveLook.bind(inner),
    };
    const { editor, onReady, onLookChanged } = setup(store);

    const done = editor.playerSignedIn();
    editor.playerSignedOut();
    finishLoad();
    await done;

    expect(onReady).not.toHaveBeenCalled();
    expect(onLookChanged).not.toHaveBeenCalled();
  });

  it('drops a save that finishes after the Player signed out', async () => {
    let finishSave: () => void = () => {};
    const inner = createInMemoryProgressStore();
    const store = {
      loadAll: inner.loadAll.bind(inner),
      saveLook: (look: PenguinLook) =>
        new Promise<void>((resolve) => {
          finishSave = () => void inner.saveLook(look).then(resolve);
        }),
    };
    const { editor, onLookChanged, onReady } = setup(store);
    await editor.playerSignedIn();

    const done = editor.submit(saved);
    editor.playerSignedOut();
    finishSave();
    await done;

    expect(onLookChanged).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('signing out closes the Creator', async () => {
    const { editor, creator, overlays } = setup();
    await editor.playerSignedIn();

    editor.playerSignedOut();

    expect(creator.close).toHaveBeenCalled();
    expect(overlays.close).toHaveBeenCalledWith(PENGUIN_CREATOR_OVERLAY_ID);
  });

  it('signing in as a different Player closes any Creator already open first (#75 R2-3)', async () => {
    const { editor, creator } = setup();
    await editor.playerSignedIn();
    expect(creator.open).toHaveBeenCalledTimes(1);
    creator.close.mockClear();

    await editor.playerSignedIn();

    expect(creator.close).toHaveBeenCalled();
  });
});
