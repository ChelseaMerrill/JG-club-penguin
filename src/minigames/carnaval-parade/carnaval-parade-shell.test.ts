// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import type { ProgressStore } from '../../persistence/progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createCarnavalParade, type CarnavalParadeTestHooks } from './carnaval-parade';
import { createCarnavalParadeEngine, type CarnavalParadeEngine } from './carnaval-parade-engine';
import type { Minigame } from '../minigame';

/** Same faked-timer set the other games' shell tests use: the shell's own
 *  countdown reads `performance.now()`, the in-memory store's anti-farm
 *  clock reads `Date.now()`, and Carnaval Parade ticks on `setInterval`. */
function fakeTimerConfig(): Parameters<typeof vi.useFakeTimers>[0] {
  return {
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  };
}

let cleanupFns: Array<() => void> = [];

/** The latest engine the registry factory below built, for a test to drive
 *  straight to a particular score via `debugSetScore` without precisely
 *  timing the spawner (`carnaval-parade-engine.test.ts`'s job). */
let latestEngine: CarnavalParadeEngine | undefined;
let latestGame: (Minigame<'carnaval-parade'> & CarnavalParadeTestHooks) | undefined;

function setup(): { layer: HTMLElement; store: ProgressStore; launcher: MinigameLauncher } {
  const layer = document.createElement('div');
  document.body.append(layer);
  const overlays = createOverlayManager();
  const store = createInMemoryProgressStore();
  const launcher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'LATAM DISCO HALL', subtitle: 'x' }),
    // A fresh real game (and its own fresh engine) per launch, like the
    // default registry, but keeping a reference this file's tests can drive.
    registry: {
      'carnaval-parade': () => {
        latestEngine = createCarnavalParadeEngine();
        latestGame = createCarnavalParade({ engine: latestEngine });
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

beforeEach(() => {
  document.body.innerHTML = '';
  latestEngine = undefined;
  latestGame = undefined;
  vi.useFakeTimers(fakeTimerConfig());
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  vi.useRealTimers();
});

describe('Carnaval Parade through the real minigame shell and in-memory store', () => {
  it('a 410-point round shows PASSISTA, pays 41 Tokens plus the +50 Badge bonus', async () => {
    const { layer, store, launcher } = setup();

    launcher.launch('carnaval-parade');
    click(layer, '.minigame__button--start');
    latestEngine!.debugSetScore(410, 41, 0);
    latestGame!.debugFinishNow();
    await settle();

    expect((layer.querySelector('.minigame__done') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__done-kicker')?.textContent).toBe('FIM DO DESFILE');
    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('PASSISTA');
    expect(doneValue(layer, 'score')).toBe('410');
    expect(doneValue(layer, 'tokens')).toBe('+41');
    expect(doneValue(layer, 'best')).toBe('410');
    expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toBe(
      'Badge unlocked: Passista',
    );
    expect(layer.querySelector('.minigame__done-quote')?.textContent).toBe(
      'Hector: "Que desfile! The whole avenue is on its feet."',
    );
    // 100 (starting) + 41 (payout) + 50 (first-time Badge bonus).
    expect((await store.loadAll()).tokens).toBe(191);
    expect((await store.loadAll()).badges).toEqual(['passista']);
  });

  it('a 90-point round shows APRENDIZ, pays 9 Tokens and no Badge', async () => {
    const { layer, store, launcher } = setup();

    launcher.launch('carnaval-parade');
    click(layer, '.minigame__button--start');
    latestEngine!.debugSetScore(90, 9, 0);
    latestGame!.debugFinishNow();
    await settle();

    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('APRENDIZ');
    expect(doneValue(layer, 'tokens')).toBe('+9');
    expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(true);
    expect((await store.loadAll()).tokens).toBe(109);
    expect((await store.loadAll()).badges).toEqual([]);
  });

  it('a 2000-point round pays exactly the 120 cap', async () => {
    const { layer, store, launcher } = setup();

    launcher.launch('carnaval-parade');
    click(layer, '.minigame__button--start');
    latestEngine!.debugSetScore(2000, 200, 0);
    latestGame!.debugFinishNow();
    await settle();

    expect(doneValue(layer, 'tokens')).toBe('+120');
    // 100 (starting) + 120 (capped payout) + 50 (Passista, since 2000 >= 400).
    expect((await store.loadAll()).tokens).toBe(270);
  });

  it('a second round inside 10 s is rejected (round_too_soon), shown as a save error', async () => {
    const { layer, launcher } = setup();

    launcher.launch('carnaval-parade');
    click(layer, '.minigame__button--start');
    latestEngine!.debugSetScore(100, 10, 0);
    latestGame!.debugFinishNow();
    await settle();
    click(layer, '.minigame__done-actions .minigame__button--quit');

    launcher.launch('carnaval-parade');
    click(layer, '.minigame__button--start');
    latestEngine!.debugSetScore(100, 10, 0);
    latestGame!.debugFinishNow();
    await settle();

    expect(layer.querySelector('.minigame__done-error')?.textContent).toBe(
      "Your score couldn't be saved.",
    );
  });

  it('the how-to-play screen shows the subtitle and three design-copy steps, then START runs the round', () => {
    const { layer, launcher } = setup();

    launcher.launch('carnaval-parade');

    expect(layer.querySelector('.minigame__howto-subtitle')?.textContent).toBe(
      'CARNAVAL PARADE · 45 SECONDS · SOLO',
    );
    expect(layer.querySelectorAll('.minigame__howto-list li')).toHaveLength(3);

    click(layer, '.minigame__button--start');

    expect((layer.querySelector('.minigame__play') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__title')?.textContent).toBe('CARNAVAL PARADE');
    expect(layer.querySelectorAll('.carnaval-parade__life--lit')).toHaveLength(3);
  });
});
