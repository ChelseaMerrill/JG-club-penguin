import type { EmoteId } from '../contracts';
import type { PenguinAnim } from '../game/penguin';

/**
 * Which `PenguinAnim` each HUD Emote plays (#47). `wave`/`dance`/`laugh`/`sit`
 * reuse the existing idle anims verbatim (#31); `thumbs-up`/`brb`/`jg-flash`/
 * `ship-it` are the four Emote-only poses `src/game/penguin/poses.ts` adds
 * for this ticket. A `Record<EmoteId, PenguinAnim>` (not a `switch`), so
 * adding an `EmoteId` fails to compile here until it has a mapped anim.
 */
export const EMOTE_TO_ANIM: Record<EmoteId, PenguinAnim> = {
  wave: 'WAVE',
  dance: 'DANCE',
  laugh: 'LAUGH',
  sit: 'SIT',
  'thumbs-up': 'THUMBS_UP',
  brb: 'BRB',
  'jg-flash': 'JG_FLASH',
  'ship-it': 'SHIP_IT',
};
