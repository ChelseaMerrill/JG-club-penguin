// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PENGUIN_LOOK } from '../contracts/penguin';
import type { PresencePayload } from '../contracts/realtime';
import { createDebugOverlay, isDebugEnabled, isMaskNamesEnabled } from './debug-overlay';

function payload(playerId: string, overrides: Partial<PresencePayload> = {}): PresencePayload {
  return {
    playerId,
    look: DEFAULT_PENGUIN_LOOK,
    tile: { col: 0, row: 0 },
    facing: 's',
    ...overrides,
  };
}

describe('isDebugEnabled / isMaskNamesEnabled', () => {
  it('are true only when their own URL param is present', () => {
    expect(isDebugEnabled('?debug')).toBe(true);
    expect(isDebugEnabled('?other=1')).toBe(false);
    expect(isMaskNamesEnabled('?debug&masknames')).toBe(true);
    expect(isMaskNamesEnabled('?debug')).toBe(false);
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

  it('setOwnLook puts the current body on the overlay root as data-own-body', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });

    overlay.setOwnLook({ ...DEFAULT_PENGUIN_LOOK, body: '#abcdef' });

    expect(root.querySelector('.debug-overlay')?.getAttribute('data-own-body')).toBe('#abcdef');
  });

  it('setCurrentRoom puts the Room on the overlay root as data-current-room', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });

    overlay.setCurrentRoom('dev-pit');
    expect(root.querySelector('.debug-overlay')?.getAttribute('data-current-room')).toBe('dev-pit');

    overlay.setCurrentRoom(null);
    expect(root.querySelector('.debug-overlay')?.getAttribute('data-current-room')).toBe('');
  });

  it('random-look picks a body different from the current one and reports it via onSetLook', () => {
    const root = document.createElement('div');
    const onSetLook = vi.fn();
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook });
    overlay.setOwnLook({ ...DEFAULT_PENGUIN_LOOK, body: '#161719' });

    (root.querySelector('.debug-random-look') as HTMLButtonElement).click();

    expect(onSetLook).toHaveBeenCalledOnce();
    const [nextLook] = onSetLook.mock.calls[0] as [PenguinLookLike];
    expect(nextLook.body).not.toBe('#161719');
    expect(root.querySelector('.debug-overlay')?.getAttribute('data-own-body')).toBe(nextLook.body);
  });

  it('is a no-op before setOwnLook has ever been called', () => {
    const root = document.createElement('div');
    const onSetLook = vi.fn();
    createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook });

    (root.querySelector('.debug-random-look') as HTMLButtonElement).click();

    expect(onSetLook).not.toHaveBeenCalled();
  });

  it('mirrors upsert into one roster li per playerId, updating in place (never a duplicate)', () => {
    const root = document.createElement('div');
    const overlay = createDebugOverlay(root, { onEnterRoom: vi.fn(), onSetLook: vi.fn() });

    overlay.upsert(
      payload('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: 'Ada', body: '#123456' } }),
    );
    overlay.upsert(
      payload('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: 'Ada', body: '#654321' } }),
    );

    const items = root.querySelectorAll('ul.debug-roster li[data-player-id="other"]');
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('data-body')).toBe('#654321');
    expect(items[0].getAttribute('data-name')).toBe('Ada');
    expect(items[0].textContent).toBe('Ada');
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

interface PenguinLookLike {
  body: string;
}
