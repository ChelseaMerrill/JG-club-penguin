import type { RoomId, Tile } from './rooms';

/** A 6-digit hex color, e.g. `#00BDFF`. */
export type HexColor = `#${string}`;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Matches a 6-digit hex color such as `#00BDFF` or the design's lowercase
 * `#3a4046`. Case is accepted but never normalised here: #31 must hash a
 * lowercased look before comparing, and #27's check constraints must stay
 * case-insensitive.
 */
export function isHexColor(value: string): value is HexColor {
  return HEX_COLOR_PATTERN.test(value);
}

// Verbatim from design/Penguin Creator.dc.html (the `JG`, cap/beak/feet `sw`
// arrays), including the lowercase `#3a4046` swatch as authored.
export const BODY_COLORS: readonly HexColor[] = [
  '#161719',
  '#0C4B5F',
  '#00BDFF',
  '#F4F4F4',
  '#BFE3F0',
  '#3a4046',
];
export const CAP_COLORS: readonly HexColor[] = [
  '#00BDFF',
  '#F4F4F4',
  '#0C4B5F',
  '#F2C12E',
  '#D63C3C',
];
export const BEAK_COLORS: readonly HexColor[] = ['#00BDFF', '#F2C12E', '#E07A2F', '#F4F4F4'];
export const FEET_COLORS: readonly HexColor[] = ['#00BDFF', '#F2C12E', '#E07A2F', '#0C4B5F'];

export const HATS = ['JG CAP', 'SNORKEL', 'HEADPHONES', 'WAR WEEK BAND', 'NONE'] as const;
export type Hat = (typeof HATS)[number];

export const PATTERNS = ['PLAIN', 'HEX', 'STRIPES', 'JG LOGO', 'PIXEL HEART', 'SNOWFLAKE'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const EYES = ['ROUND', 'SLEEPY', 'STAR', 'WINK'] as const;
export type Eyes = (typeof EYES)[number];

// The design's own `emotes` list also has SNOWBALL (a stretch throw) and
// FACEPALM (a stretch reaction); the idle set here keeps only the five
// loopable idle animations.
export const IDLE_EMOTES = ['WADDLE', 'WAVE', 'DANCE', 'LAUGH', 'SIT'] as const;
export type IdleEmote = (typeof IDLE_EMOTES)[number];

export const PENGUIN_NAME_MAX = 16;
export const UNNAMED_PENGUIN = 'Unnamed Penguin';

/**
 * Producer: #35 Creator (saved via #34). Consumers: #31 renderer, #28
 * Presence payload, #32 HUD.
 *
 * `name` is trimmed, 1-16 characters once saved; it is `''` only before the
 * Creator has been completed, and is never seeded from the Google display
 * name. Display it as `name || UNNAMED_PENGUIN`. The Igloo Starter Kit is
 * not part of the look.
 */
export interface PenguinLook {
  name: string;
  body: HexColor;
  cap: HexColor;
  beak: HexColor;
  feet: HexColor;
  belly: HexColor;
  hat: Hat;
  pattern: Pattern;
  eyes: Eyes;
  emote: IdleEmote;
}

export const DEFAULT_LOOK: PenguinLook = {
  name: '',
  body: '#161719',
  cap: '#00BDFF',
  beak: '#00BDFF',
  feet: '#00BDFF',
  belly: '#F4F4F4',
  hat: 'JG CAP',
  pattern: 'PLAIN',
  eyes: 'ROUND',
  emote: 'WADDLE',
};

/**
 * Sprite mirroring direction. The design mirrors the Penguin figure with
 * `scaleX(-1)`; there is no 4-way sprite.
 */
export type Facing = 'left' | 'right';

/** Producer: #14. Consumers: #28/#43, #31. Tile coordinates, never pixels. */
export interface PenguinState {
  playerId: string;
  roomId: RoomId;
  tile: Tile;
  target?: Tile;
  facing: Facing;
}
