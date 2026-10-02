// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomId } from '../../contracts';
import { stairwellExit } from './definitions/stairwell';
import type { RoomDoor } from './room-definition';
import {
  createStairKeys,
  installStairKeys,
  isEditableElement,
  STAIR_CHAIN_MIN_MS,
  STAIR_HOLD_MS,
  type StairKeyEvent,
  type StairKeysController,
} from './stair-keys';

interface Harness {
  keys: StairKeysController;
  used: RoomDoor[];
  room: { id: RoomId | null };
  probes: { transitioning: boolean; overlay: boolean; editable: boolean };
  moves: number;
  /** Arrives in `roomId` (as the navigator's room:enter would), then tells the keys. */
  arrive(roomId: RoomId): void;
}

/**
 * The controller against fake timers and a fake navigator: `useDoor` moves
 * `room.id` straight to the door's target (the transition itself is the
 * test's to finish, through `arrive`).
 */
function setup(start: RoomId | null): Harness {
  const harness = {
    used: [] as RoomDoor[],
    room: { id: start },
    probes: { transitioning: false, overlay: false, editable: false },
    moves: 0,
  } as Harness;
  harness.keys = createStairKeys({
    currentRoomId: () => harness.room.id,
    exitFor: (roomId, direction) => stairwellExit(roomId, direction),
    useDoor: (door) => {
      harness.used.push(door);
      if (door.targetRoomId) {
        harness.room.id = door.targetRoomId;
        harness.probes.transitioning = true;
      }
    },
    isTransitioning: () => harness.probes.transitioning,
    overlayOpen: () => harness.probes.overlay,
    editableFocused: () => harness.probes.editable,
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onMove: () => {
      harness.moves += 1;
    },
  });
  harness.arrive = (roomId) => {
    harness.room.id = roomId;
    harness.probes.transitioning = false;
    harness.keys.roomReady();
  };
  return harness;
}

function key(name: string, repeat = false): StairKeyEvent & { prevented: boolean } {
  const event = {
    key: name,
    repeat,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

const labels = (doors: RoomDoor[]) => doors.map((door) => door.label);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createStairKeys (#51 slice 4, S4-D10)', () => {
  it("climbs one flight after ArrowUp is held for 800 ms, through the floor's up door", () => {
    const h = setup('stairwell-2');
    const down = key('ArrowUp');
    h.keys.keydown(down);
    expect(down.prevented).toBe(true);

    vi.advanceTimersByTime(STAIR_HOLD_MS - 1);
    expect(h.used).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(labels(h.used)).toEqual(['FLOOR 3']);
    expect(h.used[0]).toBe(stairwellExit('stairwell-2', 'up'));
    expect(h.moves).toBe(1);
  });

  it('does nothing when the key is released before 800 ms', () => {
    const h = setup('stairwell-2');
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS - 100);
    h.keys.keyup(key('ArrowUp'));
    vi.advanceTimersByTime(5000);

    expect(h.used).toEqual([]);
  });

  it('keeps climbing while held, only once the next floor has loaded and 2 s have passed', () => {
    const h = setup('stairwell-1');
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    expect(labels(h.used)).toEqual(['FLOOR 2']);

    // The next floor isn't ready yet: no second climb, however long.
    vi.advanceTimersByTime(5000);
    expect(h.used).toHaveLength(1);

    // Ready 5 s after the move: past the 2 s, so it climbs straight away.
    h.arrive('stairwell-2');
    vi.advanceTimersByTime(0);
    expect(labels(h.used)).toEqual(['FLOOR 2', 'FLOOR 3']);

    // Ready 500 ms after the move: it waits out the rest of the 2 s.
    vi.advanceTimersByTime(500);
    h.arrive('stairwell-3');
    vi.advanceTimersByTime(STAIR_CHAIN_MIN_MS - 500 - 1);
    expect(h.used).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(labels(h.used)).toEqual(['FLOOR 2', 'FLOOR 3', 'FLOOR 4']);
  });

  it('descends with ArrowDown the same way', () => {
    const h = setup('stairwell-4');
    h.keys.keydown(key('ArrowDown'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    h.arrive('stairwell-3');
    vi.advanceTimersByTime(STAIR_CHAIN_MIN_MS);

    expect(labels(h.used)).toEqual(['FLOOR 3', 'FLOOR 2']);
  });

  it("takes floor 5's Roof Deck flight on a fresh ArrowUp, with no 2 s gate", () => {
    const h = setup('stairwell-4');
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    h.arrive('stairwell-5');
    h.keys.keyup(key('ArrowUp'));

    // A fresh press straight after the last flight: 800 ms, not 2 s.
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);

    expect(labels(h.used)).toEqual(['FLOOR 5', 'ROOF DECK']);
    expect(h.used[1]).toMatchObject({ targetRoomId: 'roof-deck' });
  });

  it('never chains a held key on through floor 5 to the Roof Deck (RT2-5)', () => {
    const h = setup('stairwell-4');
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    h.arrive('stairwell-5');
    vi.advanceTimersByTime(10_000);
    h.keys.keydown(key('ArrowUp', true));
    vi.advanceTimersByTime(10_000);

    expect(labels(h.used)).toEqual(['FLOOR 5']);
  });

  it("uses floor 0's LOBBY door on ArrowDown: its coming-soon hint once per press, never on a held chain (UD-7, RT2-5)", () => {
    const h = setup('stairwell-1');
    h.keys.keydown(key('ArrowDown'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    h.arrive('stairwell-0');
    vi.advanceTimersByTime(10_000);
    expect(labels(h.used)).toEqual(['LOBBY']);
    expect(h.used[0]).toMatchObject({ targetRoomId: 'stairwell-0' });

    h.keys.keyup(key('ArrowDown'));
    h.keys.keydown(key('ArrowDown'));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    h.keys.keydown(key('ArrowDown', true));
    vi.advanceTimersByTime(10_000);

    expect(h.used).toHaveLength(2);
    expect(h.used[1]).toMatchObject({ label: 'LOBBY', targetRoomId: null });
    expect(h.room.id).toBe('stairwell-0');
  });

  it('only keeps a hold alive on auto-repeat: a repeat never starts a hold of its own', () => {
    const h = setup('stairwell-2');
    const repeat = key('ArrowUp', true);
    h.keys.keydown(repeat);
    vi.advanceTimersByTime(5000);

    expect(repeat.prevented).toBe(true);
    expect(h.used).toEqual([]);

    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS / 2);
    h.keys.keydown(key('ArrowUp', true));
    vi.advanceTimersByTime(STAIR_HOLD_MS / 2);
    expect(labels(h.used)).toEqual(['FLOOR 3']);
  });

  it('does nothing, and lets the key through, while a text field has focus', () => {
    const h = setup('stairwell-2');
    h.probes.editable = true;
    const down = key('ArrowUp');
    h.keys.keydown(down);
    vi.advanceTimersByTime(5000);

    expect(down.prevented).toBe(false);
    expect(h.used).toEqual([]);
  });

  it('does nothing while any HUD overlay is open (the Map, a dialog, a Minigame, the quiz, feedback...)', () => {
    const h = setup('stairwell-2');
    h.probes.overlay = true;
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(5000);
    expect(h.used).toEqual([]);

    // An overlay opening mid-hold cancels it too.
    h.probes.overlay = false;
    h.keys.keydown(key('ArrowDown'));
    vi.advanceTimersByTime(STAIR_HOLD_MS / 2);
    h.probes.overlay = true;
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    expect(h.used).toEqual([]);
  });

  it('does nothing, and lets the key through, off the Stairwell', () => {
    for (const roomId of ['town-center', 'roof-deck', null] as const) {
      const h = setup(roomId);
      const down = key('ArrowUp');
      h.keys.keydown(down);
      vi.advanceTimersByTime(5000);
      expect(down.prevented, String(roomId)).toBe(false);
      expect(h.used).toEqual([]);
    }
  });

  it('waits out a transition still in flight, then climbs once the floor is ready', () => {
    const h = setup('stairwell-2');
    h.probes.transitioning = true;
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS + 5000);
    expect(h.used).toEqual([]);

    h.arrive('stairwell-2');
    vi.advanceTimersByTime(0);
    expect(labels(h.used)).toEqual(['FLOOR 3']);
  });

  it('cancels a hold on blur, so a stuck key never climbs', () => {
    const h = setup('stairwell-2');
    h.keys.keydown(key('ArrowUp'));
    vi.advanceTimersByTime(STAIR_HOLD_MS / 2);
    h.keys.blur();
    vi.advanceTimersByTime(5000);

    expect(h.used).toEqual([]);
  });

  it('ignores every other key', () => {
    const h = setup('stairwell-2');
    for (const name of ['ArrowLeft', 'ArrowRight', 'w', ' ']) {
      const event = key(name);
      h.keys.keydown(event);
      expect(event.prevented, name).toBe(false);
    }
    vi.advanceTimersByTime(5000);
    expect(h.used).toEqual([]);
  });
});

describe('installStairKeys', () => {
  it('listens on keydown/keyup/blur until uninstalled (sign-out), which also cancels a hold', () => {
    const h = setup('stairwell-2');
    const uninstall = installStairKeys(window, h.keys);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    vi.advanceTimersByTime(STAIR_HOLD_MS);
    expect(labels(h.used)).toEqual(['FLOOR 3']);

    h.arrive('stairwell-3');
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    uninstall();
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    vi.advanceTimersByTime(5000);

    expect(labels(h.used)).toEqual(['FLOOR 3']);
  });
});

describe('isEditableElement', () => {
  it('is true for inputs, textareas, selects and contenteditable, false otherwise', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inside = document.createElement('span');
    editable.append(inside);
    for (const element of [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      editable,
      inside,
    ]) {
      expect(isEditableElement(element), element.tagName).toBe(true);
    }
    expect(isEditableElement(document.createElement('button'))).toBe(false);
    expect(isEditableElement(document.body)).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});
