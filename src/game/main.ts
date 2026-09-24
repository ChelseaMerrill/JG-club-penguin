import { Game } from 'phaser';
import { createGameConfig } from './config';
import { ROOM_SCENE_KEY, type RoomScene } from './rooms/RoomScene';

export function startGame(): Game {
  return new Game(createGameConfig());
}

/**
 * Resolves with the `RoomScene` once its first `create()` has run. Waits for
 * the Game's own `ready` event (when the Scene instance first exists in
 * `game.scene`) and then for the Scene's own `whenReady()` promise.
 */
export function whenSceneReady(game: Game): Promise<RoomScene> {
  return new Promise((resolve) => {
    game.events.once('ready', () => {
      const scene = game.scene.getScene<RoomScene>(ROOM_SCENE_KEY);
      void scene.whenReady().then(() => resolve(scene));
    });
  });
}
