// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import type { ProgressStore } from '../../persistence/progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameLauncher, type MinigameLauncher } from '../minigame-launcher';
import { MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createBeystadium } from './beystadium';

/** Same faked-timer set the other games' shell tests use: the shell's own
 *  countdown reads `performance.now()`, the in-memory store's anti-farm
 *  clock reads `Date.now()`, and Beystadium ticks on `setInterval`. */
function fakeTimerConfig(): Parameters<typeof vi.useFakeTimers>[0] {
  return {
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  };
}

const TICK = 50;
let cleanupFns: Array<() => void> = [];

function setup(): { layer: HTMLElement; store: ProgressStore; launcher: MinigameLauncher } {
  const layer = document.createElement('div');
  document.body.append(layer);
  const overlays = createOverlayManager();
  const store = createInMemoryProgressStore();
  const launcher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'TEAM ROOM 4', subtitle: 'x' }),
    // A fresh real game per launch, exactly like the default registry.
    registry: { beystadium: () => createBeystadium() },
  });
  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());
  return { layer, store, launcher };
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function click(layer: HTMLElement, selector: string): void {
  (layer.querySelector(selector) as HTMLElement).click();
}

/** Launches, starts and rips a perfect launch with the default Bey (GLACIER). */
function startMatch(layer: HTMLElement, launcher: MinigameLauncher): void {
  launcher.launch('beystadium');
  click(layer, '.minigame__button--start');
  click(layer, '.beystadium__to-stadium');
  vi.advanceTimersByTime(20 * TICK); // meter 68: a perfect launch
  press(' ');
}

/** Wins 2-0 by real key presses: in each battle round, waits for the ring's
 *  cyan zone (1.55 s in) and strikes 6 times, then waits out the pause. */
function winMatch(layer: HTMLElement, launcher: MinigameLauncher): void {
  startMatch(layer, launcher);
  for (let round = 0; round < 2; round++) {
    vi.advanceTimersByTime(31 * TICK);
    for (let i = 0; i < 6; i++) press(' ');
    vi.advanceTimersByTime(33 * TICK);
    if (round === 0) {
      vi.advanceTimersByTime(20 * TICK);
      press(' ');
    }
  }
}

/** Loses 0-2 by never fighting back (round 2 on a weak launch). */
function loseMatch(layer: HTMLElement, launcher: MinigameLauncher): void {
  startMatch(layer, launcher);
  while ((layer.querySelector('.beystadium__launch') as HTMLElement).hidden) {
    vi.advanceTimersByTime(TICK);
  }
  vi.advanceTimersByTime(5 * TICK);
  press(' ');
  vi.advanceTimersByTime(30_000);
}

/** Lets `recordRound` and the post-save `loadAll` settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function doneValue(layer: HTMLElement, key: string): string | null | undefined {
  return layer.querySelector(`[data-done-stat="${key}"] .minigame__done-stat-value`)?.textContent;
}

/** QUIT from the done screen, then 45 s idle (a full anti-farm window). */
function leaveAndWait(layer: HTMLElement): void {
  click(layer, '.minigame__done-actions .minigame__button--quit');
  vi.advanceTimersByTime(45_000);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers(fakeTimerConfig());
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  vi.useRealTimers();
});

describe('Beystadium through the real minigame shell and in-memory store', () => {
  it('a won match shows MATCH OVER · CHAMPION and pays 60 Tokens', async () => {
    const { layer, store, launcher } = setup();

    winMatch(layer, launcher);
    await settle();

    expect((layer.querySelector('.minigame__done') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__done-kicker')?.textContent).toBe('MATCH OVER');
    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('CHAMPION');
    expect(doneValue(layer, 'match')).toBe('2 – 0');
    expect(doneValue(layer, 'score')).toBe('12');
    expect(doneValue(layer, 'perfectLaunches')).toBe('2');
    expect(doneValue(layer, 'tokens')).toBe('+60');
    expect(layer.querySelector('.minigame__done-quote')?.textContent).toBe(
      'Michael: "...best of five?"',
    );
    expect((await store.loadAll()).tokens).toBe(160);
  });

  it('a lost match shows 3-0. AGAIN. and pays 15 Tokens', async () => {
    const { layer, store, launcher } = setup();

    loseMatch(layer, launcher);
    await settle();

    expect(layer.querySelector('.minigame__done-title')?.textContent).toBe('3-0. AGAIN.');
    expect(doneValue(layer, 'match')).toBe('0 – 2');
    expect(doneValue(layer, 'tokens')).toBe('+15');
    expect((await store.loadAll()).tokens).toBe(115);
  });

  it('the third won match unlocks Let It Rip (+50 the first time)', async () => {
    const { layer, store, launcher } = setup();

    winMatch(layer, launcher);
    await settle();
    expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(true);
    leaveAndWait(layer);

    loseMatch(layer, launcher);
    await settle();
    leaveAndWait(layer);

    winMatch(layer, launcher);
    await settle();
    expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(true);
    leaveAndWait(layer);

    winMatch(layer, launcher);
    await settle();

    expect((layer.querySelector('.minigame__done-badge') as HTMLElement).hidden).toBe(false);
    expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toBe(
      'Badge unlocked: Let It Rip',
    );
    const snapshot = await store.loadAll();
    expect(snapshot.badges).toEqual(['let-it-rip']);
    // 100 + 60 + 15 + 60 + 60 + 50 (first-time Badge bonus).
    expect(snapshot.tokens).toBe(345);
  }, 20_000);
});
