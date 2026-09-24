/**
 * A Penguin's look: its name tag, four colors, and three option picks. This is
 * the shape stored in `public.players.penguin` (see the players_penguin
 * migration) and drawn by `renderPenguinSvg`. Emotes are preview-only and are
 * never part of it.
 */
export interface PenguinAppearance {
  name: string;
  body: string;
  cap: string;
  beak: string;
  feet: string;
  hat: Hat;
  pattern: Pattern;
  eyes: Eyes;
}

export const HATS = ['JG CAP', 'SNORKEL', 'HEADPHONES', 'WAR WEEK BAND', 'NONE'] as const;
export const PATTERNS = ['PLAIN', 'HEX', 'STRIPES', 'JG LOGO', 'PIXEL HEART', 'SNOWFLAKE'] as const;
export const EYES = ['ROUND', 'SLEEPY', 'STAR', 'WINK'] as const;
export const EMOTES = ['WADDLE', 'WAVE', 'DANCE', 'SNOWBALL', 'LAUGH', 'FACEPALM', 'SIT'] as const;

export type Hat = (typeof HATS)[number];
export type Pattern = (typeof PATTERNS)[number];
export type Eyes = (typeof EYES)[number];
export type Emote = (typeof EMOTES)[number];

export type ColorPart = 'body' | 'cap' | 'beak' | 'feet';

/** Preset swatches per color part, from the Penguin Creator design. Lowercase hex. */
export const SWATCHES: Record<ColorPart, readonly string[]> = {
  body: ['#161719', '#0c4b5f', '#00bdff', '#f4f4f4', '#bfe3f0', '#3a4046'],
  cap: ['#00bdff', '#f4f4f4', '#0c4b5f', '#f2c12e', '#d63c3c'],
  beak: ['#00bdff', '#f2c12e', '#e07a2f', '#f4f4f4'],
  feet: ['#00bdff', '#f2c12e', '#e07a2f', '#0c4b5f'],
};

/** Belly color is fixed in the design (no picker). */
export const BELLY_COLOR = '#f4f4f4';

export const MAX_NAME_LENGTH = 20;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export const DEFAULT_APPEARANCE: PenguinAppearance = {
  name: '',
  body: '#161719',
  cap: '#00bdff',
  beak: '#00bdff',
  feet: '#00bdff',
  hat: 'JG CAP',
  pattern: 'PLAIN',
  eyes: 'ROUND',
};

/** Trims, collapses whitespace, drops control characters, caps the length. */
export function normalizeName(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME_LENGTH)
      .trim()
  );
}

/** The creator's starting look for a Player who has never saved a Penguin. */
export function defaultAppearanceFor(displayName: string): PenguinAppearance {
  return { ...DEFAULT_APPEARANCE, name: normalizeName(displayName) };
}

/** Lowercases a `#rrggbb` color, or returns null if it isn't one. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return HEX_COLOR.test(lower) ? lower : null;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * Validates a stored `penguin` value. Returns null for anything that isn't a
 * complete, valid appearance (including a Player who never saved one), so
 * callers treat it the same as "no Penguin yet".
 */
export function parseAppearance(value: unknown): PenguinAppearance | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  const name = typeof v.name === 'string' ? normalizeName(v.name) : '';
  const body = normalizeColor(v.body);
  const cap = normalizeColor(v.cap);
  const beak = normalizeColor(v.beak);
  const feet = normalizeColor(v.feet);
  if (!name || !body || !cap || !beak || !feet) return null;
  if (!isOneOf(HATS, v.hat) || !isOneOf(PATTERNS, v.pattern) || !isOneOf(EYES, v.eyes)) {
    return null;
  }

  return { name, body, cap, beak, feet, hat: v.hat, pattern: v.pattern, eyes: v.eyes };
}

type Rng = () => number;

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)];
}

function randomColor(rng: Rng): string {
  return (
    '#' +
    Math.floor(rng() * 0x1000000)
      .toString(16)
      .padStart(6, '0')
  );
}

/**
 * The creator's SHUFFLE: keeps the name, re-rolls everything else. Mirrors the
 * design: the body is usually a JG palette color, the hat color is anything.
 */
export function shuffleAppearance(
  current: PenguinAppearance,
  rng: Rng = Math.random,
): PenguinAppearance {
  const warm = ['#00bdff', '#f2c12e', '#e07a2f'];
  return {
    name: current.name,
    body: rng() < 0.6 ? pick(SWATCHES.body, rng) : randomColor(rng),
    cap: randomColor(rng),
    beak: pick(warm, rng),
    feet: pick(warm, rng),
    hat: pick(HATS, rng),
    pattern: pick(PATTERNS, rng),
    eyes: pick(EYES, rng),
  };
}
