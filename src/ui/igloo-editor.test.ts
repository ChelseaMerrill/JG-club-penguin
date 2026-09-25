// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayManager, type OverlayManager } from './hud/overlay-manager';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import { ProgressStoreError, type ProgressStore } from '../persistence/progress-store';
import { createIglooEditor, type IglooEditor } from './igloo-editor';

let currentEditor: IglooEditor | undefined;
let currentOverlays: OverlayManager | undefined;

function setup(store: ProgressStore = createInMemoryProgressStore()) {
  const root = document.createElement('div');
  document.body.append(root);
  const overlays = createOverlayManager();
  currentOverlays = overlays;
  const onEditModeChange = vi.fn();
  const onSlotsChanged = vi.fn();
  const editor = createIglooEditor(root, { store, overlays, onEditModeChange, onSlotsChanged });
  currentEditor = editor;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends Element = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(selector),
  ];
  return { root, editor, overlays, onEditModeChange, onSlotsChanged, store, q, qa };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentEditor?.destroy();
  currentEditor = undefined;
  currentOverlays?.destroy();
  currentOverlays = undefined;
});

describe('createIglooEditor: the EDIT IGLOO button', () => {
  it('is hidden until setVisible(true) (#41: owner-only, current Room is the Igloo)', () => {
    const { q } = setup();

    expect(q('.igloo-editor').hidden).toBe(true);
  });

  it('setVisible(true) shows it; setVisible(false) hides it and exits edit mode', () => {
    const { q, editor, onEditModeChange } = setup();

    editor.setVisible(true);
    expect(q('.igloo-editor').hidden).toBe(false);

    q<HTMLButtonElement>('.igloo-editor__button').click();
    expect(editor.isEditing()).toBe(true);

    editor.setVisible(false);
    expect(q('.igloo-editor').hidden).toBe(true);
    expect(editor.isEditing()).toBe(false);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
  });

  it('clicking the button toggles edit mode on and off, notifying the caller', () => {
    const { q, editor, onEditModeChange } = setup();
    editor.setVisible(true);
    const button = q<HTMLButtonElement>('.igloo-editor__button');

    button.click();
    expect(editor.isEditing()).toBe(true);
    expect(onEditModeChange).toHaveBeenLastCalledWith(true);

    button.click();
    expect(editor.isEditing()).toBe(false);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
  });

  it('with no Furniture owned, entering edit mode shows the hint', async () => {
    const { q, editor } = setup();
    editor.setVisible(true);

    q<HTMLButtonElement>('.igloo-editor__button').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(q('.igloo-editor__hint').hidden).toBe(false);
    expect(q('.igloo-editor__hint').textContent).toBe(
      'Visit the Igloo Gear stall on the Roof Deck to buy Furniture.',
    );
  });

  it('owning at least one item hides the hint', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    const { q, editor } = setup(store);
    editor.setVisible(true);

    q<HTMLButtonElement>('.igloo-editor__button').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(q('.igloo-editor__hint').hidden).toBe(true);
  });

  it('exitEditMode() turns edit mode off without a button click (e.g. leaving the Igloo)', () => {
    const { q, editor, onEditModeChange } = setup();
    editor.setVisible(true);
    q<HTMLButtonElement>('.igloo-editor__button').click();
    expect(editor.isEditing()).toBe(true);

    editor.exitEditMode();

    expect(editor.isEditing()).toBe(false);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
  });
});

describe('createIglooEditor: the slot picker', () => {
  it('lists only owned items plus Empty, marking the current one', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    await store.recordRound('bug-squash', 500, {
      score: 500,
      squashed: 0,
      bestCombo: 0,
      escaped: 0,
    });
    await store.purchase('desk');
    await store.setSlot(3, 'beanbag');
    const { q, qa, editor } = setup(store);

    await editor.openPicker({ id: 'slot-3' });

    expect(q('.igloo-slot-picker').hidden).toBe(false);
    expect(q('.igloo-slot-picker__title').textContent).toBe('SLOT 3');

    const names = qa('.igloo-slot-picker__option-name').map((n) => n.textContent);
    expect(names).toEqual(['Empty', 'Beanbag', 'Desk']);

    const beanbagOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === 'beanbag',
    )!;
    expect(beanbagOption.classList.contains('igloo-slot-picker__option--current')).toBe(true);
    const emptyOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === '',
    )!;
    expect(emptyOption.classList.contains('igloo-slot-picker__option--current')).toBe(false);
  });

  it('marks Empty as current for an empty slot', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    const { qa, editor } = setup(store);

    await editor.openPicker({ id: 'slot-1' });

    const emptyOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === '',
    )!;
    expect(emptyOption.classList.contains('igloo-slot-picker__option--current')).toBe(true);
  });

  it('an item not owned never appears in the picker list', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    const { qa, editor } = setup(store);

    await editor.openPicker({ id: 'slot-1' });

    const names = qa('.igloo-slot-picker__option-name').map((n) => n.textContent);
    expect(names).toEqual(['Empty', 'Beanbag']);
    expect(names).not.toContain('Arcade Cabinet');
  });

  it('choosing an item calls setSlot, closes the picker and refreshes', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    const setSlotSpy = vi.spyOn(store, 'setSlot');
    const { q, qa, editor, onSlotsChanged } = setup(store);

    await editor.openPicker({ id: 'slot-2' });
    const beanbagOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === 'beanbag',
    )!;
    beanbagOption.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setSlotSpy).toHaveBeenCalledWith(2, 'beanbag');
    expect(q('.igloo-slot-picker').hidden).toBe(true);
    expect(onSlotsChanged).toHaveBeenCalledTimes(1);
  });

  it('choosing Empty calls setSlot with null', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    await store.setSlot(4, 'beanbag');
    const setSlotSpy = vi.spyOn(store, 'setSlot');
    const { qa, editor } = setup(store);

    await editor.openPicker({ id: 'slot-4' });
    const emptyOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === '',
    )!;
    emptyOption.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setSlotSpy).toHaveBeenCalledWith(4, null);
  });

  it('a not_owned error (defensive; not reachable through this UI) shows an error rather than crashing', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    vi.spyOn(store, 'setSlot').mockRejectedValueOnce(new ProgressStoreError('not_owned'));
    const { q, qa, editor } = setup(store);

    await editor.openPicker({ id: 'slot-1' });
    const beanbagOption = qa<HTMLButtonElement>('.igloo-slot-picker__option').find(
      (b) => b.dataset.optionItemId === 'beanbag',
    )!;

    await expect(
      (async () => {
        beanbagOption.click();
        await Promise.resolve();
        await Promise.resolve();
      })(),
    ).resolves.toBeUndefined();

    expect(q('.igloo-slot-picker__error').textContent).not.toBe('');
    expect(q('.igloo-slot-picker').hidden).toBe(false);
    expect(beanbagOption.disabled).toBe(false);
  });

  it('registers with the OverlayManager so Escape closes it', async () => {
    const store = createInMemoryProgressStore();
    const { q, editor, overlays } = setup(store);

    await editor.openPicker({ id: 'slot-1' });
    expect(q('.igloo-slot-picker').hidden).toBe(false);
    expect(overlays.current()).toBe('igloo-slot-picker');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(q('.igloo-slot-picker').hidden).toBe(true);
    expect(overlays.current()).toBeNull();
  });

  it('the close button closes the picker via the OverlayManager', async () => {
    const { q, editor } = setup();

    await editor.openPicker({ id: 'slot-1' });
    q<HTMLButtonElement>('.igloo-slot-picker__close').click();

    expect(q('.igloo-slot-picker').hidden).toBe(true);
  });
});
