// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createSnowConeStand } from './snow-cone-stand';

/** Same faked-timer set `minigame-shell.test.ts` and `pancake-flip-shell.test.ts`
 *  use: the shell's own countdown reads `performance.now()`, alongside Snow
 *  Cone Stand's own `setInterval`-driven tick. */
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
  // A fully deterministic engine (`random: () => 0`): every customer this
  // engine ever creates orders exactly one scoop of flavour 0
  // (`snow-cone-stand-engine.ts`'s own `newCustomer` rolls all read 0), so a
  // "press 1, press SPACE" cycle always serves correctly at cone5's 5
  // Tokens, with no wall-clock time (and so no patience decay) between
  // cycles: still the real `createSnowConeStand` DOM layer and the real
  // engine implementation, not a stub.
  const minigame = createSnowConeStand({ engineOptions: { random: () => 0 } });
  const launcher: MinigameLauncher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'THE MELT', subtitle: 'x' }),
    registry: { 'snow-cone-stand': () => minigame },
  });

  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());

  return { layer, store, launcher };
}

/** Serves whatever's at the front of the line: presses flavour key 1 (every
 *  customer here orders a single scoop of flavour 0), then SPACE -- both
 *  real keyboard interactions, not a test hook. */
function serveOneCone(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
});

describe('Snow Cone Stand through the real minigame shell', () => {
  it('earning 200 Tokens in a shift unlocks Brain Freeze and pays through recordRound', async () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, store, launcher } = setup();
      launcher.launch('snow-cone-stand');
      (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();

      // 40 correctly-served cone5s (5 Tokens each, no wall-clock time spent
      // between them, so no rush-hour doubling and no patience expiry)
      // reaches exactly the Brain Freeze threshold (200 Tokens).
      for (let i = 0; i < 40; i++) serveOneCone();

      const scoreCounter = () =>
        Number(layer.querySelector('[data-counter="score"]')?.textContent ?? '0');
      expect(scoreCounter()).toBe(200);

      // Run out the round so the shell finishes it.
      await vi.advanceTimersByTimeAsync(120_000 + 1000);
      // Flush the microtasks `finishRound`'s `recordRound`/`loadAll` awaits.
      for (let i = 0; i < 5; i++) await Promise.resolve();

      expect(layer.querySelector('.minigame__done')).not.toBeNull();
      expect((layer.querySelector('.minigame__play') as HTMLElement).hidden).toBe(true);
      expect((layer.querySelector('.minigame__done-saving') as HTMLElement).hidden).toBe(true);

      const tokensValue = layer.querySelector(
        '[data-done-stat="tokens"] .minigame__done-stat-value',
      )?.textContent;
      expect(tokensValue).toBe('+200');

      expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(false);
      expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toContain(
        'Brain Freeze',
      );

      const snapshot = await store.loadAll();
      expect(snapshot.badges).toContain('brain-freeze');
      expect(snapshot.tokens).toBeGreaterThanOrEqual(200);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});
