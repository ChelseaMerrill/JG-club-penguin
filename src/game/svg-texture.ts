/**
 * Shared SVG-as-Phaser-texture plumbing, factored out of #31's own
 * `penguin/texture.ts` so #36's NPC textures reuse the exact same
 * base64-encoding and pending-decode dedup logic instead of a second copy
 * (#36 round-1 review item 8).
 */

/**
 * The slice of Phaser's `Textures.TextureManager` this module needs, written
 * against a minimal structural interface (rather than importing Phaser's
 * type) so a caller's unit test can pass a plain fake without booting Phaser.
 */
export interface SvgTextureManager {
  exists(key: string): boolean;
  addBase64(key: string, data: string): void;
  once(event: string, callback: (key?: string) => void): void;
  on(event: string, callback: (key?: string) => void): void;
  off(event: string, callback: (key?: string) => void): void;
}

/**
 * Mirrors Phaser's `Textures.Events.ADD_KEY` / `.ERROR` string values
 * without importing `phaser` into this module (it intentionally has no
 * Phaser import, so its unit tests can pass a plain fake without booting
 * Phaser under jsdom).
 */
const ADD_KEY_EVENT_PREFIX = 'addtexture-';
const ERROR_EVENT = 'onerror';

// `btoa` is a global in both browsers and Node >=22 (this repo's minimum engine).
export function svgToBase64(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Tracks keys already requested from a given texture manager but not yet
// reported by `exists` (Phaser's `addBase64` decodes the image
// asynchronously), so a second call made before that decode finishes never
// re-requests the same key. Keyed by the manager instance itself so
// independent fakes in tests (and independent scenes at runtime) never share
// state. A key is removed once the manager reports either the texture was
// added (`ADD_KEY`, from then on `exists` covers it) or that its decode
// failed (`ERROR`), so a failed decode can be retried by a later call.
const pendingByManager = new WeakMap<SvgTextureManager, Set<string>>();

/**
 * Registers `key`'s texture on `manager`, built by `buildSvg()`, unless it
 * already exists or is still pending decode from an earlier call. Shared by
 * #31's Penguin (`penguin/texture.ts`) and #36's NPC (`npcs/texture.ts`)
 * texture registration.
 */
export function ensureSvgTexture(
  manager: SvgTextureManager,
  key: string,
  buildSvg: () => string,
): void {
  let pending = pendingByManager.get(manager);
  if (!pending) {
    pending = new Set();
    pendingByManager.set(manager, pending);
  }
  const activePending = pending;

  if (manager.exists(key) || activePending.has(key)) return;
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

  manager.addBase64(key, svgToBase64(buildSvg()));
}
