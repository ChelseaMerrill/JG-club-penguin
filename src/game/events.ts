/** The app's single local game-event bus, shared by Phaser scenes and DOM overlays. */
import { createEmitter } from '../contracts/game-events';
import type { GameEmitter } from '../contracts/game-events';

export const gameEvents: GameEmitter = createEmitter();
