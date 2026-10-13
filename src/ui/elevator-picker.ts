import './elevator-picker.css';
import { FLOOR_ORDER, type FloorId } from '../game/rooms/floors';
import type { FloorChoice, RoomDoor } from '../game/rooms/room-definition';
import type { OverlayManager } from './hud/overlay-manager';

/** The id `main.ts` registers this overlay with on `hud.overlays`. */
export const ELEVATOR_PICKER_OVERLAY_ID = 'elevator-picker';

/** The approved copy (#170 D9). */
export const ELEVATOR_PICKER_COPY = {
  heading: 'ELEVATOR · PICK A FLOOR',
  youAreOn: (floor: FloorId) => `YOU ARE ON ${floor}`,
  underConstruction: 'UNDER CONSTRUCTION',
} as const;

export interface ElevatorPickerDeps {
  /** Opening registers here (so Esc, another overlay and the door-focus layer all see it). */
  overlays: OverlayManager;
}

export interface ElevatorPicker {
  /**
   * Shows the floors `door` offers other than `currentFloor`, resolving the
   * unlocked floor the Player picks, or `null` on every other close path
   * (Esc, the close button, an outside click, another overlay opening,
   * `cancel()`). A pick while one is open supersedes it (resolving it `null`).
   */
  pick(door: RoomDoor, currentFloor: FloorId): Promise<FloorChoice | null>;
  /** Closes it, resolving `null` (sign-out, a Room change). A no-op when closed. */
  cancel(): void;
  destroy(): void;
}

const TITLE_ID = 'elevator-picker-title';

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

/**
 * The Elevator floor picker (#170 D9, RT170-11): a modal dialog over the Stage
 * listing a door's floors high to low. Locked floors (no target Room) stay
 * focusable and `aria-disabled`; choosing one says UNDER CONSTRUCTION and
 * keeps it open. Tab cycles inside it, and focus returns to whatever had it
 * when it closes (the door's focus proxy, for a keyboard Player).
 */
export function createElevatorPicker(root: HTMLElement, deps: ElevatorPickerDeps): ElevatorPicker {
  let scrim: HTMLElement | null = null;
  let settle: ((choice: FloorChoice | null) => void) | null = null;
  let opener: HTMLElement | null = null;

  /** Tears down and resolves; the one place every close path ends up. */
  function finish(choice: FloorChoice | null): void {
    const resolve = settle;
    if (!resolve) return;
    settle = null;
    scrim?.remove();
    scrim = null;
    resolve(choice);
    const back = opener;
    opener = null;
    if (choice === null && back) {
      // After the close listeners ran (the door-focus layer wakes in them).
      queueMicrotask(() => {
        if (back.isConnected && deps.overlays.current() === null) back.focus();
      });
    }
  }

  function trapTab(event: KeyboardEvent, dialog: HTMLElement): void {
    if (event.key !== 'Tab') return;
    const stops = Array.from(dialog.querySelectorAll<HTMLElement>('button'));
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function cancel(): void {
    // Through the overlay manager, so its `onClose` listeners fire too.
    deps.overlays.close(ELEVATOR_PICKER_OVERLAY_ID);
    finish(null);
  }

  function pick(door: RoomDoor, currentFloor: FloorId): Promise<FloorChoice | null> {
    cancel();
    const choices = (door.floorChoices ?? [])
      .filter((choice) => choice.floor !== currentFloor)
      .sort((a, b) => FLOOR_ORDER.indexOf(b.floor) - FLOOR_ORDER.indexOf(a.floor));

    return new Promise<FloorChoice | null>((resolve) => {
      settle = resolve;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const layer = el('div', 'elevator-picker');
      scrim = layer;
      const dialog = el('div', 'elevator-picker__dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', TITLE_ID);
      // A click on its text keeps focus inside, so the Tab trap still holds.
      dialog.tabIndex = -1;

      const header = el('div', 'elevator-picker__header');
      const title = el('h2', 'elevator-picker__title', ELEVATOR_PICKER_COPY.heading);
      title.id = TITLE_ID;
      const close = el('button', 'elevator-picker__close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', cancel);
      header.append(title, close);

      const sub = el('p', 'elevator-picker__sub', ELEVATOR_PICKER_COPY.youAreOn(currentFloor));
      const list = el('div', 'elevator-picker__chips');
      const status = el('p', 'elevator-picker__status');
      status.setAttribute('role', 'status');

      let firstUnlocked: HTMLButtonElement | null = null;
      for (const choice of choices) {
        const locked = choice.targetRoomId === null;
        const text = `${choice.floor} / ${choice.label}`;
        const chip = el(
          'button',
          'elevator-picker__chip',
          locked ? `${text} · ${ELEVATOR_PICKER_COPY.underConstruction}` : text,
        );
        chip.type = 'button';
        chip.dataset.floor = choice.floor;
        if (locked) {
          chip.classList.add('elevator-picker__chip--locked');
          chip.setAttribute('aria-disabled', 'true');
        } else {
          firstUnlocked ??= chip;
        }
        chip.addEventListener('click', () => {
          if (locked) {
            status.textContent = ELEVATOR_PICKER_COPY.underConstruction;
            return;
          }
          // Resolve the choice first: closing the overlay would resolve `null`.
          finish(choice);
          deps.overlays.close(ELEVATOR_PICKER_OVERLAY_ID);
        });
        list.append(chip);
      }

      dialog.append(header, sub, list, status);
      dialog.addEventListener('keydown', (event) => trapTab(event, dialog));
      layer.addEventListener('click', (event) => {
        if (event.target === layer) cancel();
      });
      layer.append(dialog);
      root.append(layer);

      // Registered before focus moves, so the door-focus layer remembers the
      // door that had focus before it goes inert.
      deps.overlays.open(ELEVATOR_PICKER_OVERLAY_ID, () => finish(null));
      (firstUnlocked ?? list.querySelector<HTMLElement>('button') ?? close).focus();
    });
  }

  return {
    pick,
    cancel,
    destroy: cancel,
  };
}
