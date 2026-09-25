import type { NpcDefinition } from '../../npcs/npcs';
import { renderPenguinSvg } from '../penguin/render-svg';
import { renderNpcSvg } from './render-npc-svg';

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs, written
 * against a minimal structural interface the same way #31's own
 * `texture.ts` is, so a unit test could pass a plain fake without booting
 * Phaser (mirrors `../penguin/texture.ts`'s `PenguinTextureManager`).
 */
export interface NpcTextureManager {
  exists(key: string): boolean;
  addBase64(key: string, data: string): void;
}

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

// `btoa` is a global in both browsers and Node >=22 (this repo's minimum
// engine), matching `../penguin/texture.ts`'s own helper.
function svgToBase64(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Registers `npc`'s one texture on `scene` if it isn't already there: a
 * Human NPC's figure via `renderNpcSvg`, or a Penguin-kind NPC's fixed look
 * via #31's own `renderPenguinSvg` (#36 D2). Returns the texture key either
 * way. `addBase64` decodes asynchronously, the same as #31's texture
 * registration; a caller that needs the decoded texture right away should
 * listen for `Textures.Events.ADD_KEY` the way `npc-sprite.ts` does.
 */
export function ensureNpcTexture(scene: NpcTextureScene, npc: NpcDefinition): string {
  const key = npcTextureKey(npc);
  if (!scene.textures.exists(key)) {
    const svg =
      npc.kind === 'human'
        ? renderNpcSvg(npc.figure, { idPrefix: npc.id })
        : renderPenguinSvg(npc.look, { anim: npc.look.emote, frame: 0 }, { idPrefix: npc.id });
    scene.textures.addBase64(key, svgToBase64(svg));
  }
  return key;
}
