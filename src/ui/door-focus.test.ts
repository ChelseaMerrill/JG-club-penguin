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

  describe('focus return (review MINOR-2)', () => {
    /** An overlay with one button, which takes focus as it opens (as the NPC dialog does). */
    function openOverlay(focusFirst: boolean): { close: () => void } {
      const panel = document.createElement('div');
      const button = document.createElement('button');
      panel.append(button);
      document.body.append(panel);
      const close = () => panel.remove();
      if (focusFirst) button.focus();
      overlays.open('dialog', close);
      if (!focusFirst) button.focus();
      return { close: () => overlays.close('dialog') };
    }

    it('re-focuses the exit used once its overlay closes and leaves focus nowhere', () => {
      focus.render([JG_HQ, STAIRS]);
      buttons()[1]!.focus();
      const dialog = openOverlay(false);
      expect(document.activeElement).not.toBe(buttons()[1]);
      dialog.close();
      expect(document.activeElement).toBe(buttons()[1]);
    });

    it('also when the closed overlay only hid its focused button (focus not yet moved off it)', () => {
      focus.render([JG_HQ, STAIRS]);
      buttons()[1]!.focus();
      const panel = document.createElement('div');
      const inner = document.createElement('button');
      panel.append(inner);
      document.body.append(panel);
      overlays.open('dialog', () => {
        panel.hidden = true;
      });
      inner.focus();
      overlays.close('dialog');
      expect(document.activeElement).toBe(buttons()[1]);
      panel.remove();
    });

    it('also when the overlay takes focus just before it opens (a blur in the same task)', () => {
      focus.render([JG_HQ, STAIRS]);
      buttons()[0]!.focus();
      const dialog = openOverlay(true);
      dialog.close();
      expect(document.activeElement).toBe(buttons()[0]);
    });

    it('leaves focus alone when something else has it after the close', () => {
      focus.render([JG_HQ, STAIRS]);
      buttons()[1]!.focus();
      overlays.open('menu', () => {});
      const elsewhere = document.createElement('input');
      document.body.append(elsewhere);
      overlays.close('menu');
      elsewhere.focus();
      focus.refresh();
      expect(document.activeElement).toBe(elsewhere);
      elsewhere.remove();
    });

    it('never pulls focus back after a plain Tab away, with nothing blocking', async () => {
      focus.render([JG_HQ]);
      buttons()[0]!.focus();
      buttons()[0]!.blur();
      await Promise.resolve();
      overlays.open('menu', () => {});
      overlays.close('menu');
      expect(document.activeElement).not.toBe(buttons()[0]);
    });

    it('re-focuses the same exit after a transition if the next Room has it, else forgets it', () => {
      focus.render([JG_HQ, STAIRS]);
      buttons()[1]!.focus();
      blocked = true;
      focus.refresh(); // room:leave mid-transition
      blocked = false;
      focus.render([STAIRS, JG_HQ]);
      expect(document.activeElement).toBe(buttons()[0]);

      blocked = true;
      focus.refresh();
      blocked = false;
      focus.render([LOBBY]);
      expect(document.activeElement).toBe(document.body);
    });
  });
});
