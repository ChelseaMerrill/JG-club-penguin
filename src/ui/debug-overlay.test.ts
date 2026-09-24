// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOOK,
  PENGUIN_NAME_MAX,
  type PenguinLook,
  type PresencePayload,
} from '../contracts';
import { createDebugOverlay, isDebugEnabled } from './debug-overlay';

function payload(playerId: string, overrides: Partial<PresencePayload> = {}): PresencePayload {
  return {
    playerId,
    look: DEFAULT_LOOK,
    tile: { col: 0, row: 0 },
    facing: 'right',
    ...overrides,
  };
}

function overlayRoot(root: HTMLElement): HTMLElement {
  return root.querySelector('.debug-overlay') as HTMLElement;
}

function ownLook(root: HTMLElement): PenguinLook {
  return JSON.parse(overlayRoot(root).getAttribute('data-own-look') ?? 'null') as PenguinLook;
}

describe('isDebugEnabled', () => {
  it('is true only when the debug URL param is present', () => {
    expect(isDebugEnabled('?debug')).toBe(true);
    expect(isDebugEnabled('?other=1')).toBe(false);
  });
});

describe('createDebugOverlay', () => {
  it('renders a Room button per RoomId and calls onEnterRoom when clicked', () => {
    const root = document.createElement('div');
    const onEnterRoom = vi.fn();
    createDebugOverlay(root, { onEnterRoom, onSetLook: vi.fn() });

    const button = root.querySelector('button[data-room="dev-pit"]');
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();

    expect(onEnterRoom).toHaveBeenCalledExactlyOnceWith('dev-pit');
  });

  it('setOwnLook puts the full own look, as JSON, on the overlay root as data-own-look', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });
    const look: PenguinLook = { ...DEFAULT_LOOK, name: 'Pebble', body: '#0C4B5F' };

    overlay.setOwnLook(look);

    expect(ownLook(root)).toEqual(look);
  });

  it('setCurrentRoom puts the Room on the overlay root as data-current-room', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });

    overlay.setCurrentRoom('dev-pit');
    expect(overlayRoot(root).getAttribute('data-current-room')).toBe('dev-pit');

    overlay.setCurrentRoom(null);
    expect(overlayRoot(root).getAttribute('data-current-room')).toBe('');
  });

  it('random-look picks a new body and a new short name, reports it via onSetLook and shows it as data-own-look', () => {
    const root = document.createElement('div');
    const onSetLook = vi.fn();
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook });
    overlay.setOwnLook({ ...DEFAULT_LOOK, body: '#161719', name: '' });

    (root.querySelector('.debug-random-look') as HTMLButtonElement).click();

    expect(onSetLook).toHaveBeenCalledOnce();
    const [next] = onSetLook.mock.calls[0] as [PenguinLook];
    expect(next.body).not.toBe('#161719');
    expect(next.name).not.toBe('');
    expect(next.name.length).toBeLessThanOrEqual(PENGUIN_NAME_MAX);
    expect(ownLook(root)).toEqual(next);
  });

  it('random-look is a no-op before setOwnLook has ever been called', () => {
    const root = document.createElement('div');
    const onSetLook = vi.fn();
    createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook });

    (root.querySelector('.debug-random-look') as HTMLButtonElement).click();

    expect(onSetLook).not.toHaveBeenCalled();
  });

  it('mirrors upsert into one roster li per playerId with data-look JSON, updating in place', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });
    const second: PenguinLook = { ...DEFAULT_LOOK, name: 'Ada', body: '#00BDFF' };

    overlay.upsert(payload('other', { look: { ...DEFAULT_LOOK, name: 'Ada', body: '#F4F4F4' } }));
    overlay.upsert(payload('other', { look: second }));

    const items = root.querySelectorAll('ul.debug-roster li[data-player-id="other"]');
    expect(items).toHaveLength(1);
    expect(JSON.parse(items[0].getAttribute('data-look') ?? 'null')).toEqual(second);
    expect(items[0].textContent).toBe('Ada');
  });

  it('shows an empty name as "Unnamed Penguin"', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });

    overlay.upsert(payload('other'));

    expect(root.querySelector('li[data-player-id="other"]')?.textContent).toBe('Unnamed Penguin');
  });

  it('remove and clear drop roster li elements', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });
    overlay.upsert(payload('a'));
    overlay.upsert(payload('b'));

    overlay.remove('a');
    expect(root.querySelectorAll('ul.debug-roster li')).toHaveLength(1);

    overlay.clear();
    expect(root.querySelectorAll('ul.debug-roster li')).toHaveLength(0);
  });
});
