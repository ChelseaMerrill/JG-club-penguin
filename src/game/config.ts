import { AUTO, Scale, type Types } from 'phaser';
import { MainScene } from './scenes/MainScene';

export const GAME_WIDTH = 1600;
export const GAME_HEIGHT = 900;

export function createGameConfig(): Types.Core.GameConfig {
  return {
    type: AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Fixed logical resolution, scaled to fit the #game container.
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
    scene: [MainScene],
  };
}
