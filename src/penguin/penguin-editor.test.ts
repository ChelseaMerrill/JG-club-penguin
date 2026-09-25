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
  const onLookChanged = vi.fn();
  const onReady = vi.fn();
  const onError = vi.fn();
  const editor = createPenguinEditor({
    creator,
    store,
    overlays,
    onLookChanged,
    onReady,
    onError,
  });
  return { creator, overlays, store, onLookChanged, onReady, onError, editor };
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

  it('a load error opens the non-dismissible Creator and reports it, without letting the Player in', async () => {
    const store = {
      loadAll: vi.fn().mockRejectedValue(new ProgressStoreError('not_authenticated')),
      saveLook: vi.fn(),
    };
    const { editor, onError, onReady, creator } = setup(store);

    await editor.playerSignedIn();

    expect(onError).toHaveBeenCalledWith("Couldn't load your Penguin: not_authenticated");
    expect(creator.open).toHaveBeenCalledWith(DEFAULT_LOOK, { dismissible: false });
    expect(creator.showError).toHaveBeenCalledWith("Couldn't load your Penguin: not_authenticated");
    expect(onReady).not.toHaveBeenCalled();
  });

  it('on submit after a load error, a reload that finds a named profile wins without saving', async () => {
    const inner = await returningStore();
    const store = {
      loadAll: vi
        .fn()
        .mockRejectedValueOnce(new ProgressStoreError('not_authenticated'))
        .mockImplementation(() => inner.loadAll()),
      saveLook: vi.fn(inner.saveLook.bind(inner)),
    };
    const { editor, onReady, onLookChanged, creator } = setup(store);
    await editor.playerSignedIn();

    await editor.submit(saved);

    expect(store.saveLook).not.toHaveBeenCalled();
    expect(onLookChanged).toHaveBeenCalledWith(saved);
    expect(creator.close).toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('on submit after a load error, a reload that is still unnamed or fails saves the submitted look instead', async () => {
    const store = {
      loadAll: vi.fn().mockRejectedValue(new ProgressStoreError('not_authenticated')),
      saveLook: vi.fn().mockResolvedValue(undefined),
    };
    const { editor, onReady, onLookChanged, creator } = setup(store);
    await editor.playerSignedIn();

    await editor.submit(saved);

    expect(store.saveLook).toHaveBeenCalledWith(saved);
    expect(onLookChanged).toHaveBeenCalledWith(saved);
    expect(creator.close).toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
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
