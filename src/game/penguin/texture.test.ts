import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, type PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { PENGUIN_FRAMES } from './poses';
import {
  ensurePenguinTextures,
  penguinTextureKey,
  type PenguinTextureManager,
  type PenguinTextureScene,
} from './texture';

const TOTAL_FRAMES_PER_LOOK = Object.values(PENGUIN_FRAMES).reduce((sum, count) => sum + count, 0);

interface FakeTextureManager extends PenguinTextureManager {
  addedKeys: string[];
  /** Simulates Phaser successfully decoding `key`'s texture: `exists(key)`
   * reports true from then on, and any `once(ADD_KEY + key, ...)` listener
   * fires. */
  succeed(key: string): void;
  /** Simulates Phaser's `Textures.Events.ERROR` for a failed decode of
   * `key`: `exists(key)` stays false, so a later call can retry it. */
  fail(key: string): void;
}

function createFakeTextureManager(): FakeTextureManager {
  const addedKeys: string[] = [];
  const existing = new Set<string>();
  const listeners = new Map<string, Set<(key?: string) => void>>();

  const on = (event: string, callback: (key?: string) => void): void => {
    const set = listeners.get(event) ?? new Set();
    set.add(callback);
    listeners.set(event, set);
  };
  const off = (event: string, callback: (key?: string) => void): void => {
    listeners.get(event)?.delete(callback);
  };
  const emit = (event: string, key?: string): void => {
    for (const callback of [...(listeners.get(event) ?? [])]) callback(key);
  };

  return {
    addedKeys,
    // Mimics Phaser: `addBase64` decodes asynchronously, so a just-added key
    // never reports as existing within the same test unless `succeed` is
    // called for it.
    exists: (key: string) => existing.has(key),
    addBase64: vi.fn((key: string) => {
      addedKeys.push(key);
    }),
    once: (event, callback) => {
      const wrapped: (key?: string) => void = (key) => {
        off(event, wrapped);
        callback(key);
      };
      on(event, wrapped);
    },
    on,
    off,
    succeed(key: string) {
      existing.add(key);
      emit(`addtexture-${key}`);
    },
    fail(key: string) {
      emit('onerror', key);
    },
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

  it('registers each frame key once in total for two looks equal except emote (#31 review fix 3)', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };
    const waddling: PenguinLook = { ...DEFAULT_LOOK, emote: 'WADDLE' };
    const dancing: PenguinLook = { ...DEFAULT_LOOK, emote: 'DANCE' };

    ensurePenguinTextures(scene, waddling);
    ensurePenguinTextures(scene, dancing);

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK);
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

  it('skips a key that already exists on the texture manager', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };
    const hash = penguinLookHash(DEFAULT_LOOK);
    const existingKey = penguinTextureKey(hash, 'WADDLE', 0);
    manager.succeed(existingKey);

    ensurePenguinTextures(scene, DEFAULT_LOOK);

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK - 1);
    expect(manager.addedKeys).not.toContain(existingKey);
  });

  it('clears a pending key once its texture is added or Phaser reports a load error, so it can be retried (#31 review fix 5)', () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };

    ensurePenguinTextures(scene, DEFAULT_LOOK);
    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK);
    const [firstKey, secondKey] = manager.addedKeys;

    // A successfully decoded key becomes `exists`, so a later call skips it
    // via the `exists` check rather than `pending`.
    manager.succeed(firstKey);
    expect(manager.exists(firstKey)).toBe(true);

    // A failed decode clears the key from `pending` without making it
    // `exists`, so a later call retries it.
    manager.fail(secondKey);
    manager.addedKeys.length = 0;

    ensurePenguinTextures(scene, DEFAULT_LOOK);

    expect(manager.addedKeys).toEqual([secondKey]);
  });

  // #147: a left-facing frame bakes counter-mirrored lettering
  // (`render-svg.ts`'s `renderLettering`), so it needs its own texture set,
  // distinct from the same look's right-facing ('right', the default) one.
  it("registers a separate set of keys for a look's left-facing textures, leaving its right-facing (default) keys unchanged", () => {
    const manager = createFakeTextureManager();
    const scene: PenguinTextureScene = { textures: manager };

    ensurePenguinTextures(scene, DEFAULT_LOOK);
    const rightKeys = [...manager.addedKeys];
    manager.addedKeys.length = 0;

    ensurePenguinTextures(scene, DEFAULT_LOOK, 'left');

    expect(manager.addedKeys).toHaveLength(TOTAL_FRAMES_PER_LOOK);
    expect(new Set(manager.addedKeys).size).toBe(TOTAL_FRAMES_PER_LOOK);
    for (const key of manager.addedKeys) expect(rightKeys).not.toContain(key);
  });
});

describe('penguinTextureKey (#147)', () => {
  it("omits any facing suffix for 'right' (the default), so it stays byte-identical to before facing existed", () => {
    const hash = penguinLookHash(DEFAULT_LOOK);
    expect(penguinTextureKey(hash, 'WADDLE', 0)).toBe(`penguin:${hash}:WADDLE:0`);
    expect(penguinTextureKey(hash, 'WADDLE', 0, 'right')).toBe(`penguin:${hash}:WADDLE:0`);
  });

  it("adds a distinguishing suffix for 'left'", () => {
    const hash = penguinLookHash(DEFAULT_LOOK);
    expect(penguinTextureKey(hash, 'WADDLE', 0, 'left')).toBe(`penguin:${hash}:WADDLE:0:left`);
  });
});
