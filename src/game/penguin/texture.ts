import type { Facing, PenguinLook } from '../../contracts';
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

/**
 * The texture key for one frame of a look's hash (#31 D6). `facing` (#147)
 * defaults to `'right'` and is omitted from the key entirely in that case,
 * so every key predating this fix -- and everything that reads one back,
 * e.g. the golden fixtures below -- stays byte-identical; only a `'left'`
 * key (whose texture bakes counter-mirrored lettering, see
 * `render-svg.ts`'s `renderLettering`) gets a distinguishing suffix.
 */
export function penguinTextureKey(
  hash: string,
  anim: PenguinAnim,
  frame: number,
  facing: Facing = 'right',
): string {
  return facing === 'left'
    ? `penguin:${hash}:${anim}:${frame}:left`
    : `penguin:${hash}:${anim}:${frame}`;
}

/**
 * Registers every anim/frame texture for `look` at `facing` (#147, default
 * `'right'`) on `scene`, keyed by a hash of the look excluding `name` and
 * `emote` (#31 D6/review fix 3), so two Penguins with the same look
 * (whatever their names, or whichever idle animation is currently playing)
 * share one set of textures -- and the same look shown at both facings
 * shares nothing, since a left-facing frame's lettering is baked
 * differently (counter-mirrored) from its right-facing counterpart. Skips
 * any key that already exists or is still pending from an earlier call
 * (`ensureSvgTexture`, shared with #36's NPC textures).
 */
export function ensurePenguinTextures(
  scene: PenguinTextureScene,
  look: PenguinLook,
  facing: Facing = 'right',
): void {
  const hash = penguinLookHash(look);
  const manager = scene.textures;

  for (const anim of PENGUIN_ANIMS) {
    const frameCount = PENGUIN_FRAMES[anim];
    for (let frame = 0; frame < frameCount; frame++) {
      const key = penguinTextureKey(hash, anim, frame, facing);
      ensureSvgTexture(manager, key, () => renderPenguinSvg(look, { anim, frame }, {}, facing));
    }
  }
}
