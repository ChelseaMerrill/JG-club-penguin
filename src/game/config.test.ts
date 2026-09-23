// @vitest-environment jsdom
// Phaser reads `window` at import time, so this file needs a DOM environment.
import { describe, expect, it } from 'vitest';
import { createGameConfig } from './config';
import { MainScene } from './scenes/MainScene';

describe('createGameConfig', () => {
  it('mounts into #game and registers MainScene', () => {
    const config = createGameConfig();

    expect(config.parent).toBe('game');
    expect(config.scene).toEqual([MainScene]);
  });
});
