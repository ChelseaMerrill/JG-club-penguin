// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import type { ProgressStore } from '../../persistence/progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import type { Minigame } from '../minigame';
import { createPaoDeQueijo, type PaoDeQueijoTestHooks } from './pao-de-queijo';

/** Same faked-timer set the other games' shell tests use: the shell's own
 *  countdown reads `performance.now()`, the in-memory store's anti-farm
 *  clock reads `Date.now()`, and Pão de Queijo ticks on `setInterval`. */
function fakeTimerConfig(): Parameters<typeof vi.useFakeTimers>[0] {
  return {
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  };
}

let cleanupFns: Array<() => void> = [];

/** The latest game the registry factory below built, for a test to drive
 *  with `debugMatchAllPairs` without precisely timing 24 real flips. */
let latestGame: (Minigame<'pao-de-queijo'> & PaoDeQueijoTestHooks) | undefined;

function setup(): { layer: HTMLElement; store: ProgressStore; launcher: MinigameLauncher } {
  const layer = document.createElement('div');
  document.body.append(layer);
  const overlays = createOverlayManager();
  const store = createInMemoryProgressStore();
  const launcher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'LATAM CAFÉ', subtitle: 'x' }),
    registry: {
      'pao-de-queijo': () => {
        latestGame = createPaoDeQueijo();
        return latestGame;
      },
    },
  });
  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());
  return { layer, store, launcher };
}

function click(layer: HTMLElement, selector: string): void {
  (layer.querySelector(selector) as HTMLElement).click();
}

/** Lets `recordRound` and the post-save `loadAll` settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function doneValue(layer: HTMLElement, key: string): string | null | undefined {
  return layer.querySelector(`[data-done-stat="${key}"] .minigame__done-stat-value`)?.textContent;
}

/** Clears round 1 and round 2, then lets round 3's own 50s clock run out for
 *  real (a partial clear: 2 of 3 rounds, no Badge). */
async function clearTwoRoundsThenTimeOut(): Promise<void> {
  latestGame!.debugMatchAllPairs(); // round 1
  await vi.advanceTimersByTimeAsync(1_500); // the between-round pause.
  latestGame!.debugMatchAllPairs(); // round 2
  // Past the second pause, round 3's own preview, and its full 50s clock.
  await vi.advanceTimersByTimeAsync(1_500 + 1_800 + 50_000);
}

/** Clears all 3 rounds via `debugMatchAllPairs`, ending the round DELICIOSO!. */
async function clearAllThreeRounds(): Promise<void> {
  latestGame!.debugMatchAllPairs(); // round 1
  await vi.advanceTimersByTimeAsync(1_500);
  latestGame!.debugMatchAllPairs(); // round 2
  await vi.advanceTimersByTimeAsync(1_500);
  latestGame!.debugMatchAllPairs(); // round 3 (the final one)
  await vi.advanceTimersByTimeAsync(1_300);
}

beforeEach(() => {
  document.body.innerHTML = '';
  latestGame = undefined;
  vi.useFakeTimers(fakeTimerConfig());
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  vi.useRealTimers();
});

describe('Pão de Queijo Memory through the real minigame shell and in-memory store', () => {
  it('the how-to-play screen shows the subtitle and three design-copy steps, then START deals round 1', () => {
    const { layer, launcher } = setup();

    launcher.launch('pao-de-queijo');

    expect(layer.querySelector('.minigame__howto-subtitle')?.textContent).toBe(
      'PÃO DE QUEIJO MEMORY · 3 ROUNDS · SOLO',
    );
    expect(layer.querySelectorAll('.minigame__howto-list li')).toHaveLength(3);

    click(layer, '.minigame__button--start');

    expect((layer.querySelector('.minigame__play') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__title')?.textContent).toBe('PÃO DE QUEIJO MEMORY');
    expect(layer.querySelectorAll('.pao-de-queijo__card')).toHaveLength(12);
  });

  it('a full clear shows DELICIOSO!, pays the 300 cap and earns Mestre do Pão de Queijo (+50)', async () => {
    const { layer, store, launcher } = setup();

    launcher.launch('pao-de-queijo');
    click(layer, '.minigame__button--start');
    await clearAllThreeRounds();
    await settle();

    expect((layer.querySelector('.minigame__done') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__done-kicker')?.textContent).toBe('TODAS AS RODADAS');
    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('DELICIOSO!');
    expect(doneValue(layer, 'score')).toBe('6795');
    expect(doneValue(layer, 'cleared')).toBe('3 / 3');
    expect(doneValue(layer, 'bestStreak')).toBe('24');
    // floor(6795 / 10) = 679, capped at 300.
    expect(doneValue(layer, 'tokens')).toBe('+300');
    expect(doneValue(layer, 'best')).toBe('6795');
    expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toBe(
      'Badge unlocked: Mestre do Pão de Queijo',
    );
    expect(layer.querySelector('.minigame__done-quote')?.textContent).toBe(
      'Sander: "Que delícia! You cleaned out the whole case."',
    );
    // 100 (starting) + 300 (capped payout) + 50 (first-time Badge bonus).
    expect((await store.loadAll()).tokens).toBe(450);
    expect((await store.loadAll()).badges).toEqual(['mestre-do-pao-de-queijo']);
  });

  it('a 2-of-3 clear shows QUASE LÁ, pays under the cap and earns no Badge', async () => {
    const { layer, store, launcher } = setup();

    launcher.launch('pao-de-queijo');
    click(layer, '.minigame__button--start');
    await clearTwoRoundsThenTimeOut();
    await settle();

    expect(layer.querySelector('.minigame__done-kicker')?.textContent).toBe('TIME RAN OUT');
    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('QUASE LÁ');
    expect(doneValue(layer, 'cleared')).toBe('2 / 3');
    expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(true);
    expect(layer.querySelector('.minigame__done-quote')?.textContent).toBe(
      'Sander: "Quase! One more round and the badge is yours."',
    );
    expect((await store.loadAll()).badges).toEqual([]);
  });

  it('a second round inside 10 s is rejected (round_too_soon), shown as a save error', async () => {
    const { layer, launcher } = setup();

    launcher.launch('pao-de-queijo');
    click(layer, '.minigame__button--start');
    await clearAllThreeRounds();
    await settle();
    click(layer, '.minigame__done-actions .minigame__button--quit');

    launcher.launch('pao-de-queijo');
    click(layer, '.minigame__button--start');
    await clearAllThreeRounds();
    await settle();

    expect(layer.querySelector('.minigame__done-error')?.textContent).toBe(
      "Your score couldn't be saved.",
    );
  });
});
