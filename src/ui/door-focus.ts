import { doorHoverText, doorTabOrder } from '../game/rooms/door-ui';
import type { RoomDoor } from '../game/rooms/room-definition';
import './door-ui.css';

export interface DoorFocusDeps {
  /** Enter or Space on an exit's button: uses it as a click does (`RoomScene.activateDoor`). */
  activate(door: RoomDoor): void;
  /** Focus moved onto an exit's button, or off every one (`null`): shows its hover pill and glow. */
  focusChanged(door: RoomDoor | null): void;
  /**
   * Whether the layer must be inert right now: an overlay open
   * (`hud.overlays.current() !== null`), the Elevator showing, a transition
   * in flight, or no Session.
   */
  isBlocked(): boolean;
}

export interface DoorFocus {
  /** Rebuilds the buttons for a Room's exits (on `room:enter`). */
  render(doors: readonly RoomDoor[]): void;
  /** Re-reads `isBlocked()` and makes the layer inert or not to match. */
  refresh(): void;
  destroy(): void;
}

/**
 * Keyboard access to doors (#170 D6): one invisible `<button>` per exit, in
 * the Room's `doors` order, appended after the HUD so the HUD keeps its own
 * Tab order. Each is labelled with its hover text; a twin (a pill repeating
 * an earlier door's label) gets `tabindex="-1"`, so each label is one Tab
 * stop (RT170-12), while a pill-only exit keeps its stop. Focus shows the
 * hover pill and glow; Enter or Space uses the exit as a click does. The
 * buttons never take the pointer (`pointer-events: none`), and the whole
 * layer is `inert` while `isBlocked()`: `refresh()` is called on every event
 * that can change it (overlays opening and closing, Room changes, the
 * Elevator hiding), with no polling. An exit focused when the layer was
 * blocked gets focus back once it's unblocked, if focus was left nowhere
 * (review MINOR-2: Enter on Anthony's door, then closing his dialog).
 */
export function createDoorFocus(root: HTMLElement, deps: DoorFocusDeps): DoorFocus {
  const layer = document.createElement('div');
  layer.className = 'door-focus';
  root.append(layer);

  /**
   * Review MINOR-2: the exit whose button had focus when the layer was
   * blocked (Anthony's dialog after Enter, PR C's picker), to focus again
   * once it's unblocked if focus was left nowhere.
   */
  let rememberedLabel: string | null = null;
  /** The button blurred in this task, for an overlay that takes focus just before it opens. */
  let blurredLabel: string | null = null;

  function buttonFor(label: string): HTMLButtonElement | undefined {
    return Array.from(layer.querySelectorAll<HTMLButtonElement>('.door-focus__door')).find(
      (button) => button.dataset.doorLabel === label,
    );
  }

  /**
   * Focus is on nothing a Player can see: no element, the body, or one just
   * hidden or removed with its overlay (the browser only moves focus off a
   * hidden element at its next style pass, after the close listeners ran).
   */
  function focusIsNowhere(): boolean {
    const active = document.activeElement;
    if (active === null || active === document.body) return true;
    return !active.isConnected || active.closest('[hidden]') !== null;
  }

  /** Focuses the remembered exit again if focus was left nowhere; forgets it either way. */
  function restoreFocus(): void {
    const label = rememberedLabel;
    rememberedLabel = null;
    if (label === null || !focusIsNowhere()) return;
    buttonFor(label)?.focus();
  }

  function refresh(): void {
    const blocked = deps.isBlocked();
    const active = document.activeElement as HTMLElement | null;
    const hadFocus = active !== null && layer.contains(active);
    if (blocked) {
      if (hadFocus) rememberedLabel = active.dataset.doorLabel ?? null;
      else if (blurredLabel !== null) rememberedLabel = blurredLabel;
    }
    layer.toggleAttribute('inert', blocked);
    if (blocked && hadFocus) {
      active.blur();
      deps.focusChanged(null);
    }
    if (!blocked) restoreFocus();
  }

  return {
    render(doors) {
      const hadFocus = layer.contains(document.activeElement);
      layer.replaceChildren(
        ...doorTabOrder(doors).map(({ door, tabbable }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'door-focus__door';
          button.tabIndex = tabbable ? 0 : -1;
          button.dataset.doorLabel = door.label;
          button.setAttribute('aria-label', doorHoverText(door));
          button.style.left = `${door.hotspot.x}px`;
          button.style.top = `${door.hotspot.y}px`;
          button.style.width = `${door.hotspot.width}px`;
          button.style.height = `${door.hotspot.height}px`;
          button.addEventListener('focus', () => deps.focusChanged(door));
          button.addEventListener('blur', () => {
            deps.focusChanged(null);
            blurredLabel = door.label;
            queueMicrotask(() => {
              if (blurredLabel === door.label) blurredLabel = null;
            });
          });
          // Enter and Space both click a focused button; the pointer never can.
          button.addEventListener('click', () => {
            if (!deps.isBlocked()) deps.activate(door);
          });
          return button;
        }),
      );
      if (hadFocus) deps.focusChanged(null);
      refresh();
    },
    refresh,
    destroy() {
      layer.remove();
    },
  };
}
