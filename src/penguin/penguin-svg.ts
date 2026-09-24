import { BELLY_COLOR, type Emote, type PenguinAppearance } from './appearance';

const OUTLINE = '#0c4b5f';
const CYAN = '#00bdff';

export interface PenguinSvgOptions {
  /** Changes the pose where the design does (LAUGH closes the eyes, etc.). */
  emote?: Emote;
  /** Makes the belly clip-path id unique when several Penguins share a page. */
  idPrefix?: string;
  width?: number;
  height?: number;
}

const PATTERN_ART: Record<string, (body: string) => string> = {
  PLAIN: () => '',
  HEX: (body) =>
    `<g fill="none" stroke="${body}" stroke-width="1.5" opacity=".55"><polygon points="50,58 56,61 56,68 50,71 44,68 44,61"/><polygon points="70,58 76,61 76,68 70,71 64,68 64,61"/><polygon points="60,74 66,77 66,84 60,87 54,84 54,77"/><polygon points="50,90 56,93 56,100 50,103 44,100 44,93"/><polygon points="70,90 76,93 76,100 70,103 64,100 64,93"/></g>`,
  STRIPES: (body) =>
    `<g fill="${body}" opacity=".55"><rect x="30" y="56" width="60" height="5"/><rect x="30" y="68" width="60" height="5"/><rect x="30" y="80" width="60" height="5"/><rect x="30" y="92" width="60" height="5"/><rect x="30" y="104" width="60" height="5"/></g>`,
  'JG LOGO': () =>
    `<g><polygon points="60,64 74,72 74,88 60,96 46,88 46,72" fill="${OUTLINE}"/><text x="60" y="85" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="13" fill="${CYAN}">JG</text></g>`,
  'PIXEL HEART': () =>
    `<g fill="${CYAN}"><rect x="50" y="68" width="6" height="6"/><rect x="64" y="68" width="6" height="6"/><rect x="44" y="74" width="32" height="6"/><rect x="47" y="80" width="26" height="6"/><rect x="51" y="86" width="18" height="6"/><rect x="57" y="92" width="6" height="6"/></g>`,
  SNOWFLAKE: () =>
    `<g stroke="${CYAN}" stroke-width="2.5" stroke-linecap="round"><line x1="60" y1="62" x2="60" y2="98"/><line x1="44" y1="71" x2="76" y2="89"/><line x1="76" y1="71" x2="44" y2="89"/><path d="M56 68 L60 62 L64 68 M56 92 L60 98 L64 92" fill="none"/></g>`,
};

const EYE_ART: Record<string, string> = {
  ROUND: `<g><circle cx="50" cy="34" r="4.5" fill="#f4f4f4"/><circle cx="70" cy="34" r="4.5" fill="#f4f4f4"/><circle cx="51" cy="34" r="2" fill="#161719"/><circle cx="71" cy="34" r="2" fill="#161719"/></g>`,
  SLEEPY: `<g fill="none" stroke="#f4f4f4" stroke-width="3" stroke-linecap="round"><path d="M45 35 Q50 30 55 35"/><path d="M65 35 Q70 30 75 35"/></g>`,
  STAR: `<g fill="${CYAN}"><polygon points="50,28 51.8,32.5 56.5,32.8 52.9,35.8 54,40.5 50,38 46,40.5 47.1,35.8 43.5,32.8 48.2,32.5"/><polygon points="70,28 71.8,32.5 76.5,32.8 72.9,35.8 74,40.5 70,38 66,40.5 67.1,35.8 63.5,32.8 68.2,32.5"/></g>`,
  WINK: `<g><circle cx="50" cy="34" r="4.5" fill="#f4f4f4"/><circle cx="51" cy="34" r="2" fill="#161719"/><path d="M65 34 L75 34" stroke="#f4f4f4" stroke-width="3" stroke-linecap="round"/></g>`,
};

const HAT_ART: Record<string, (cap: string) => string> = {
  NONE: () => '',
  'JG CAP': (cap) =>
    `<g><path d="M32 22 C38 4 82 4 88 22 L60 18 Z" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/><path d="M30 22 L98 26 L96 30 L30 26 Z" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/><polygon points="60,10 65,13 65,18 60,21 55,18 55,13" fill="${OUTLINE}"/></g>`,
  // The snorkel's colors are fixed in the design; it ignores the hat color.
  SNORKEL: () =>
    `<g><rect x="38" y="26" width="44" height="16" rx="6" fill="none" stroke="${CYAN}" stroke-width="4"/><rect x="42" y="29" width="16" height="10" rx="2" fill="#bfe3f0" opacity=".8"/><rect x="62" y="29" width="16" height="10" rx="2" fill="#bfe3f0" opacity=".8"/><path d="M84 30 L92 30 L92 6" fill="none" stroke="${CYAN}" stroke-width="5" stroke-linecap="round"/><path d="M20 22 C30 6 90 6 100 22 L60 14 Z" fill="#f2c12e" stroke="${OUTLINE}" stroke-width="3"/></g>`,
  HEADPHONES: (cap) =>
    `<g><path d="M30 34 C30 10 90 10 90 34" fill="none" stroke="${OUTLINE}" stroke-width="5"/><rect x="24" y="28" width="10" height="16" rx="4" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/><rect x="86" y="28" width="10" height="16" rx="4" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/></g>`,
  'WAR WEEK BAND': (cap) =>
    `<g><path d="M28 26 L92 26 L92 34 L28 34 Z" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/><path d="M88 26 L100 30 L98 60 L90 58 Z" fill="${cap}" stroke="${OUTLINE}" stroke-width="2"/><text x="60" y="32.5" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="7" fill="#161719" letter-spacing="1">WAR WEEK</text></g>`,
};

/**
 * Draws a Penguin as a standalone SVG string (viewBox 0 0 120 130), shape for
 * shape from `design/Penguin Creator.dc.html`. Colors must already be
 * validated `#rrggbb` values (see `parseAppearance`); nothing user-typed, such
 * as the name, is ever interpolated here.
 *
 * Arms carry `penguin-svg__arm--left/right` classes so CSS can animate emotes.
 */
export function renderPenguinSvg(
  appearance: PenguinAppearance,
  options: PenguinSvgOptions = {},
): string {
  const { emote, idPrefix = 'penguin', width = 340, height = 368 } = options;
  const { body, cap, beak, feet } = appearance;
  const clipId = `${idPrefix}-belly`;
  const eyes = emote === 'LAUGH' ? 'SLEEPY' : appearance.eyes;
  const bellyPath =
    'M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" width="${width}" height="${height}" overflow="visible" aria-hidden="true">`,
    `<defs><clipPath id="${clipId}"><path d="${bellyPath}"/></clipPath></defs>`,
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="6"/>`,
    `<path d="${bellyPath}" fill="${BELLY_COLOR}"/>`,
    `<g clip-path="url(#${clipId})">${PATTERN_ART[appearance.pattern](body)}</g>`,
    EYE_ART[eyes],
    `<path d="M50 44 L70 44 L60 54 Z" fill="${beak}"/>`,
    `<path d="M40 116 L26 124 L52 122 Z" fill="${feet}"/><path d="M80 116 L94 124 L68 122 Z" fill="${feet}"/>`,
    `<g class="penguin-svg__arm penguin-svg__arm--left" style="transform-origin:26px 62px"><path d="M24 60 C10 78 12 96 26 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"/></g>`,
    `<g class="penguin-svg__arm penguin-svg__arm--right" style="transform-origin:94px 62px"><path d="M96 60 C110 78 108 96 94 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"/></g>`,
    HAT_ART[appearance.hat](cap),
    emote === 'SNOWBALL'
      ? `<circle class="penguin-svg__snowball" cx="104" cy="80" r="9" fill="#f4f4f4" stroke="#bfe3f0" stroke-width="2"/>`
      : '',
    emote === 'LAUGH'
      ? `<text class="penguin-svg__haha" x="100" y="30" font-family="Bumbastika, Anton, sans-serif" font-size="14" fill="${CYAN}">HA HA</text>`
      : '',
    '</svg>',
  ].join('');
}
