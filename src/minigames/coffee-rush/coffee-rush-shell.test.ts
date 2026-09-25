// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createCoffeeRush } from './coffee-rush';

/** Same faked-timer set `pancake-flip-shell.test.ts` uses: the shell's own
 *  countdown reads `performance.now()`, alongside Coffee Rush's own
 *  `setInterval`-driven tick. */
function fakeTimerConfig(): Parameters<typeof vi.useFakeTimers>[0] {
  return {
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  };
}

let cleanupFns: Array<() => void> = [];

function setup() {
  const layer = document.createElement('div');
  document.body.append(layer);
  const overlays = createOverlayManager();
  const store = createInMemoryProgressStore();
  // A deterministic engine (always a SMALL head order) so 15 cups can be
  // served reliably within the 90s round without depending on real RNG
  // order sizes; still the real `createCoffeeRush` DOM layer and the real
  // engine implementation.
  const minigame = createCoffeeRush({ engineOptions: { random: () => 0 } });
  const launcher: MinigameLauncher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'THE MELT', subtitle: 'x' }),
    registry: { 'coffee-rush': () => minigame },
  });

  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());

  return { layer, store, launcher };
}

/** Selects cup 0 (a real click) and pours it exactly to the SMALL fill line
 *  (40%) via the real hold-release path: SPACE keydown starts the pour,
 *  `clock.runFor`-style ticking (here, faked-timer `advanceTimersByTime`)
 *  grows the fill at the engine's own real rate, then SPACE keyup releases
 *  it. Every head order is SMALL (the deterministic `random: () => 0`
 *  engine), so this always serves a perfect small cup. */
function pourOnePerfectSmallCup(layer: HTMLElement): void {
  const cupButton = layer.querySelectorAll<HTMLElement>('.coffee-rush__cup')[0];
  cupButton.click();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  // 40% at 26%/s takes ~1.54s; the engine's own tick cadence is 100ms.
  vi.advanceTimersByTime(1540);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
});

describe('Coffee Rush through the real minigame shell', () => {
  it('serving 15 cups shows Barista earned on the done screen and in loadAll()', async () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, store, launcher } = setup();
      launcher.launch('coffee-rush');
      (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();

      const scoreCounter = () =>
        Number(layer.querySelector('[data-counter="score"]')?.textContent ?? '0');

      let servedCount = 0;
      while (scoreCounter() < 15 && servedCount < 40) {
        pourOnePerfectSmallCup(layer);
        servedCount += 1;
      }
      expect(scoreCounter()).toBeGreaterThanOrEqual(15);

      // Run out the rest of the 90s round so the shell finishes it.
      await vi.advanceTimersByTimeAsync(91_000);
      for (let i = 0; i < 5; i++) await Promise.resolve();

      expect(layer.querySelector('.minigame__done')).not.toBeNull();
      expect((layer.querySelector('.minigame__play') as HTMLElement).hidden).toBe(true);
      expect((layer.querySelector('.minigame__done-saving') as HTMLElement).hidden).toBe(true);
      expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(false);
      expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toContain('Barista');

      const snapshot = await store.loadAll();
      expect(snapshot.badges).toContain('barista');
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('starts, plays a real pour via keyboard, and reaches the done screen', async () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, launcher } = setup();
      launcher.launch('coffee-rush');
      (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();

      expect(layer.querySelectorAll('.coffee-rush__cup')).toHaveLength(4);

      pourOnePerfectSmallCup(layer);

      await vi.advanceTimersByTimeAsync(91_000);
      for (let i = 0; i < 5; i++) await Promise.resolve();

      expect(layer.querySelector('.minigame__done')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});
