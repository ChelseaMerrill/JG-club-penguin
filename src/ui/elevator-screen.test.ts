// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomId } from '../contracts';
import { ROOM_FLOORS, type FloorId } from '../game/rooms/floors';
import { createElevatorScreen, type ElevatorScreen } from './elevator-screen';

function setup(minDurationMs?: number): {
  root: HTMLElement;
  screen: ElevatorScreen;
  q: (selector: string) => HTMLElement | null;
} {
  const root = document.createElement('div');
  document.body.append(root);
  const screen = createElevatorScreen(root, {
    resolveFloor: (roomId: RoomId): FloorId | null => ROOM_FLOORS[roomId],
    minDurationMs,
  });
  return {
    root,
    screen,
    q: (selector: string) => root.querySelector<HTMLElement>(selector),
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createElevatorScreen', () => {
  it('is hidden until begin() is called', () => {
    const { q } = setup();
    expect(q('.elevator-screen')!.hidden).toBe(true);
  });

  it('shows on begin(), lights the destination and outlines the source', () => {
    const { q, screen } = setup();

    screen.begin('town-center', 'roof-deck');

    expect(q('.elevator-screen')!.hidden).toBe(false);
    const dest = q('.elevator-screen__floor--dest');
    const source = q('.elevator-screen__floor--source');
    expect(dest?.textContent).toBe('R');
    expect(source?.textContent).toBe('5');
  });

  it('shows "WADDLING UP TO THE ROOF" going from floor 5 to R', () => {
    const { q, screen } = setup();

    screen.begin('town-center', 'roof-deck');

    expect(q('.elevator-screen__heading')!.textContent).toBe('WADDLING UP TO THE ROOF');
  });

  it('shows "WADDLING DOWN TO FLOOR 5" going from R to floor 5', () => {
    const { q, screen } = setup();

    screen.begin('roof-deck', 'town-center');

    expect(q('.elevator-screen__heading')!.textContent).toBe('WADDLING DOWN TO FLOOR 5');
  });

  it('is aria-live="polite" and not registered with any OverlayManager (no role/aria-modal)', () => {
    const { q } = setup();
    const overlay = q('.elevator-screen')!;
    expect(overlay.getAttribute('aria-live')).toBe('polite');
    expect(overlay.getAttribute('role')).toBeNull();
    expect(overlay.getAttribute('aria-modal')).toBeNull();
  });

  describe('timing (#52 D4/D5)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('hides at minDurationMs when ready() fires early (300ms into a 1200ms minimum)', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(300);
      screen.ready();
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(899);
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('hides at ready() when it fires after the minimum (2000ms into a 1200ms minimum)', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(1200);
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(800); // now at 2000ms
      expect(q('.elevator-screen')!.hidden).toBe(false);

      screen.ready();
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('cancel() hides immediately, even before the minimum has elapsed', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(100);
      screen.cancel();

      expect(q('.elevator-screen')!.hidden).toBe(true);

      // A cancelled minimum timer must not fire a later, stray hide (it's
      // already hidden, so this just confirms no error/no-op double-hide).
      vi.advanceTimersByTime(2000);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('re-begin() while visible retargets the labels and restarts the minimum', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      vi.advanceTimersByTime(1000);
      screen.ready();
      // Not hidden yet: only 1000ms of the first begin's own 1200ms minimum
      // has elapsed, and the door click below force restarts the clock.
      expect(q('.elevator-screen')!.hidden).toBe(false);

      screen.begin('roof-deck', 'town-center');
      expect(q('.elevator-screen__heading')!.textContent).toBe('WADDLING DOWN TO FLOOR 5');

      // The stale ready() from before the re-begin must not have carried
      // over: advancing to the old deadline (1200ms from the first begin,
      // i.e. 200ms from here) must not hide it.
      vi.advanceTimersByTime(200);
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(1000); // 1200ms since the re-begin
      expect(q('.elevator-screen')!.hidden).toBe(false); // no ready() yet for this begin

      screen.ready();
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });
  });
});
