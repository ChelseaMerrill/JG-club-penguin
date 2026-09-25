// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../../persistence/in-memory-progress-store';
import { createOverlayManager } from '../../ui/hud/overlay-manager';
import { createMinigameShell, MINIGAME_OVERLAY_ID } from '../minigame-shell';
import { createBugSquashMinigame } from './bug-squash';

/** `querySelector(selector)?.hidden`, typed: `hidden` is an `HTMLElement`
 *  property, not `Element`'s (same helper `minigame-shell.test.ts` uses). */
function isHidden(root: HTMLElement, selector: string): boolean {
  return (root.querySelector(selector) as HTMLElement | null)?.hidden ?? false;
}

function doneStatValue(root: HTMLElement, key: string): string | null | undefined {
  return root.querySelector(`[data-done-stat="${key}"] .minigame__done-stat-value`)?.textContent;
}

let cleanupFns: Array<() => void> = [];

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  document.body.innerHTML = '';
});

describe('bug-squash through the real minigame shell + in-memory progress store', () => {
  it('a round scoring 520 shows 52 tokens earned and the Exterminator badge, and persists it', async () => {
    const layer = document.createElement('div');
    document.body.append(layer);
    const overlays = createOverlayManager();
    cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
    cleanupFns.push(() => overlays.destroy());

    const store = createInMemoryProgressStore();
    const minigame = createBugSquashMinigame();

    createMinigameShell({
      layer,
      overlays,
      store,
      roomTitle: 'DEV PIT',
      minigame,
    });

    (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();
    expect(isHidden(layer, '.minigame__play')).toBe(false);

    // Force the score to 520 (bypassing real hits) and end the round
    // immediately, exactly as the e2e `?minigame=bug-squash` hook does.
    minigame.debugSetScore(520);
    minigame.debugFinishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done')).toBe(false));
    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-saving')).toBe(true));

    expect(doneStatValue(layer, 'score')).toBe('520');
    expect(doneStatValue(layer, 'tokens')).toBe('+52');
    expect(isHidden(layer, '.minigame__done-badge')).toBe(false);
    expect(layer.querySelector('.minigame__done-badge-name')?.textContent).toContain(
      'Exterminator',
    );

    const snapshot = await store.loadAll();
    expect(snapshot.badges).toContain('exterminator');
  });
});
