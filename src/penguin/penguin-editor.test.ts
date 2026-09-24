import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../auth/player';
import { DEFAULT_APPEARANCE, type PenguinAppearance } from './appearance';
import { createPenguinEditor } from './penguin-editor';

const saved: PenguinAppearance = {
  ...DEFAULT_APPEARANCE,
  name: 'Waddles',
  body: '#3a4046',
};

const newPlayer: Player = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  penguinColor: '#00bdff',
  penguin: null,
};
const returningPlayer: Player = { ...newPlayer, penguinColor: '#3a4046', penguin: saved };

function setup(saveResult: { error: string | null } = { error: null }) {
  const creator = {
    open: vi.fn(),
    close: vi.fn(),
    setSaving: vi.fn(),
    showError: vi.fn(),
  };
  let resolveSave: (result: { error: string | null }) => void = () => {};
  const save = vi.fn(
    () =>
      new Promise<{ error: string | null }>((resolve) => {
        resolveSave = resolve;
      }),
  );
  const onPlayerChanged = vi.fn();
  const editor = createPenguinEditor({ creator, save, onPlayerChanged });
  return {
    creator,
    save,
    onPlayerChanged,
    editor,
    finishSave: () => resolveSave(saveResult),
  };
}

describe('createPenguinEditor', () => {
  it('opens the creator, not dismissible, for a Player with no Penguin', () => {
    const { editor, creator } = setup();

    editor.playerSignedIn(newPlayer);

    expect(creator.open).toHaveBeenCalledWith(
      { ...DEFAULT_APPEARANCE, name: 'Ada Lovelace' },
      { dismissible: false },
    );
  });

  it('does not open the creator for a returning Player', () => {
    const { editor, creator } = setup();

    editor.playerSignedIn(returningPlayer);

    expect(creator.open).not.toHaveBeenCalled();
  });

  it('edit() reopens the creator with the saved Penguin, dismissible', () => {
    const { editor, creator } = setup();
    editor.playerSignedIn(returningPlayer);

    editor.edit();

    expect(creator.open).toHaveBeenCalledWith(saved, { dismissible: true });
  });

  it('edit() does nothing while signed out', () => {
    const { editor, creator } = setup();

    editor.edit();

    expect(creator.open).not.toHaveBeenCalled();
  });

  it('cancel() closes only when the Player already has a Penguin', () => {
    const { editor, creator } = setup();
    editor.playerSignedIn(newPlayer);
    creator.close.mockClear();

    editor.cancel();
    expect(creator.close).not.toHaveBeenCalled();

    editor.playerSignedIn(returningPlayer);
    creator.close.mockClear();
    editor.cancel();
    expect(creator.close).toHaveBeenCalledTimes(1);
  });

  it('submit() saves, then reports the updated Player and closes', async () => {
    const { editor, creator, save, onPlayerChanged, finishSave } = setup();
    editor.playerSignedIn(newPlayer);

    const done = editor.submit(saved);
    expect(creator.setSaving).toHaveBeenCalledWith(true);
    expect(save).toHaveBeenCalledWith('user-1', saved);
    finishSave();
    await done;

    expect(creator.setSaving).toHaveBeenLastCalledWith(false);
    expect(onPlayerChanged).toHaveBeenCalledWith({
      ...newPlayer,
      penguin: saved,
      penguinColor: '#3a4046',
    });
    expect(creator.close).toHaveBeenCalled();
  });

  it('after a save, edit() reopens with the new Penguin', async () => {
    const { editor, creator, finishSave } = setup();
    editor.playerSignedIn(newPlayer);
    const done = editor.submit(saved);
    finishSave();
    await done;

    editor.edit();

    expect(creator.open).toHaveBeenLastCalledWith(saved, { dismissible: true });
  });

  it('submit() shows the error and stays open when the save fails', async () => {
    const { editor, creator, onPlayerChanged, finishSave } = setup({ error: 'permission denied' });
    editor.playerSignedIn(newPlayer);
    creator.close.mockClear();

    const done = editor.submit(saved);
    finishSave();
    await done;

    expect(creator.showError).toHaveBeenCalledWith("Couldn't save your Penguin: permission denied");
    expect(creator.setSaving).toHaveBeenLastCalledWith(false);
    expect(onPlayerChanged).not.toHaveBeenCalled();
    expect(creator.close).not.toHaveBeenCalled();
  });

  it('drops a save that finishes after the Player signed out', async () => {
    const { editor, onPlayerChanged, finishSave } = setup();
    editor.playerSignedIn(newPlayer);

    const done = editor.submit(saved);
    editor.playerSignedOut();
    finishSave();
    await done;

    expect(onPlayerChanged).not.toHaveBeenCalled();
  });
});
