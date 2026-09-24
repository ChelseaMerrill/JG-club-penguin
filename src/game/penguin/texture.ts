import type { PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { PENGUIN_ANIMS, PENGUIN_FRAMES, type PenguinAnim } from './poses';
import { renderPenguinSvg } from './render-svg';

/**
 * Mirrors Phaser's `Textures.Events.ADD_KEY` / `.ERROR` string values
 * without importing `phaser` into this module (it intentionally has no
 * Phaser import, so its unit tests can pass a plain fake without booting
 * Phaser under jsdom).
 */
const ADD_KEY_EVENT_PREFIX = 'addtexture-';
const ERROR_EVENT = 'onerror';

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs. Written
 * against this minimal structural interface (rather than importing Phaser's
 * type) so its unit test can pass a plain fake without booting Phaser.
 */
export interface PenguinTextureManager {
  exists(key: string): boolean;
  addBase64(key: string, data: string): void;
  once(event: string, callback: (key?: string) => void): void;
  on(event: string, callback: (key?: string) => void): void;
  off(event: string, callback: (key?: string) => void): void;
}

/** The slice of a Phaser `Scene` this module needs. */
export interface PenguinTextureScene {
  textures: PenguinTextureManager;
}

/** The texture key for one frame of a look's hash (#31 D6). */
export function penguinTextureKey(hash: string, anim: PenguinAnim, frame: number): string {
  return `penguin:${hash}:${anim}:${frame}`;
}

// `btoa` is a global in both browsers and Node >=22 (this repo's minimum
// engine, see `package.json`), so no Buffer/node-types fallback is needed.
function svgToBase64(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Tracks keys already requested from a given texture manager but not yet
// reported by `exists` (Phaser's `addBase64` decodes the image
// asynchronously), so a second call made before that decode finishes never
// re-requests the same key. Keyed by the manager instance itself so
// independent fakes in tests (and independent scenes at runtime) never share
// state. A key is removed once the manager reports either the texture was
// added (`ADD_KEY`, from then on `exists` covers it) or that its decode
// failed (`ERROR`, #31 review fix 5), so a failed decode can be retried by a
// later call.
const pendingByManager = new WeakMap<PenguinTextureManager, Set<string>>();

/**
 * Registers every anim/frame texture for `look` on `scene`, keyed by a hash
 * of the look excluding `name` and `emote` (#31 D6/review fix 3), so two
 * Penguins with the same look (whatever their names, or whichever idle
 * animation is currently playing) share one set of textures. Skips any key
 * that already exists or is still pending from an earlier call.
 */
export function ensurePenguinTextures(scene: PenguinTextureScene, look: PenguinLook): void {
  const hash = penguinLookHash(look);
  const manager = scene.textures;

  let pending = pendingByManager.get(manager);
  if (!pending) {
    pending = new Set();
    pendingByManager.set(manager, pending);
  }
  const activePending = pending;

  for (const anim of PENGUIN_ANIMS) {
    const frameCount = PENGUIN_FRAMES[anim];
    for (let frame = 0; frame < frameCount; frame++) {
      const key = penguinTextureKey(hash, anim, frame);
      if (manager.exists(key) || activePending.has(key)) continue;
      activePending.add(key);

      manager.once(ADD_KEY_EVENT_PREFIX + key, () => {
        activePending.delete(key);
      });

      const onError = (failedKey?: string): void => {
        if (failedKey !== key) return;
        activePending.delete(key);
        manager.off(ERROR_EVENT, onError);
      };
      manager.on(ERROR_EVENT, onError);

      manager.addBase64(key, svgToBase64(renderPenguinSvg(look, { anim, frame })));
    }
  }
}
