import { IDLE_EMOTES, type PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { type PenguinAnim, PENGUIN_FRAMES } from './poses';
import { renderPenguinSvg } from './render-svg';

const PENGUIN_ANIMS: readonly PenguinAnim[] = [...IDLE_EMOTES, 'WALK'];

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs. Written
 * against this minimal structural interface (rather than importing Phaser's
 * type) so its unit test can pass a plain fake without booting Phaser.
 */
export interface PenguinTextureManager {
  exists(key: string): boolean;
  addBase64(key: string, data: string): void;
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
// state.
const pendingByManager = new WeakMap<PenguinTextureManager, Set<string>>();

/**
 * Registers every anim/frame texture for `look` on `scene`, keyed by a hash
 * of the look excluding `name` (#31 D6), so two Penguins with the same look
 * (whatever their names) share one set of textures. Skips any key that
 * already exists or is still pending from an earlier call.
 */
export function ensurePenguinTextures(scene: PenguinTextureScene, look: PenguinLook): void {
  const hash = penguinLookHash(look);

  let pending = pendingByManager.get(scene.textures);
  if (!pending) {
    pending = new Set();
    pendingByManager.set(scene.textures, pending);
  }

  for (const anim of PENGUIN_ANIMS) {
    const frameCount = PENGUIN_FRAMES[anim];
    for (let frame = 0; frame < frameCount; frame++) {
      const key = penguinTextureKey(hash, anim, frame);
      if (scene.textures.exists(key) || pending.has(key)) continue;
      pending.add(key);
      scene.textures.addBase64(key, svgToBase64(renderPenguinSvg(look, { anim, frame })));
    }
  }
}
