/**
 * Speech-bubble pill sizing constants shared between `npc-sprite.ts` (which
 * draws the pill and its tail) and `npcs.test.ts` (which uses
 * `MAX_BUBBLE_WIDTH` to confirm no two Dev Pit NPCs' bubble rects can ever
 * intersect, and that each bubble's rect still spans its own NPC's tile x,
 * #36 round-2 review item 4). Split out of `npc-sprite.ts` so a plain data
 * test doesn't have to import Phaser (`npc-sprite.ts`'s own top-level
 * import) just to read a pixel constant.
 */

/** #36 round-1 review item 3d (down from 200). */
export const SPEECH_BUBBLE_MAX_TEXT_WIDTH = 180;
export const SPEECH_BUBBLE_PADDING_X = 10;

/**
 * The widest a speech bubble pill can ever render
 * (`SPEECH_BUBBLE_MAX_TEXT_WIDTH` plus the pill's own left/right padding):
 * the worst-case width `npcs.test.ts`'s geometric bubble-rect check uses.
 */
export const MAX_BUBBLE_WIDTH = SPEECH_BUBBLE_MAX_TEXT_WIDTH + SPEECH_BUBBLE_PADDING_X * 2;
