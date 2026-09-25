import type { PenguinLook } from '../../contracts';
import { ensureSvgTexture, type SvgTextureManager } from '../svg-texture';
import { penguinLookHash } from './look-hash';
import { PENGUIN_ANIMS, PENGUIN_FRAMES, type PenguinAnim } from './poses';
import { renderPenguinSvg } from './render-svg';

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs. An
 * alias of the shared `SvgTextureManager` (`../svg-texture.ts`, #36 round-1
 * review item 8), kept under this name since existing callers/tests import
 * it as `PenguinTextureManager`.
 */
export type PenguinTextureManager = SvgTextureManager;

/** The slice of a Phaser `Scene` this module needs. */
export interface PenguinTextureScene {
  textures: PenguinTextureManager;
}

/** The texture key for one frame of a look's hash (#31 D6). */
export function penguinTextureKey(hash: string, anim: PenguinAnim, frame: number): string {
  return `penguin:${hash}:${anim}:${frame}`;
}

/**
 * Registers every anim/frame texture for `look` on `scene`, keyed by a hash
 * of the look excluding `name` and `emote` (#31 D6/review fix 3), so two
 * Penguins with the same look (whatever their names, or whichever idle
 * animation is currently playing) share one set of textures. Skips any key
 * that already exists or is still pending from an earlier call
 * (`ensureSvgTexture`, shared with #36's NPC textures).
 */
export function ensurePenguinTextures(scene: PenguinTextureScene, look: PenguinLook): void {
  const hash = penguinLookHash(look);
  const manager = scene.textures;

  for (const anim of PENGUIN_ANIMS) {
    const frameCount = PENGUIN_FRAMES[anim];
    for (let frame = 0; frame < frameCount; frame++) {
      const key = penguinTextureKey(hash, anim, frame);
      ensureSvgTexture(manager, key, () => renderPenguinSvg(look, { anim, frame }));
    }
  }
}
