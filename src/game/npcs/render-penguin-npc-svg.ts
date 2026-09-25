import type { PenguinLook } from '../../contracts';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';

/** The shared teal stroke every Room design's Penguin figure uses. */
const OUTLINE = '#0C4B5F';

/**
 * Renders a Penguin-kind NPC (#113) as the Room designs draw every Penguin
 * NPC, ported verbatim from their shared figure markup (e.g. Front Desk in
 * `design/Room 01 Town Center.dc.html`): a `#0C4B5F`-stroked body, fixed
 * belly, eyes, `#00BDFF` beak and feet, flippers in the body colour and a
 * small brow cap. Unlike `renderPenguinSvg` (#31, Player Penguins), there's
 * no JG CAP and no contrast outline, and only `look.body` and `look.cap` are
 * read. Uses the same padded, feet-anchored frame as `renderPenguinSvg`, so
 * `npc-sprite.ts` positions both the same way.
 */
export function renderPenguinNpcSvg(look: Pick<PenguinLook, 'body' | 'cap'>): string {
  const { body, cap } = look;
  const figure =
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="6"></path>` +
    `<path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="#F4F4F4"></path>` +
    `<circle cx="50" cy="34" r="4.5" fill="#F4F4F4"></circle>` +
    `<circle cx="70" cy="34" r="4.5" fill="#F4F4F4"></circle>` +
    `<circle cx="51" cy="34" r="2" fill="#161719"></circle>` +
    `<circle cx="71" cy="34" r="2" fill="#161719"></circle>` +
    `<path d="M50 44 L70 44 L60 54 Z" fill="#00BDFF"></path>` +
    `<path d="M40 116 L26 124 L52 122 Z" fill="#00BDFF"></path>` +
    `<path d="M80 116 L94 124 L68 122 Z" fill="#00BDFF"></path>` +
    `<path d="M24 60 C10 78 12 96 26 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"></path>` +
    `<path d="M96 60 C110 78 108 96 94 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"></path>` +
    `<path d="M34 22 C40 8 80 8 86 22 L60 18 Z" fill="${cap}"></path>`;

  const minX = -PENGUIN_FRAME_PADDING_X;
  const minY = -PENGUIN_FRAME_PADDING_Y;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH}" height="${PENGUIN_FRAME_HEIGHT}">${figure}</svg>`;
}
