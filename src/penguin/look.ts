import {
  BEAK_COLORS,
  BODY_COLORS,
  CAP_COLORS,
  EYES,
  FEET_COLORS,
  HATS,
  PATTERNS,
  PENGUIN_NAME_MAX,
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

/**
 * Trims, collapses whitespace, drops control characters and caps the name at
 * `PENGUIN_NAME_MAX` code points, the same way `ProgressStore.saveLook`
 * counts them.
 */
export function normalizeName(raw: string): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, PENGUIN_NAME_MAX).join('').trim();
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
