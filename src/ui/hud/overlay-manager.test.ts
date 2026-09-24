// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverlayManager, type OverlayManager } from './overlay-manager';

let manager: OverlayManager | undefined;

afterEach(() => {
  manager?.destroy();
  manager = undefined;
});

describe('createOverlayManager', () => {
  it('opens the requested overlay', () => {
    manager = createOverlayManager();
    const onClose = vi.fn();

    manager.open('menu', onClose);

    expect(manager.current()).toBe('menu');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opening a second overlay closes the first one (one overlay at a time)', () => {
    manager = createOverlayManager();
    const closeA = vi.fn();
    const closeB = vi.fn();

    manager.open('a', closeA);
    manager.open('b', closeB);

    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
    expect(manager.current()).toBe('b');
  });

  it('close(id) only closes when id is the currently open overlay', () => {
    manager = createOverlayManager();
    const closeA = vi.fn();

    manager.open('a', closeA);
    manager.close('not-a');
    expect(closeA).not.toHaveBeenCalled();
    expect(manager.current()).toBe('a');

    manager.close('a');
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(manager.current()).toBeNull();
  });

  it('Escape closes the current overlay', () => {
    manager = createOverlayManager();
    const onClose = vi.fn();
    manager.open('menu', onClose);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(manager.current()).toBeNull();
  });

  it('re-opening the already-open id is a no-op', () => {
    manager = createOverlayManager();
    const onClose = vi.fn();
    manager.open('menu', onClose);
    manager.open('menu', onClose);

    expect(onClose).not.toHaveBeenCalled();
    expect(manager.current()).toBe('menu');
  });

  it('destroy() removes the Escape listener', () => {
    manager = createOverlayManager();
    const onClose = vi.fn();
    manager.open('menu', onClose);
    manager.destroy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(manager.current()).toBe('menu');
  });
});
