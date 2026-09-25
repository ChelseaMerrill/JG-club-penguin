/**
 * Speech-bubble pill sizing shared between `npc-sprite.ts` (which draws the
 * pill and its tail) and `npcs.test.ts` (whose time-aware overlap check
 * estimates each line's pill from `estimateBubbleSize`). Split out of
 * `npc-sprite.ts` so a plain data test doesn't have to import Phaser
 * (`npc-sprite.ts`'s own top-level import) just to read a pixel constant.
 */

/**
 * The widest a line's text runs before it wraps (#113, up from #36's 180):
 * the Room designs draw every line on one line, in pills up to about 270 px
 * wide (e.g. Town Center's "LET'S GO! Who's shipping today?!" at 267.2).
 */
export const SPEECH_BUBBLE_MAX_TEXT_WIDTH = 250;
/** The designs' pill padding: a pill is its text's width plus 12 px each side. */
export const SPEECH_BUBBLE_PADDING_X = 12;
/** 7 px above and below a 13 px line makes the designs' 30 px tall pill. */
export const SPEECH_BUBBLE_PADDING_Y = 7;

/** The widest a speech bubble pill can ever render. */
export const MAX_BUBBLE_WIDTH = SPEECH_BUBBLE_MAX_TEXT_WIDTH + SPEECH_BUBBLE_PADDING_X * 2;

/** The designs' pill height for one line of text. */
const ONE_LINE_BUBBLE_HEIGHT = 30;
/** Each wrapped line past the first adds about one 13 px line of text. */
const EXTRA_LINE_HEIGHT = 16;
/**
 * The Room designs size a pill as 7.6 px per character plus its padding
 * (every baked pill matches this: "Look what we won!" is 17 * 7.6 + 24 =
 * 153.2 px), a close stand-in for the rendered Libre Franklin 700 13 px text.
 */
const ESTIMATED_CHAR_WIDTH = 7.6;

/** A line's estimated pill size, for layout checks that can't measure real text. */
export function estimateBubbleSize(text: string): { width: number; height: number } {
  const textWidth = text.length * ESTIMATED_CHAR_WIDTH;
  const lines = Math.max(1, Math.ceil(textWidth / SPEECH_BUBBLE_MAX_TEXT_WIDTH));
  return {
    width: Math.min(textWidth, SPEECH_BUBBLE_MAX_TEXT_WIDTH) + SPEECH_BUBBLE_PADDING_X * 2,
    height: ONE_LINE_BUBBLE_HEIGHT + (lines - 1) * EXTRA_LINE_HEIGHT,
  };
}
