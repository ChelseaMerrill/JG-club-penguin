// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createPancakeFlip } from './pancake-flip';

/** Same faked-timer set `minigame-shell.test.ts` uses: the shell's own
 *  countdown reads `performance.now()`, alongside Pancake Flip's own
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
  // A deterministic engine (guaranteed batter spawns) so the round can be
  // driven to 20 stacked without depending on real RNG timing; still the
  // real `createPancakeFlip` DOM layer and the real engine implementation.
  const minigame = createPancakeFlip({ engineOptions: { batterSpawnChance: 1, random: () => 0 } });
  const launcher: MinigameLauncher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'THE KITCHEN', subtitle: 'x' }),
    registry: { 'pancake-flip': () => minigame },
  });

  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());

  return { layer, store, launcher };
}

/** Clicking a pan selects it (one of the three documented ways, alongside
 *  the arrow keys); ENTER flips it — both real interactions, not a test
 *  hook. Flips every pan currently Golden or Flip Now. */
function flipReadyPans(layer: HTMLElement): void {
  const pans = Array.from(layer.querySelectorAll<HTMLElement>('.pancake-flip__pan'));
  for (const pan of pans) {
    const stage = pan.dataset.stage;
    if (stage !== 'golden' && stage !== 'flip-now') continue;
    (pan.querySelector('.pancake-flip__pan-surface') as HTMLButtonElement).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
});

describe('Pancake Flip through the real minigame shell', () => {
  it('stacking 20 shows Breakfast Club earned on the done screen and in loadAll()', async () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, store, launcher } = setup();
      launcher.launch('pancake-flip');
      (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();

      const stackedCounter = () =>
        Number(layer.querySelector('[data-counter="stacked"]')?.textContent ?? '0');

      // Every 100ms (the game's own tick cadence), flip any pan currently
      // Golden or Flip Now. With guaranteed batter spawns this reaches 20
      // stacked well within the 90s round.
      let elapsedMs = 0;
      const stepMs = 100;
      while (stackedCounter() < 20 && elapsedMs < 80_000) {
        await vi.advanceTimersByTimeAsync(stepMs);
        elapsedMs += stepMs;
        flipReadyPans(layer);
      }
      expect(stackedCounter()).toBeGreaterThanOrEqual(20);

      // Run out the rest of the 90s round so the shell finishes it.
      await vi.advanceTimersByTimeAsync(Math.max(0, 90_000 - elapsedMs) + 1000);
      // Flush the microtasks `finishRound`'s `recordRound`/`loadAll` awaits.
      for (let i = 0; i < 5; i++) await Promise.resolve();

      expect(layer.querySelector('.minigame__done')).not.toBeNull();
      expect((layer.querySelector('.minigame__play') as HTMLElement).hidden).toBe(true);
      expect((layer.querySelector('.minigame__done-saving') as HTMLElement).hidden).toBe(true);
      expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(false);
      expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toContain(
        'Breakfast Club',
      );

      const snapshot = await store.loadAll();
      expect(snapshot.badges).toContain('breakfast-club');
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('starts, plays a real flip via keyboard, and reaches the done screen', async () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, launcher } = setup();
      launcher.launch('pancake-flip');
      (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();

      expect(layer.querySelectorAll('.pancake-flip__pan')).toHaveLength(4);

      // Give a pan a moment to cook, then flip via the real keyboard path.
      await vi.advanceTimersByTimeAsync(2500);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      await vi.advanceTimersByTimeAsync(90_000);
      for (let i = 0; i < 5; i++) await Promise.resolve();

      expect(layer.querySelector('.minigame__done')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});
