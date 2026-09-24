import { Game } from 'phaser';
import { createGameConfig } from './config';

export function startGame(): Game {
  return new Game(createGameConfig());
}
