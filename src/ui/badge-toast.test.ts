import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../contracts';
import { wireBadgeToast } from './badge-toast';

describe('wireBadgeToast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits ui:toast with the Badge display name on badge:earned', () => {
    const unsubscribeToast = wireBadgeToast();
    const onToast = vi.fn();
    const unsubscribeSpy = gameEvents.on('ui:toast', onToast);

    gameEvents.emit('badge:earned', { badgeId: 'exterminator' });

    expect(onToast).toHaveBeenCalledWith({ message: 'Badge unlocked: Exterminator' });

    unsubscribeSpy();
    unsubscribeToast();
  });

  it('stops emitting once unsubscribed', () => {
    const unsubscribeToast = wireBadgeToast();
    unsubscribeToast();
    const onToast = vi.fn();
    const unsubscribeSpy = gameEvents.on('ui:toast', onToast);

    gameEvents.emit('badge:earned', { badgeId: 'breakfast-club' });

    expect(onToast).not.toHaveBeenCalled();
    unsubscribeSpy();
  });
});

describe('wireBadgeToast with the Badge popup (#138 D13)', () => {
  it.each(['exterminator', 'breakfast-club', 'barista', 'brain-freeze'] as const)(
    'keeps the toast, and no popup, for the done-screen Badge %s',
    (badgeId) => {
      const popup = { show: vi.fn() };
      const unsubscribeToast = wireBadgeToast({ popup });
      const onToast = vi.fn();
      const unsubscribeSpy = gameEvents.on('ui:toast', onToast);

      gameEvents.emit('badge:earned', { badgeId });

      expect(onToast).toHaveBeenCalledTimes(1);
      expect(popup.show).not.toHaveBeenCalled();
      unsubscribeSpy();
      unsubscribeToast();
    },
  );

  it.each(['first-waddle', 'ship-it', 'interior-penguin', 'night-owl', 'stair-master'] as const)(
    'sends %s to the popup, with no toast',
    (badgeId) => {
      const popup = { show: vi.fn() };
      const unsubscribeToast = wireBadgeToast({ popup });
      const onToast = vi.fn();
      const unsubscribeSpy = gameEvents.on('ui:toast', onToast);

      gameEvents.emit('badge:earned', { badgeId });

      expect(popup.show).toHaveBeenCalledWith(badgeId);
      expect(onToast).not.toHaveBeenCalled();
      unsubscribeSpy();
      unsubscribeToast();
    },
  );

  it('routes by rule, not a fixed list: an id no one listed goes to the popup', () => {
    const popup = { show: vi.fn() };
    const unsubscribeToast = wireBadgeToast({ popup });

    gameEvents.emit('badge:earned', { badgeId: 'some-future-badge' as never });

    expect(popup.show).toHaveBeenCalledWith('some-future-badge');
    unsubscribeToast();
  });
});
