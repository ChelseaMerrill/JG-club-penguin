import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, type PenguinLook } from '../../contracts';
import { PENGUIN_FRAMES } from './poses';
import {
  ensurePenguinTextures,
  type PenguinTextureManager,
  type PenguinTextureScene,
} from './texture';

const TOTAL_FRAMES_PER_LOOK = Object.values(PENGUIN_FRAMES).reduce((sum, count) => sum + count, 0);

function createFakeTextureManager(): PenguinTextureManager & { addedKeys: string[] } {
  const addedKeys: string[] = [];
  return {
    addedKeys,
    exists: () => false, // Mimics Phaser: `addBase64` decodes asynchronously, so a
    // just-added key never reports as existing within the same test.
    addBase64: vi.fn((key: string) => {
      addedKeys.push(key);
    }),
  };
}

describe('ensurePenguinTextures', () => {
  it('registers each frame key once in total for two looks equal except name', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };
    const named: PenguinLook = { ...DEFAULT_LOOK, name: 'Alpha' };
    const renamed: PenguinLook = { ...DEFAULT_LOOK, name: 'Beta' };

    ensurePenguinTextures(scene, named);
    ensurePenguinTextures(scene, renamed);

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK);
    expect(new Set(manager.addedKeys).size).toBe(TOTAL_FRAMES_PER_LOOK);
  });

  it('registers new keys for a visually different look', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };

    ensurePenguinTextures(scene, DEFAULT_LOOK);
    ensurePenguinTextures(scene, { ...DEFAULT_LOOK, body: '#F4F4F4' });

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK * 2);
  });

  it('does not double-register a look while its first call is still pending', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };

    ensurePenguinTextures(scene, DEFAULT_LOOK);
    ensurePenguinTextures(scene, DEFAULT_LOOK);

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK);
  });
});
