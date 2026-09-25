import type { NpcDefinition } from '../../npcs/npcs';
import { ensureSvgTexture, type SvgTextureManager } from '../svg-texture';
import { renderNpcSvg } from './render-npc-svg';
import { renderPenguinNpcSvg } from './render-penguin-npc-svg';

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs. An
 * alias of the shared `SvgTextureManager` (`../svg-texture.ts`, #36 round-1
 * review item 8), kept under this name since existing callers import it as
 * `NpcTextureManager`.
 */
export type NpcTextureManager = SvgTextureManager;

export interface NpcTextureScene {
  textures: NpcTextureManager;
}

/**
 * One static texture key per NPC id (#36 D2: NPCs stand still, so unlike
 * #31's animated, per-look-hash Penguin textures, there is exactly one frame
 * to register per `NpcDefinition`, keyed by its own `id` rather than a hash
 * of its figure/look).
 */
export function npcTextureKey(npc: NpcDefinition): string {
  return `npc:${npc.id}`;
}

/**
 * Registers `npc`'s one texture on `scene` if it isn't already there (or
 * still pending decode from an earlier call, via the shared `ensureSvgTexture`,
 * #36 round-1 review item 8): a Human NPC's figure via `renderNpcSvg`, or a
 * Penguin-kind NPC via `renderPenguinNpcSvg`, the Room designs' own Penguin
 * NPC figure (#113; Player Penguins keep #31's `renderPenguinSvg`, which this
 * module no longer touches). Returns the texture key either way. `addBase64` decodes asynchronously; a
 * caller that needs the decoded texture right away should listen for
 * `Textures.Events.ADD_KEY` the way `npc-sprite.ts` does.
 */
export function ensureNpcTexture(scene: NpcTextureScene, npc: NpcDefinition): string {
  const key = npcTextureKey(npc);
  ensureSvgTexture(scene.textures, key, () =>
    npc.kind === 'human'
      ? renderNpcSvg(npc.figure, { idPrefix: npc.id })
      : renderPenguinNpcSvg(npc.look),
  );
  return key;
}
