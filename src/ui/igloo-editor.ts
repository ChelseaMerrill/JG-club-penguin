import { iglooSlotForSlotId } from '../game/rooms/furniture-slots';
import type { OverlayManager } from './hud/overlay-manager';
import { buildIcon } from './market';
import {
  ProgressStoreError,
  type IglooSlot,
  type ProgressStore,
  type ShopItem,
} from '../persistence/progress-store';
import './igloo-editor.css';

/** The id `main.ts` registers the slot picker with on `hud.overlays` (#41). */
export const IGLOO_SLOT_PICKER_OVERLAY_ID = 'igloo-slot-picker';

/** #41 resolved decision 3's exact hint copy: the design has none of its own for an empty Igloo. */
const NO_FURNITURE_HINT = 'Visit the Igloo Gear stall on the Roof Deck to buy Furniture.';

export interface IglooEditorOptions {
  store: Pick<ProgressStore, 'loadAll' | 'setSlot'>;
  /** The same `OverlayManager` the Trophy Case/Market register the picker with, so Escape closes it and only one overlay is open (#41 resolved decision 3). */
  overlays: OverlayManager;
  /**
   * Forwarded to `RoomScene.setFurnitureEditMode` whenever edit mode turns
   * on or off, so the Scene highlights (or un-highlights) the six slots.
   */
  onEditModeChange: (on: boolean) => void;
  /**
   * Called after a placement/removal actually saves, so the caller can
   * reload the Igloo's `ProgressSnapshot` and push it into
   * `RoomScene.setFurniture` again.
   */
  onSlotsChanged: () => void;
}

/** The minimal slot shape `openPicker` needs: `RoomScene`'s `FurnitureSlotClickEvent.slot`. */
export interface IglooEditorSlot {
  id: string;
}

export interface IglooEditor {
  /**
   * Shows or hides the "EDIT IGLOO" button (#41 resolved decision 3: the
   * current Room is the Igloo and a Player is signed in -- visiting another
   * Player's Igloo is out of scope for this build, so this is always the
   * owner's own). Hiding it while edit mode is on also exits edit mode.
   */
  setVisible(visible: boolean): void;
  /** True while edit mode is on. */
  isEditing(): boolean;
  /**
   * Turns edit mode off and closes the picker, without the Player clicking
   * the button themselves: leaving the Igloo, signing out, or Snowball mode
   * turning on (#41 resolved decision 4). A no-op while already off.
   */
  exitEditMode(): void;
  /** Opens the picker for one Furniture slot (#41), in response to `RoomScene`'s `FURNITURE_SLOT_CLICK_EVENT`. */
  openPicker(slot: IglooEditorSlot): Promise<void>;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

/**
 * Mounts the Igloo's Furniture editor (#41): the owner-only "EDIT IGLOO"
 * button/no-Furniture hint (a small standalone widget, not part of
 * `hud.ts`'s bottom bar) and the per-slot DOM picker, both direct children of
 * `root` (the `#ui` layer), following `trophy-case.ts`/`market.ts`'s
 * pattern. The six slot markers/click handling live in `RoomScene`
 * (`setFurnitureEditMode`/`onFurnitureSlotClick`); this module only renders
 * its own DOM and reads/writes through `options.store`.
 */
export function createIglooEditor(root: HTMLElement, options: IglooEditorOptions): IglooEditor {
  let editing = false;
  /** Bumped on every `openPicker`/`toggleEdit` load so a stale response never applies after a newer one started. */
  let loadToken = 0;

  // ---- The "EDIT IGLOO" button + no-Furniture hint ----
  const panel = el('div', 'igloo-editor');
  panel.hidden = true;
  const editButton = button('igloo-editor__button', 'EDIT IGLOO');
  const hint = el('div', 'igloo-editor__hint', NO_FURNITURE_HINT);
  hint.hidden = true;
  panel.append(editButton, hint);
  root.append(panel);

  // ---- The per-slot picker ----
  const picker = el('div', 'igloo-slot-picker');
  picker.hidden = true;
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-modal', 'true');
  picker.setAttribute('aria-labelledby', 'igloo-slot-picker-title');

  const pickerFrame = el('div', 'igloo-slot-picker__frame');
  const pickerHeader = el('div', 'igloo-slot-picker__header');
  const pickerTitle = el('div', 'igloo-slot-picker__title');
  pickerTitle.id = 'igloo-slot-picker-title';
  const pickerClose = button('igloo-slot-picker__close', '✕');
  pickerClose.setAttribute('aria-label', 'Close');
  pickerHeader.append(pickerTitle, pickerClose);

  const pickerError = el('p', 'igloo-slot-picker__error');
  pickerError.setAttribute('role', 'alert');

  const pickerList = el('div', 'igloo-slot-picker__list');

  pickerFrame.append(pickerHeader, pickerError, pickerList);
  picker.append(pickerFrame);
  root.append(picker);

  function closePicker(): void {
    picker.hidden = true;
  }

  pickerClose.addEventListener('click', () => options.overlays.close(IGLOO_SLOT_PICKER_OVERLAY_ID));

  function setError(message: string): void {
    pickerError.textContent = message;
  }

  function setEditing(next: boolean): void {
    editing = next;
    editButton.classList.toggle('igloo-editor__button--active', next);
    editButton.textContent = next ? 'DONE EDITING' : 'EDIT IGLOO';
    if (!next) {
      hint.hidden = true;
      closePicker();
      options.overlays.close(IGLOO_SLOT_PICKER_OVERLAY_ID);
    }
    options.onEditModeChange(next);
  }

  async function toggleEdit(): Promise<void> {
    if (editing) {
      setEditing(false);
      return;
    }
    setEditing(true);
    const token = ++loadToken;
    try {
      const snapshot = await options.store.loadAll();
      if (token !== loadToken || !editing) return; // Superseded or exited before this resolved.
      hint.hidden = snapshot.ownedItems.length > 0;
    } catch {
      // Best-effort: the hint simply stays hidden if the load fails; the
      // slots themselves are still highlighted and clickable.
    }
  }

  editButton.addEventListener('click', () => void toggleEdit());

  interface OptionEntry {
    itemId: string | null;
    label: string;
    artKey: string | null;
  }

  function renderOptions(
    entries: readonly OptionEntry[],
    currentItemId: string | null,
    iglooSlot: IglooSlot,
  ): void {
    pickerList.replaceChildren();
    for (const entry of entries) {
      const optionButton = button('igloo-slot-picker__option');
      optionButton.dataset.optionItemId = entry.itemId ?? '';
      const isCurrent = entry.itemId === currentItemId;
      optionButton.classList.toggle('igloo-slot-picker__option--current', isCurrent);
      if (isCurrent) optionButton.setAttribute('aria-current', 'true');

      if (entry.artKey) {
        optionButton.append(buildIcon(entry.artKey));
      } else {
        optionButton.append(el('div', 'igloo-slot-picker__option-empty-icon'));
      }
      optionButton.append(el('div', 'igloo-slot-picker__option-name', entry.label));

      optionButton.addEventListener('click', () => void chooseOption(entry, iglooSlot));
      pickerList.append(optionButton);
    }
  }

  async function chooseOption(entry: OptionEntry, iglooSlot: IglooSlot): Promise<void> {
    setError('');
    const buttons = [
      ...pickerList.querySelectorAll<HTMLButtonElement>('.igloo-slot-picker__option'),
    ];
    for (const b of buttons) b.disabled = true;
    try {
      await options.store.setSlot(iglooSlot, entry.itemId);
      if (picker.hidden) return; // Closed again before `setSlot` resolved.
      options.overlays.close(IGLOO_SLOT_PICKER_OVERLAY_ID);
      options.onSlotsChanged();
    } catch (error) {
      if (picker.hidden) return;
      if (error instanceof ProgressStoreError && error.code === 'not_owned') {
        // Not reachable through this UI (the list is built from owned items
        // only), but handled rather than left to crash (#41 test plan).
        setError("Couldn't place that item. Try again.");
      } else {
        setError('Something went wrong. Try again.');
      }
      for (const b of buttons) b.disabled = false;
    }
  }

  async function openPicker(slot: IglooEditorSlot): Promise<void> {
    const iglooSlot = iglooSlotForSlotId(slot.id);
    if (iglooSlot === null) return; // Defensive: RoomScene only ever emits a registered slot id.

    pickerTitle.textContent = `SLOT ${iglooSlot}`;
    setError('');
    pickerList.replaceChildren();
    picker.hidden = false;
    options.overlays.open(IGLOO_SLOT_PICKER_OVERLAY_ID, closePicker);

    const token = ++loadToken;
    const snapshot = await options.store.loadAll();
    if (token !== loadToken || picker.hidden) return; // Closed again before `loadAll` resolved.

    const catalogById = new Map<string, ShopItem>(snapshot.catalog.map((item) => [item.id, item]));
    const entries: OptionEntry[] = [
      { itemId: null, label: 'Empty', artKey: null },
      ...snapshot.ownedItems.map((itemId) => {
        const item = catalogById.get(itemId);
        return { itemId, label: item?.name ?? itemId, artKey: item?.artKey ?? itemId };
      }),
    ];
    renderOptions(entries, snapshot.slots[iglooSlot], iglooSlot);
  }

  return {
    setVisible(next) {
      panel.hidden = !next;
      if (!next) setEditing(false);
    },
    isEditing: () => editing,
    exitEditMode() {
      if (editing) setEditing(false);
    },
    openPicker,
    destroy() {
      panel.remove();
      picker.remove();
    },
  };
}
