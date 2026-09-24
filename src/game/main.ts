import { Game } from 'phaser';
import { createGameConfig } from './config';
import { MAIN_SCENE_KEY, MainScene } from './scenes/MainScene';
import type { PenguinSpriteView } from './penguin-sprites';

export function startGame(): Game {
  return new Game(createGameConfig());
}

/**
 * Resolves once `MainScene.create()` has run, with the Penguin view it
 * built. Waits for the Game's own `ready` event (when the Scene instance
 * first exists in `game.scene`) and then for the Scene's own `whenReady()`
 * promise (when `create()` has actually run and `scene.penguins` is set).
 */
export function whenSceneReady(game: Game): Promise<PenguinSpriteView> {
  return new Promise((resolve) => {
    game.events.once('ready', () => {
      const scene = game.scene.getScene<MainScene>(MAIN_SCENE_KEY);
      void scene.whenReady().then(() => resolve(scene.penguins));
    });
  });
}
