// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../../contracts';
import type { RoomFloorDisplay } from '../../game/rooms/room-definition';
import { createFloorDisplay, type FloorDisplay } from './floor-display';

const LOBBY_DISPLAY: RoomFloorDisplay = { x: 1044, y: 317, width: 72, height: 20, skewY: 26.565 };

let current: FloorDisplay | undefined;

function setup(initialRoomId: RoomId = 'lobby'): { layer: HTMLElement; hud: HTMLElement } {
  const layer = document.createElement('div');
  const hud = document.createElement('div');
  hud.className = 'hud';
  layer.append(hud);
  document.body.append(layer);
  current = createFloorDisplay(layer, {
    resolve: (roomId) => (roomId === 'lobby' ? LOBBY_DISPLAY : undefined),
    initialRoomId,
    mountBefore: hud,
    loop: { random: () => 0.5 },
  });
  return { layer, hud };
}

function display(layer: HTMLElement): HTMLElement {
  return layer.querySelector<HTMLElement>('.floor-display')!;
}

const enter = (roomId: RoomId) =>
  gameEvents.emit('room:enter', { roomId, entryTile: { col: 0, row: 0 } });
const leave = (roomId: RoomId) => gameEvents.emit('room:leave', { roomId });

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  current?.destroy();
  current = undefined;
  vi.useRealTimers();
});

describe('createFloorDisplay (#169)', () => {
  it('shows the label in the design box over the Lobby at boot, mounted before the HUD', () => {
    const { layer, hud } = setup();
    const el = display(layer);

    expect(el.hidden).toBe(false);
    expect(el.nextElementSibling).toBe(hud);
    expect(el.textContent).toBe('▲ 1');
    expect(el.dataset.floor).toBe('▲ 1');
    expect(el.style.left).toBe('1044px');
    expect(el.style.top).toBe('317px');
    expect(el.style.width).toBe('72px');
    expect(el.style.height).toBe('20px');
    expect(el.style.transform).toBe('skewY(26.565deg)');
  });

  it('is decorative: hidden from assistive tech', () => {
    const { layer } = setup();

    expect(display(layer).getAttribute('aria-hidden')).toBe('true');
    expect(display(layer).className).toBe('floor-display');
  });

  it('keeps cycling while in the Lobby', () => {
    const { layer } = setup();

    vi.advanceTimersByTime(950);

    expect(display(layer).textContent).toBe('▲ 2');
  });

  it('shows only in a Room with a floorDisplay', () => {
    const { layer } = setup('town-center');

    expect(display(layer).hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    enter('lobby');
    expect(display(layer).hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('hides and stops on room:leave, and restarts from L on the next Lobby entry', () => {
    const { layer } = setup();
    vi.advanceTimersByTime(950);

    leave('lobby');
    expect(display(layer).hidden).toBe(true);
    expect(display(layer).textContent).toBe('');
    expect(display(layer).dataset.floor).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    enter('town-center');
    expect(display(layer).hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    enter('lobby');
    expect(display(layer).textContent).toBe('▲ 1');
  });

  it('leaves no timer and no element after destroy', () => {
    const { layer } = setup();

    current!.destroy();
    current = undefined;

    expect(vi.getTimerCount()).toBe(0);
    expect(layer.querySelector('.floor-display')).toBeNull();
    enter('lobby');
    expect(vi.getTimerCount()).toBe(0);
  });
});
