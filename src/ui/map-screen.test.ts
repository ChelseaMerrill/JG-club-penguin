// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../contracts';
import { createOverlayManager } from './hud/overlay-manager';
import { createMapScreen, MAP_OVERLAY_ID, type MapScreen } from './map-screen';

let currentMapScreen: MapScreen | undefined;

function setup(
  initialRoomId: RoomId | null = 'town-center',
  changeRoom = vi.fn<(roomId: RoomId) => void>(),
) {
  const root = document.createElement('div');
  document.body.append(root);
  const overlays = createOverlayManager();
  let currentRoomId = initialRoomId;
  const mapScreen = createMapScreen(root, {
    overlays,
    changeRoom,
    currentRoomId: () => currentRoomId,
  });
  currentMapScreen = mapScreen;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends Element = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(selector),
  ];
  return {
    root,
    mapScreen,
    overlays,
    changeRoom,
    q,
    qa,
    setCurrentRoomId: (id: RoomId | null) => {
      currentRoomId = id;
    },
  };
}

function openMap(): void {
  gameEvents.emit('ui:open-map');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentMapScreen?.destroy();
  currentMapScreen = undefined;
});

describe('createMapScreen', () => {
  it('is hidden until ui:open-map fires', () => {
    const { q } = setup();

    expect(q('.map-screen').hidden).toBe(true);

    openMap();

    expect(q('.map-screen').hidden).toBe(false);
  });

  it('ignores ui:open-map while there is no Session (currentRoomId is null)', () => {
    const { q } = setup(null);

    openMap();

    expect(q('.map-screen').hidden).toBe(true);
  });

  it('renders the 14 design tiles, each labelled verbatim', () => {
    const { qa } = setup();

    const labels = qa('.map-screen__label').map((el) => el.textContent);
    expect(labels).toHaveLength(14);
    expect(labels).toContain('01 · TOWN CENTER');
    expect(labels).toContain('04 · THE KITCHEN');
    expect(labels).toContain('15 · THE MULLET');
  });

  it('clicking a clickable tile closes the Map, then calls changeRoom with its roomId', () => {
    const { q, changeRoom } = setup();
    openMap();

    q<HTMLButtonElement>('[data-map-room="dev-pit"]').click();

    expect(changeRoom).toHaveBeenCalledWith('dev-pit');
    expect(q('.map-screen').hidden).toBe(true);
  });

  it('pins the order (#33 review round 1 fix 2): the Map is hidden and the overlay released before changeRoom runs', () => {
    let hiddenAtCall: boolean | undefined;
    let overlayAtCall: string | null | undefined;
    const changeRoom = vi.fn<(roomId: RoomId) => void>(() => {
      hiddenAtCall = q('.map-screen').hidden;
      overlayAtCall = overlays.current();
    });
    const { q, overlays } = setup('town-center', changeRoom);
    openMap();

    q<HTMLButtonElement>('[data-map-room="dev-pit"]').click();

    expect(changeRoom).toHaveBeenCalledTimes(1);
    expect(hiddenAtCall).toBe(true);
    expect(overlayAtCall).toBeNull();
  });

  it('clicking the current Room only closes the Map (no changeRoom call)', () => {
    const { q, changeRoom } = setup('town-center');
    openMap();

    q<HTMLButtonElement>('[data-map-room="town-center"]').click();

    expect(changeRoom).not.toHaveBeenCalled();
    expect(q('.map-screen').hidden).toBe(true);
  });

  it('highlights exactly the current Room, with aria-current and a YOU ARE HERE pill', () => {
    const { q, qa } = setup('dev-pit');
    openMap();

    const current = qa('[aria-current="location"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(q('[data-map-room="dev-pit"]'));
    expect(current[0]!.querySelector('.map-screen__pill')?.textContent).toBe('YOU ARE HERE');
    expect((current[0]!.querySelector('.map-screen__pill') as HTMLElement).hidden).toBe(false);

    const other = q('[data-map-room="town-center"]');
    expect(other.hasAttribute('aria-current')).toBe(false);
    expect((other.querySelector('.map-screen__pill') as HTMLElement).hidden).toBe(true);
  });

  it('ESC closes the Map through the shared OverlayManager', () => {
    const { q } = setup();
    openMap();
    expect(q('.map-screen').hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(q('.map-screen').hidden).toBe(true);
  });

  it('the close button closes the Map', () => {
    const { q } = setup();
    openMap();

    q<HTMLButtonElement>('.map-screen__close').click();

    expect(q('.map-screen').hidden).toBe(true);
  });

  it('registers with the shared OverlayManager: opening another overlay closes the Map', () => {
    const { q, overlays } = setup();
    openMap();
    expect(overlays.current()).toBe(MAP_OVERLAY_ID);

    const onClose = vi.fn();
    overlays.open('other', onClose);

    expect(q('.map-screen').hidden).toBe(true);
    expect(overlays.current()).toBe('other');
  });

  it('closes on any room:leave', () => {
    const { q } = setup();
    openMap();

    gameEvents.emit('room:leave', { roomId: 'town-center' });

    expect(q('.map-screen').hidden).toBe(true);
  });

  it('destroy() removes the overlay and stops reacting to ui:open-map', () => {
    const { root, mapScreen, q } = setup();
    expect(q('.map-screen')).not.toBeNull();

    mapScreen.destroy();
    currentMapScreen = undefined;

    expect(root.querySelector('.map-screen')).toBeNull();
    // No throw when a stale ui:open-map arrives after destroy.
    expect(() => openMap()).not.toThrow();
  });

  describe('focus handling (aria-modal="true", #33 review round 1 fix 1)', () => {
    it('focuses the current-Room tile on open', () => {
      const { q } = setup('dev-pit');

      openMap();

      expect(document.activeElement).toBe(q('[data-map-room="dev-pit"]'));
    });

    it('focuses the close button on open when there is no current-Room tile', () => {
      // Defensive branch: every real RoomId currently has a Map tile, so this
      // forces the "no match" case with a value the type system would
      // otherwise never let through.
      const { q } = setup('not-a-real-room' as RoomId);

      openMap();

      expect(document.activeElement).toBe(q('.map-screen__close'));
    });

    it('restores focus to whatever had it before open(), if still connected, on every close path', () => {
      const trigger = document.createElement('button');
      document.body.append(trigger);
      trigger.focus();

      const { q } = setup();
      openMap();
      expect(document.activeElement).not.toBe(trigger);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.activeElement).toBe(trigger);

      trigger.focus();
      openMap();
      q<HTMLButtonElement>('.map-screen__close').click();
      expect(document.activeElement).toBe(trigger);
    });

    it('does not try to refocus a previously-focused element that is no longer in the document', () => {
      const trigger = document.createElement('button');
      document.body.append(trigger);
      trigger.focus();

      setup();
      openMap();
      trigger.remove();

      expect(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }).not.toThrow();
      expect(document.activeElement).not.toBe(trigger);
    });

    it('traps Tab inside the frame: Tab on the last focusable element wraps to the first (the close button)', () => {
      const { root, q } = setup('dev-pit');
      openMap();

      const focusable = [...root.querySelectorAll<HTMLButtonElement>('.map-screen__frame button')];
      const last = focusable[focusable.length - 1]!;
      last.focus();

      last.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      );

      expect(document.activeElement).toBe(q('.map-screen__close'));
    });

    it('traps Shift+Tab inside the frame: Shift+Tab on the close button wraps to the last tile', () => {
      const { root, q } = setup('dev-pit');
      openMap();

      const closeButton = q<HTMLButtonElement>('.map-screen__close');
      closeButton.focus();

      closeButton.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      const focusable = [...root.querySelectorAll<HTMLButtonElement>('.map-screen__frame button')];
      expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });
  });

  it('after destroy(), a stale ui:open-map never opens the shared OverlayManager', () => {
    const { mapScreen, overlays } = setup();

    mapScreen.destroy();
    currentMapScreen = undefined;
    openMap();

    expect(overlays.current()).toBeNull();
  });
});

describe('createMapScreen, with a COMING SOON tile mocked in (#51)', () => {
  // The real Map loses its `roomId: null` tiles one by one as #51's Rooms
  // land, so these tests append a made-up one to MAP_ROOMS instead of
  // relying on any real design card staying COMING SOON. `resetModules`
  // first, so the dynamic imports below re-resolve `./map-screen` (and
  // `gameEvents`, which it must share with the test) against the mock.
  async function setupWithComingSoonTile() {
    vi.resetModules();
    vi.doMock('./map-rooms', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./map-rooms')>();
      return {
        ...actual,
        MAP_ROOMS: [
          ...actual.MAP_ROOMS,
          { number: '99', label: '99 · TEST ROOM', subtitle: 'NOT A REAL CARD', roomId: null },
        ],
      };
    });
    const { gameEvents: events } = await import('../contracts');
    const { createOverlayManager: createOverlays } = await import('./hud/overlay-manager');
    const { createMapScreen: create } = await import('./map-screen');

    const root = document.createElement('div');
    document.body.append(root);
    const changeRoom = vi.fn<(roomId: RoomId) => void>();
    currentMapScreen = create(root, {
      overlays: createOverlays(),
      changeRoom,
      currentRoomId: () => 'town-center',
    });
    const q = <T extends Element = HTMLElement>(selector: string) =>
      root.querySelector<T>(selector)!;
    return { q, changeRoom, openMap: () => events.emit('ui:open-map') };
  }

  afterEach(() => {
    vi.doUnmock('./map-rooms');
    vi.resetModules();
  });

  it('a coming-soon tile is aria-disabled and shows a COMING SOON pill', async () => {
    const { q } = await setupWithComingSoonTile();

    const comingSoon = q('[data-map-number="99"]');
    expect(comingSoon.getAttribute('aria-disabled')).toBe('true');
    expect(comingSoon.querySelector('.map-screen__pill')?.textContent).toBe('COMING SOON');
    expect((comingSoon.querySelector('.map-screen__pill') as HTMLElement).hidden).toBe(false);
  });

  it('clicking a coming-soon tile does nothing: the Map stays open, no changeRoom call', async () => {
    const { q, changeRoom, openMap: open } = await setupWithComingSoonTile();
    open();

    q<HTMLButtonElement>('[data-map-number="99"]').click();

    expect(changeRoom).not.toHaveBeenCalled();
    expect(q('.map-screen').hidden).toBe(false);
  });
});
