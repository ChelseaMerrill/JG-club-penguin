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
 * Elevator hiding), with no polling.
 */
export function createDoorFocus(root: HTMLElement, deps: DoorFocusDeps): DoorFocus {
  const layer = document.createElement('div');
  layer.className = 'door-focus';
  root.append(layer);

  function refresh(): void {
    const blocked = deps.isBlocked();
    const hadFocus = layer.contains(document.activeElement);
    layer.toggleAttribute('inert', blocked);
    if (blocked && hadFocus) {
      (document.activeElement as HTMLElement | null)?.blur();
      deps.focusChanged(null);
    }
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
          button.addEventListener('blur', () => deps.focusChanged(null));
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
