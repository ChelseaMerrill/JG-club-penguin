import type { RoomId, Tile } from './rooms';

/**
 * A 6-digit hex color, e.g. `#00BDFF`. Backs every `PenguinLook` colour
 * field. Producers: #35 Creator, #27 stored defaults. Consumers: #31
 * renderer, #28 Room channel payload.
 */
export type HexColor = `#${string}`;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Matches a 6-digit hex color such as `#00BDFF` or the design's lowercase
 * `#3a4046`. Case is accepted but never normalized here: #31 must hash a
 * lowercased look before comparing, and #27's check constraints must stay
 * case-insensitive.
 */
export function isHexColor(value: string): value is HexColor {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * Verbatim from design/Penguin Creator.dc.html (the `JG`, cap/beak/feet `sw`
 * arrays), including the lowercase `#3a4046` swatch as authored.
 */
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

/**
 * The five idle animations. The design's list also has SNOWBALL and
 * FACEPALM, which are excluded by #26.
 */
export const IDLE_EMOTES = ['WADDLE', 'WAVE', 'DANCE', 'LAUGH', 'SIT'] as const;
export type IdleEmote = (typeof IDLE_EMOTES)[number];

export const PENGUIN_NAME_MAX = 16;
/** Creator placeholder only; never shown in the World (#75). */
export const UNNAMED_PENGUIN = 'Unnamed Penguin';

/**
 * Control, bidi, zero-width and other invisible/default-ignorable
 * characters stripped from a name before it is validated or shown: C0
 * controls, DEL/C1 controls, the explicit zero-width/bidi/BOM ranges below,
 * every Unicode `Default_Ignorable_Code_Point` and format (`Cf`) character
 * (variation selectors, joiners, language tags, and more), plus a few
 * invisible-by-rendering code points neither property reliably covers: the
 * Hangul filler characters (U+115F, U+1160, U+3164, U+FFA0) and the blank
 * Braille pattern (U+2800). Shared by `src/penguin/look.ts`
 * (`normalizeName`, `validatePenguinName`) and `src/realtime/room-channel.ts`
 * (`sanitizeName`), so a name made only of invisible characters can never
 * validate as non-empty (#75 red-team R2-1; widened in review round 1).
 */
export const UNSAFE_NAME_CHARS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u115F\u1160\u3164\uFFA0\u2800\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;

/**
 * Producer: #35 Creator (saved via #34). Consumers: #31 renderer, #28
 * Presence payload, #32 HUD.
 *
 * `name` is trimmed, 1-16 characters once saved; it is `''` only before the
 * Creator has been completed. It is never seeded from the Google display
 * name, and `UNNAMED_PENGUIN` is a Creator placeholder only: never shown in
 * the World (#75). A nameless Penguin is not drawn there at all.
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

/**
 * Consumers: #35 Creator, #34 first sign-in, #31.
 */
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
 *
 * Producer: #14. Consumers: #28, #31 (mirrors the sprite).
 */
export type Facing = 'left' | 'right';

/** Producer: #14. Consumers: #28, #31 (mirrors the sprite). */
export const DEFAULT_FACING: Facing = 'right';

/**
 * Producer: #14. Consumers: #28/#43, #31. Isometric tile coordinates, never
 * pixels.
 */
export interface PenguinState {
  playerId: string;
  roomId: RoomId;
  tile: Tile;
  target?: Tile;
  facing: Facing;
}
