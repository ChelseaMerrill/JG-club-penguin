// @vitest-environment jsdom
// Phaser reads `window` at import time, so this file needs a DOM environment.
import { describe, expect, it } from 'vitest';
import { createGameConfig, GAME_HEIGHT, GAME_WIDTH } from './config';
import { RoomScene } from './rooms/RoomScene';

describe('createGameConfig', () => {
  it('mounts into #game and registers RoomScene', () => {
    const config = createGameConfig();

    expect(config.parent).toBe('game');
    expect(config.scene).toEqual([RoomScene]);
  });

  it('uses the 1600x900 stage resolution', () => {
    expect(GAME_WIDTH).toBe(1600);
    expect(GAME_HEIGHT).toBe(900);

    const config = createGameConfig();
    expect(config.width).toBe(1600);
    expect(config.height).toBe(900);
  });
});
