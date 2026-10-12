// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomDoor } from '../game/rooms/room-definition';
import { createOverlayManager, type OverlayManager } from './hud/overlay-manager';
import { createDoorFocus, type DoorFocus } from './door-focus';

function door(label: string, extra: Partial<RoomDoor> = {}): RoomDoor {
  return {
    label,
    hotspot: { x: 10, y: 20, width: 70, height: 165 },
    targetRoomId: 'town-center',
    entryTile: { col: 0, row: 0 },
    ...extra,
  };
}

const JG_HQ = door('JG HQ');
const STAIRS = door('STAIRS', { targetRoomId: 'stairwell-1' });
const JG_HQ_PILL = door('JG HQ', { kind: 'pill' });
const LOBBY = door('LOBBY', { targetRoomId: null });

let root: HTMLElement;
let overlays: OverlayManager;
let focus: DoorFocus;
let blocked: boolean;
const activate = vi.fn<(door: RoomDoor) => void>();
const focusChanged = vi.fn<(door: RoomDoor | null) => void>();

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  overlays = createOverlayManager();
  blocked = false;
  activate.mockReset();
  focusChanged.mockReset();
  focus = createDoorFocus(root, {
    activate,
    focusChanged,
    isBlocked: () => blocked || overlays.current() !== null,
  });
  overlays.onOpen(() => focus.refresh());
  overlays.onClose(() => focus.refresh());
});

afterEach(() => {
  focus.destroy();
  overlays.destroy();
  root.remove();
});

function buttons(): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.door-focus__door'));
}

function layer(): HTMLElement {
  return root.querySelector('.door-focus') as HTMLElement;
}

describe('createDoorFocus (#170 D6)', () => {
  it('makes one labelled button per exit in doors order; a twin is not a Tab stop (RT170-12)', () => {
    focus.render([JG_HQ, STAIRS, JG_HQ_PILL, LOBBY]);
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'CLICK TO ENTER · JG HQ',
      'CLICK TO ENTER · STAIRS',
      'CLICK TO ENTER · JG HQ',
      'LOBBY · UNDER CONSTRUCTION',
    ]);
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, 0, -1, 0]);
    expect(buttons()[0]!.type).toBe('button');
    expect(buttons()[0]!.style.left).toBe('10px');
    expect(buttons()[0]!.style.height).toBe('165px');
  });

  it('focus shows the door (and blur clears it); Enter or Space (a click) uses it', () => {
    focus.render([JG_HQ, STAIRS]);
    buttons()[1]!.focus();
    expect(focusChanged).toHaveBeenLastCalledWith(STAIRS);
    buttons()[1]!.click();
    expect(activate).toHaveBeenCalledWith(STAIRS);
    buttons()[1]!.blur();
    expect(focusChanged).toHaveBeenLastCalledWith(null);
  });

  it('goes inert while an overlay is open and wakes on onClose, with no polling', () => {
    focus.render([JG_HQ]);
    expect(layer().hasAttribute('inert')).toBe(false);

    buttons()[0]!.focus();
    overlays.open('menu', () => {});
    expect(layer().hasAttribute('inert')).toBe(true);
    expect(focusChanged).toHaveBeenLastCalledWith(null);
    expect(document.activeElement).not.toBe(buttons()[0]);

    overlays.close('menu');
    expect(layer().hasAttribute('inert')).toBe(false);
  });

  it('never uses a door while blocked, even if a click gets through', () => {
    focus.render([JG_HQ]);
    blocked = true;
    buttons()[0]!.click();
    expect(activate).not.toHaveBeenCalled();
  });

  it('renders inert when blocked (mid-transition), and a refresh wakes it', () => {
    blocked = true;
    focus.render([JG_HQ]);
    expect(layer().hasAttribute('inert')).toBe(true);
    blocked = false;
    focus.refresh();
    expect(layer().hasAttribute('inert')).toBe(false);
  });

  it('rebuilding for the next Room drops any focus shown', () => {
    focus.render([JG_HQ]);
    buttons()[0]!.focus();
    focusChanged.mockReset();
    focus.render([STAIRS]);
    expect(focusChanged).toHaveBeenCalledWith(null);
    expect(buttons().map((b) => b.dataset.doorLabel)).toEqual(['STAIRS']);
  });
});
