// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomId } from '../contracts';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts';
import { renderPenguinSvg } from '../game/penguin/render-svg';
import { penguinLookHash } from '../game/penguin/look-hash';
import { ROOM_FLOORS, type FloorId } from '../game/rooms/floors';
import { createElevatorScreen, type ElevatorScreenHandle } from './elevator-screen';

/** Town Center is floor L here, so a Town Center <-> Roof Deck ride crosses all six floors. */
const LOBBY_FLOORS = (roomId: RoomId): FloorId | null =>
  roomId === 'town-center' ? 'L' : ROOM_FLOORS[roomId];

function setup(
  msPerFloor?: number,
  extra: {
    resolveFloor?: (roomId: RoomId) => FloorId | null;
    look?: PenguinLook | null;
  } = {},
): {
  root: HTMLElement;
  screen: ElevatorScreenHandle;
  q: (selector: string) => HTMLElement | null;
} {
  const root = document.createElement('div');
  document.body.append(root);
  const screen = createElevatorScreen(root, {
    resolveFloor: extra.resolveFloor ?? ((roomId: RoomId): FloorId | null => ROOM_FLOORS[roomId]),
    resolveLook: () => (extra.look === undefined ? DEFAULT_LOOK : extra.look),
    msPerFloor,
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

  it('shows on begin(), marking the destination and the source', () => {
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

  it('clears the heading (rather than leaving a stale one) if either floor cannot be resolved, defensively', () => {
    const { q, screen } = setup();
    screen.begin('town-center', 'roof-deck');
    expect(q('.elevator-screen__heading')!.textContent).toBe('WADDLING UP TO THE ROOF');

    screen.begin('roof-deck', 'igloo');

    expect(q('.elevator-screen__heading')!.textContent).toBe('');
  });

  describe('focus (#52 review MINOR)', () => {
    it('blurs focus outside the chat input on begin(), so Enter/Space cannot reopen something underneath', () => {
      const { screen } = setup();
      const mapButton = document.createElement('button');
      document.body.append(mapButton);
      mapButton.focus();
      expect(document.activeElement).toBe(mapButton);

      screen.begin('town-center', 'roof-deck');

      expect(document.activeElement).not.toBe(mapButton);
    });

    it('leaves focus on the chat input alone on begin()', () => {
      const { screen } = setup();
      const chatInput = document.createElement('input');
      chatInput.className = 'hud__chat-input';
      document.body.append(chatInput);
      chatInput.focus();
      expect(document.activeElement).toBe(chatInput);

      screen.begin('town-center', 'roof-deck');

      expect(document.activeElement).toBe(chatInput);
    });
  });

  describe('timing (#52 D4/D5)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('hides at the end of the ride when ready() fires early (300ms into a 1200ms ride)', () => {
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

    it('hides at ready() when it fires after the ride (2000ms into a 1200ms ride)', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(1200);
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(800); // now at 2000ms
      expect(q('.elevator-screen')!.hidden).toBe(false);

      screen.ready();
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('cancel() hides immediately, even before the ride has elapsed', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(100);
      screen.cancel();

      expect(q('.elevator-screen')!.hidden).toBe(true);

      // A cancelled ride timer must not fire a later, stray hide (it's
      // already hidden, so this just confirms no error/no-op double-hide).
      vi.advanceTimersByTime(2000);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('re-begin() while visible retargets the labels and restarts the ride', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      vi.advanceTimersByTime(1000);
      screen.ready();
      // Not hidden yet: only 1000ms of the first begin's own 1200ms ride
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

    it('force-hides ~10s after begin() if ready() never arrives (safety cap, #52 review MINOR)', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');

      vi.advanceTimersByTime(9_999);
      expect(q('.elevator-screen')!.hidden).toBe(false);

      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('cancel() before the safety cap fires prevents a later stray hide', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      screen.cancel();

      screen.begin('roof-deck', 'town-center');
      vi.advanceTimersByTime(1200);
      screen.ready();
      expect(q('.elevator-screen')!.hidden).toBe(true);

      // The first begin()'s safety timer must have been cleared by cancel();
      // otherwise it would stray-fire here mid this second, already-hidden ride.
      vi.advanceTimersByTime(10_000);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });
  });

  describe('ride length (#163)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('hides a one-floor ride at 1200ms', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      screen.ready();
      vi.advanceTimersByTime(1199);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('hides a five-floor ride (L to 5) at 6000ms', () => {
      const { q, screen } = setup(undefined, { resolveFloor: LOBBY_FLOORS });
      screen.begin('town-center', 'dev-pit');
      screen.ready();
      vi.advanceTimersByTime(5999);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('hides a six-floor ride (L to R) at 7200ms', () => {
      const { q, screen } = setup(undefined, { resolveFloor: LOBBY_FLOORS });
      screen.begin('town-center', 'roof-deck');
      screen.ready();
      vi.advanceTimersByTime(7199);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('still force-hides at the 10s safety cap when ready() never comes on a 7.2s ride', () => {
      const { q, screen } = setup(undefined, { resolveFloor: LOBBY_FLOORS });
      screen.begin('town-center', 'roof-deck');
      vi.advanceTimersByTime(9999);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });

    it('previewRide() begins between floors and hides at the ride end with no Room change', () => {
      const { q, screen } = setup(1200);
      screen.previewRide('L', '5');
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(5999);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(q('.elevator-screen')!.hidden).toBe(true);
    });
  });

  describe('ride display (#163)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('delays each in-between chip by 1.2s per floor, in travel order (L to 5)', () => {
      const { screen } = setup(1200);
      screen.previewRide('L', '5');
      const chips = [...document.querySelectorAll<HTMLElement>('.elevator-screen__floor')];
      const delays = ['1', '2', '3', '4'].map(
        (floor) => chips.find((chip) => chip.textContent === floor)!.style.animationDelay,
      );
      expect(delays).toEqual(['0ms', '1200ms', '2400ms', '3600ms']);
      expect(document.querySelectorAll('.elevator-screen__floor--between')).toHaveLength(4);
    });

    it('a one-floor ride has no in-between chips', () => {
      const { screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      expect(document.querySelectorAll('.elevator-screen__floor--between')).toHaveLength(0);
    });

    it('shows the going text, indicator and next text going up', () => {
      const { q, screen } = setup(1200);
      screen.previewRide('L', '5');
      expect(q('.elevator-screen__going')!.textContent).toBe('GOING UP');
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ L');
      expect(q('.elevator-screen__next')!.textContent).toBe('NEXT · 5');
      expect(q('.elevator-screen')!.classList.contains('elevator-screen--down')).toBe(false);
    });

    it('reverses the arrow, the going text and the shaft lights going down (R to L)', () => {
      const { q, screen } = setup(1200);
      screen.previewRide('R', 'L');
      expect(q('.elevator-screen__going')!.textContent).toBe('GOING DOWN');
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▼ R');
      expect(q('.elevator-screen')!.classList.contains('elevator-screen--down')).toBe(true);
    });

    it('drives the indicator, status, bar and lit FLOORS hex from one clock', () => {
      const { q, screen } = setup(1200);
      screen.previewRide('L', '5');
      vi.advanceTimersByTime(3840);
      // The rAF loop runs on the faked timers' ~16ms frames, so allow one frame either side.
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ 3');
      expect(q('.elevator-screen__status')!.textContent).toMatch(
        /^PASSING FLOOR 3 · POLISHING THE ICE… (63|64|65)%$/,
      );
      const lit = document.querySelectorAll('.elevator-screen__hex--lit');
      expect(lit).toHaveLength(1);
      expect(lit[0]!.textContent).toBe('3');
      expect(q('.elevator-screen__progress-bar')!.style.width).toMatch(/^(63|64|65)(\.\d+)?%$/);
    });

    it('ends on the destination at 100%', () => {
      const { q, screen } = setup(1200);
      screen.begin('town-center', 'roof-deck');
      vi.advanceTimersByTime(1200);
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ R');
      expect(q('.elevator-screen__status')!.textContent).toBe(
        'PASSING FLOOR R · POLISHING THE ICE… 100%',
      );
      expect(q('.elevator-screen__progress-bar')!.style.width).toBe('100%');
      expect(q('.elevator-screen__hex--lit')!.textContent).toBe('R');
    });

    it('freezeAt() stops the clock and shows that instant', () => {
      const { q, screen } = setup(1200);
      screen.previewRide('L', '5');
      // jsdom has no Web Animations API; the e2e spec covers the paused animations.
      Object.assign(q('.elevator-screen')!, { getAnimations: () => [] });
      screen.freezeAt(2500);
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ 2');
      vi.advanceTimersByTime(20_000);
      expect(q('.elevator-screen')!.hidden).toBe(false);
      expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ 2');
    });

    it('hides the ticking scenery from assistive tech, leaving only the heading and tip', () => {
      const { q } = setup(1200);
      expect(q('.elevator-screen__car')!.getAttribute('aria-hidden')).toBe('true');
      expect(q('.elevator-screen__status')!.getAttribute('aria-hidden')).toBe('true');
      expect(q('.elevator-screen__heading')!.closest('[aria-hidden]')).toBeNull();
      expect(q('.elevator-screen__tip')!.closest('[aria-hidden]')).toBeNull();
    });

    it('shows the arrival state at once, with no ticking, under reduced motion', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      try {
        const { q, screen } = setup(1200);
        screen.previewRide('L', '5');
        expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ 5');
        expect(q('.elevator-screen__status')!.textContent).toBe(
          'PASSING FLOOR 5 · POLISHING THE ICE… 100%',
        );
        expect(q('.elevator-screen__progress-bar')!.style.width).toBe('100%');
        // No rAF loop: a frame later it still shows the arrival state, not the ride's start.
        vi.advanceTimersByTime(100);
        expect(q('.elevator-screen__arrow')!.textContent).toBe('▲ 5');
        expect(q('.elevator-screen__status')!.textContent).toMatch(/100%$/);
        // The ride's length is unchanged.
        vi.advanceTimersByTime(5899);
        expect(q('.elevator-screen')!.hidden).toBe(false);
        vi.advanceTimersByTime(1);
        expect(q('.elevator-screen')!.hidden).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('the Penguin (#163)', () => {
    const NAMED_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: 'Pebble', body: '#3a4046' };

    it('draws the Look with the Creator renderer and tags it with its hash', () => {
      const { q, screen } = setup(1200, { look: NAMED_LOOK });
      screen.begin('town-center', 'roof-deck');
      const art = q('.elevator-screen__penguin-art')!;
      const expected = document.createElement('div');
      expected.innerHTML = renderPenguinSvg(
        NAMED_LOOK,
        { anim: NAMED_LOOK.emote, frame: 0 },
        { idPrefix: 'elevator-screen' },
      );
      expect(art.innerHTML).toBe(expected.innerHTML);
      expect(art.dataset.lookHash).toBe(penguinLookHash(NAMED_LOOK));
    });

    it('shows the Penguin Creator name on the tag, never "You"', () => {
      const { q, screen } = setup(1200, { look: NAMED_LOOK });
      screen.begin('town-center', 'roof-deck');
      const tag = q('.elevator-screen__name-tag')!;
      expect(tag.hidden).toBe(false);
      expect(tag.textContent).toBe('Pebble');
      expect(q('.elevator-screen')!.textContent).not.toContain('You');
    });

    it('hides the tag for an empty name', () => {
      const { q, screen } = setup(1200, { look: DEFAULT_LOOK });
      screen.begin('town-center', 'roof-deck');
      expect(q('.elevator-screen__name-tag')!.hidden).toBe(true);
    });

    it('falls back to the default Look (and no tag) with no Player', () => {
      const { q, screen } = setup(1200, { look: null });
      screen.begin('town-center', 'roof-deck');
      expect(q('.elevator-screen__penguin-art')!.dataset.lookHash).toBe(
        penguinLookHash(DEFAULT_LOOK),
      );
      expect(q('.elevator-screen__name-tag')!.hidden).toBe(true);
    });
  });
});
