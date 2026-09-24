import { AUTO, Scale, type Types } from 'phaser';
import { RoomScene } from './rooms/RoomScene';
import { GAME_HEIGHT, GAME_WIDTH } from './stage-size';

export { GAME_WIDTH, GAME_HEIGHT };

export function createGameConfig(): Types.Core.GameConfig {
  return {
    type: AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Fixed logical resolution, scaled to fit the #game container.
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
    scene: [RoomScene],
  };
}
