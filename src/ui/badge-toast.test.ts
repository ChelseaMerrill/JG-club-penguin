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
