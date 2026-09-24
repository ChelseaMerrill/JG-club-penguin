import type { Game } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/stage-size';
import { getUiLayer } from './ui-layer';

/** Per-side gutter (px) around the fitted stage, so the design ring stays visible. */
const GUTTER = 9;

export interface StageFit {
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Fits the fixed 1600x900 stage into a viewport, preserving aspect ratio and
 * centering it with a `GUTTER`px margin on the constrained axis (the axis
 * with no leftover space). Pure: no DOM reads or writes.
 */
export function computeStageFit(viewportWidth: number, viewportHeight: number): StageFit {
  const scale = Math.min(
    (viewportWidth - GUTTER * 2) / GAME_WIDTH,
    (viewportHeight - GUTTER * 2) / GAME_HEIGHT,
  );
  const width = GAME_WIDTH * scale;
  const height = GAME_HEIGHT * scale;
  const left = (viewportWidth - width) / 2;
  const top = (viewportHeight - height) / 2;
  return { scale, width, height, left, top };
}

/**
 * Applies `computeStageFit` to `#stage` and `#ui` on load and on every
 * `resize`, then tells Phaser the new `#game` parent size directly.
 * `game.scale.refresh()` alone isn't enough here: Phaser's own window-resize
 * handling only marks its scale manager dirty and re-measures the parent on
 * its next internal step, so it would use a stale parent size if we asked it
 * to refresh synchronously right after resizing `#stage`. `setParentSize`
 * sets the new size directly and refreshes off of it immediately.
 */
export function mountStage(game: Game): void {
  const stage = document.getElementById('stage');
  if (!stage) {
    throw new Error('Stage layer #stage is missing from index.html');
  }
  const ui = getUiLayer();

  const applyFit = (): void => {
    const fit = computeStageFit(window.innerWidth, window.innerHeight);
    stage.style.width = `${fit.width}px`;
    stage.style.height = `${fit.height}px`;
    stage.style.left = `${fit.left}px`;
    stage.style.top = `${fit.top}px`;
    ui.style.transform = `scale(${fit.scale})`;
    game.scale.setParentSize(fit.width, fit.height);
  };

  applyFit();
  window.addEventListener('resize', applyFit);
}
