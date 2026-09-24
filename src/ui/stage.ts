import type { Game } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';

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
 * centring it with a `GUTTER`px margin on the constrained axis (the axis with
 * no leftover space). Pure: no DOM reads or writes.
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
 * `resize`, then asks Phaser to re-measure the canvas against its now-resized
 * parent (`#stage`'s `Scale.FIT` fills it exactly).
 */
export function mountStage(game: Game): void {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!stage || !ui) {
    throw new Error('Stage layer #stage or #ui is missing from index.html');
  }

  const applyFit = (): void => {
    const fit = computeStageFit(window.innerWidth, window.innerHeight);
    stage.style.width = `${fit.width}px`;
    stage.style.height = `${fit.height}px`;
    stage.style.left = `${fit.left}px`;
    stage.style.top = `${fit.top}px`;
    ui.style.transform = `scale(${fit.scale})`;
    game.scale.refresh();
  };

  applyFit();
  window.addEventListener('resize', applyFit);
}
