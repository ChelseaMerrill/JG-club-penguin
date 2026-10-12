import type { DoorPoint } from '../game/rooms/door-ui';
import './door-ui.css';

/** What the pill shows, from `RoomScene`'s `DOOR_HOVER_EVENT`. */
export interface DoorHoverView {
  text: string;
  point: DoorPoint;
  locked: boolean;
}

export interface DoorHover {
  show(view: DoorHoverView): void;
  hide(): void;
  /** The text showing, or `null` while hidden. */
  shownText(): string | null;
  destroy(): void;
}

/**
 * The door hover pill (#170 D3, after `design/door-nav.js`'s tip): a cyan
 * pill reading "CLICK TO ENTER · <Room>", grey ("<Room> · UNDER
 * CONSTRUCTION") for a locked door, sitting just above the point it's given
 * in Stage pixels (the pointer, or a focused door's top). Decoration only:
 * it never takes the pointer, and the door's focus button carries the same
 * text for assistive technology.
 */
export function createDoorHover(root: HTMLElement): DoorHover {
  const pill = document.createElement('div');
  pill.className = 'door-hover';
  pill.setAttribute('aria-hidden', 'true');
  pill.hidden = true;
  root.append(pill);

  return {
    show({ text, point, locked }) {
      pill.textContent = text;
      pill.classList.toggle('door-hover--locked', locked);
      pill.style.left = `${point.x}px`;
      pill.style.top = `${point.y}px`;
      pill.hidden = false;
    },
    hide() {
      pill.hidden = true;
    },
    shownText: () => (pill.hidden ? null : pill.textContent),
    destroy() {
      pill.remove();
    },
  };
}
