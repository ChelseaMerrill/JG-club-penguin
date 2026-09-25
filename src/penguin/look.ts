import {
  BEAK_COLORS,
  BODY_COLORS,
  CAP_COLORS,
  EYES,
  FEET_COLORS,
  HATS,
  PATTERNS,
  PENGUIN_NAME_MAX,
  UNSAFE_NAME_CHARS_RE,
  isHexColor,
  type HexColor,
  type PenguinLook,
} from '../contracts';

/** The look fields the Creator offers a colour picker for. Belly is fixed. */
export type ColorPart = 'body' | 'cap' | 'beak' | 'feet';

/** Preset swatches per colour part, from the contract (#26). */
export const SWATCHES: Record<ColorPart, readonly HexColor[]> = {
  body: BODY_COLORS,
  cap: CAP_COLORS,
  beak: BEAK_COLORS,
  feet: FEET_COLORS,
};

/** Drops control, bidi and zero-width characters, then collapses whitespace and trims (#75). */
function cleanName(raw: string): string {
  return raw.replace(UNSAFE_NAME_CHARS_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Trims, collapses whitespace, drops unsafe characters and caps the name at
 * `PENGUIN_NAME_MAX` code points, the same way `ProgressStore.saveLook`
 * counts them. Used for live previews (the Creator's nameplate); saving and
 * WADDLE IN go through `validatePenguinName`, which never truncates.
 */
export function normalizeName(raw: string): string {
  const cleaned = cleanName(raw);
  return Array.from(cleaned).slice(0, PENGUIN_NAME_MAX).join('').trim();
}

export type PenguinNameValidation =
  { ok: true; name: string } | { ok: false; reason: 'empty' | 'too-long' };

/**
 * Cleans `raw` the same way `normalizeName` does (unsafe characters stripped,
 * whitespace collapsed, trimmed) but never truncates: it counts the cleaned
 * name's code points against `PENGUIN_NAME_MAX` and rejects instead of
 * cutting it short, matching `players_penguin_name_check` (#75). A name made
 * only of unsafe characters (e.g. a zero-width space) cleans to `''` and is
 * `empty`, not a false positive.
 */
export function validatePenguinName(raw: string): PenguinNameValidation {
  const cleaned = cleanName(raw);
  const length = Array.from(cleaned).length;
  if (length === 0) return { ok: false, reason: 'empty' };
  if (length > PENGUIN_NAME_MAX) return { ok: false, reason: 'too-long' };
  return { ok: true, name: cleaned };
}

/** True when `look.name` validates as a real Penguin name (#75). */
export function isNamedLook(look: Pick<PenguinLook, 'name'>): boolean {
  return validatePenguinName(look.name).ok;
}

/** Returns `value` as a colour if it is a 6-digit hex string, else null. */
export function toHexColor(value: string): HexColor | null {
  return isHexColor(value) ? value : null;
}

/** Case-insensitive, since the contract's swatches mix cases. */
export function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

type Rng = () => number;

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)];
}

function randomColor(rng: Rng): HexColor {
  return `#${Math.floor(rng() * 0x1000000)
    .toString(16)
    .padStart(6, '0')}`;
}

/**
 * The Creator's SHUFFLE: keeps the name, belly and Idle animation, re-rolls
 * everything else. Mirrors the design: the body is usually a JG palette
 * colour, the hat colour is anything.
 */
export function shuffleLook(current: PenguinLook, rng: Rng = Math.random): PenguinLook {
  const warm: readonly HexColor[] = ['#00BDFF', '#F2C12E', '#E07A2F'];
  return {
    ...current,
    body: rng() < 0.6 ? pick(BODY_COLORS, rng) : randomColor(rng),
    cap: randomColor(rng),
    beak: pick(warm, rng),
    feet: pick(warm, rng),
    hat: pick(HATS, rng),
    pattern: pick(PATTERNS, rng),
    eyes: pick(EYES, rng),
  };
}
