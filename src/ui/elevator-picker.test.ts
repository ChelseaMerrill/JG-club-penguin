// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOBBY_FLOOR_CHOICE } from '../game/rooms/definitions/elevator-choices';
import type { FloorChoice, RoomDoor } from '../game/rooms/room-definition';
import { createOverlayManager, type OverlayManager } from './hud/overlay-manager';
import {
  createElevatorPicker,
  ELEVATOR_PICKER_OVERLAY_ID,
  type ElevatorPicker,
} from './elevator-picker';

const ROOF: FloorChoice = {
  floor: 'R',
  label: 'ROOF DECK · THE MARKET',
  targetRoomId: 'roof-deck',
  entryTile: { col: 4, row: 9 },
};
const TOWN: FloorChoice = {
  floor: '5',
  label: 'TOWN CENTER',
  targetRoomId: 'town-center',
  entryTile: { col: 0, row: 7 },
};
const DOOR: RoomDoor = {
  label: 'ELEVATOR · ROOF DECK',
  hotspot: { x: 0, y: 0, width: 10, height: 10 },
  targetRoomId: 'roof-deck',
  entryTile: { col: 4, row: 9 },
  floorChoices: [ROOF, LOBBY_FLOOR_CHOICE],
};
const ROOF_DOOR: RoomDoor = {
  ...DOOR,
  label: 'ELEVATOR',
  floorChoices: [TOWN, LOBBY_FLOOR_CHOICE],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createElevatorPicker', () => {
  let root: HTMLElement;
  let overlays: OverlayManager;
  let picker: ElevatorPicker;
  let opener: HTMLButtonElement;

  const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');
  const chips = () =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('.elevator-picker__chip'));
  const chipTexts = () => chips().map((chip) => chip.textContent);
  const status = () => root.querySelector('.elevator-picker__status')?.textContent ?? '';
  const pressEscape = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    opener = document.createElement('button');
    document.body.append(opener, root);
    opener.focus();
    overlays = createOverlayManager();
    picker = createElevatorPicker(root, { overlays });
  });
  afterEach(() => {
    picker.destroy();
    overlays.destroy();
  });

  it('is an accessible modal dialog labelled by its heading, registered as an overlay', () => {
    void picker.pick(DOOR, '5');
    const el = dialog()!;
    expect(el.getAttribute('aria-modal')).toBe('true');
    const heading = root.querySelector(`#${el.getAttribute('aria-labelledby')}`);
    expect(heading?.textContent).toBe('ELEVATOR · PICK A FLOOR');
    expect(overlays.current()).toBe(ELEVATOR_PICKER_OVERLAY_ID);
  });

  it('shows the other floors high to low, and says which floor the Player is on', () => {
    void picker.pick(DOOR, '5');
    expect(root.querySelector('.elevator-picker__sub')?.textContent).toBe('YOU ARE ON 5');
    expect(chipTexts()).toEqual(['R / ROOF DECK · THE MARKET', 'L / LOBBY · UNDER CONSTRUCTION']);
    picker.cancel();
    void picker.pick(ROOF_DOOR, 'R');
    expect(root.querySelector('.elevator-picker__sub')?.textContent).toBe('YOU ARE ON R');
    expect(chipTexts()).toEqual(['5 / TOWN CENTER', 'L / LOBBY · UNDER CONSTRUCTION']);
  });

  it('marks L aria-disabled yet focusable, and never lists the current floor', () => {
    void picker.pick({ ...DOOR, floorChoices: [LOBBY_FLOOR_CHOICE, ROOF, TOWN] }, '5');
    expect(chipTexts()).toEqual(['R / ROOF DECK · THE MARKET', 'L / LOBBY · UNDER CONSTRUCTION']);
    const lobby = chips()[1]!;
    expect(lobby.getAttribute('aria-disabled')).toBe('true');
    expect(lobby.disabled).toBe(false);
  });

  it('focuses the first unlocked floor', () => {
    void picker.pick(DOOR, '5');
    expect(document.activeElement).toBe(chips()[0]);
  });

  it('resolves the chosen unlocked floor and closes', async () => {
    const result = picker.pick(DOOR, '5');
    chips()[0]!.click();
    expect(await result).toBe(ROOF);
    expect(dialog()).toBeNull();
    expect(overlays.current()).toBeNull();
  });

  it('the locked L chip shows UNDER CONSTRUCTION and keeps the picker open', async () => {
    let settled = false;
    const result = picker.pick(DOOR, '5').then((choice) => {
      settled = true;
      return choice;
    });
    chips()[1]!.click();
    await flush();
    expect(status()).toBe('UNDER CONSTRUCTION');
    expect(dialog()).not.toBeNull();
    expect(settled).toBe(false);
    picker.cancel();
    expect(await result).toBeNull();
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    void picker.pick(DOOR, '5');
    const stops = Array.from(dialog()!.querySelectorAll<HTMLElement>('button'));
    expect(stops.length).toBe(3);
    stops.at(-1)!.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    stops.at(-1)!.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    stops[0]!.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops.at(-1));
  });

  describe('every close path resolves null', () => {
    it('Esc', async () => {
      const result = picker.pick(DOOR, '5');
      pressEscape();
      expect(await result).toBeNull();
      expect(dialog()).toBeNull();
    });
    it('the × button', async () => {
      const result = picker.pick(DOOR, '5');
      root.querySelector<HTMLButtonElement>('.elevator-picker__close')!.click();
      expect(await result).toBeNull();
    });
    it('an outside click, but not a click inside the dialog', async () => {
      const result = picker.pick(DOOR, '5');
      dialog()!.click();
      expect(dialog()).not.toBeNull();
      root.querySelector<HTMLElement>('.elevator-picker')!.click();
      expect(await result).toBeNull();
      expect(dialog()).toBeNull();
    });
    it('another overlay opening', async () => {
      const result = picker.pick(DOOR, '5');
      overlays.open('map', () => {});
      expect(await result).toBeNull();
      expect(dialog()).toBeNull();
    });
    it('cancel() (sign-out or a Room change)', async () => {
      const result = picker.pick(DOOR, '5');
      picker.cancel();
      expect(await result).toBeNull();
      expect(overlays.current()).toBeNull();
    });
    it('a second pick supersedes the first', async () => {
      const first = picker.pick(DOOR, '5');
      void picker.pick(ROOF_DOOR, 'R');
      expect(await first).toBeNull();
      expect(chipTexts()[0]).toBe('5 / TOWN CENTER');
    });
  });

  it('returns focus to what had it before opening', async () => {
    void picker.pick(DOOR, '5');
    expect(document.activeElement).not.toBe(opener);
    pressEscape();
    await flush();
    expect(document.activeElement).toBe(opener);
  });
});
