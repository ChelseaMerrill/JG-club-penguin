import type { PenguinLook } from '../../contracts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a over a string, returned as an 8-character lowercase hex digest. */
function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hashes everything about a look that changes its *rendered textures*, but
 * never `name` or `emote` (#31 review fix 3): every anim is registered per
 * look regardless of which one is current (`ensurePenguinTextures` loops
 * over every `PENGUIN_ANIMS` value), so two looks that differ only in
 * `emote` already share the identical set of textures, and hashing `emote`
 * in would only fragment that sharing pointlessly. A renamed Penguin, for
 * the same reason `name` is excluded, keeps sharing its textures with every
 * other Penguin that looks the same. Colours are lowercased first, since
 * `#3a4046` and `#3A4046` render identically.
 */
export function penguinLookHash(look: PenguinLook): string {
  const normalized = {
    body: look.body.toLowerCase(),
    cap: look.cap.toLowerCase(),
    beak: look.beak.toLowerCase(),
    feet: look.feet.toLowerCase(),
    belly: look.belly.toLowerCase(),
    hat: look.hat,
    pattern: look.pattern,
    eyes: look.eyes,
  };
  return fnv1a(JSON.stringify(normalized));
}
