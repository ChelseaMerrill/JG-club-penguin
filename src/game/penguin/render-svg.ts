import type { Eyes, Hat, Pattern, PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { type PenguinPose, resolvePenguinFramePose } from './poses';

/**
 * The design's own figure box (`design/Penguin Creator.dc.html`'s
 * `viewBox="0 0 120 130"`, also `design/Characters.dc.html`'s 120×130 sprite
 * box).
 */
export const PENGUIN_VIEWBOX_WIDTH = 120;
export const PENGUIN_VIEWBOX_HEIGHT = 130;

/**
 * Extra room on every side of the design box, so a raised arm, the "HA HA"
 * text (which starts at x=100) or the SIT seat (which extends past both
 * sides) never clips against the rendered frame's edge (#31 D4).
 */
export const PENGUIN_FRAME_PADDING = 30;

export const PENGUIN_FRAME_WIDTH = PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING * 2;
export const PENGUIN_FRAME_HEIGHT = PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING * 2;

/**
 * The feet-centre anchor, in the design's own 120×130 coordinate space (the
 * same space `renderPenguinSvg`'s `viewBox` uses, padding aside). A consumer
 * placing a Phaser sprite by its feet computes the sprite's fractional
 * origin as `(PENGUIN_ORIGIN.x + PENGUIN_FRAME_PADDING) / PENGUIN_FRAME_WIDTH`
 * (and the equivalent for y), since the rendered image's pixel (0,0) is the
 * padded box's top-left corner.
 */
export const PENGUIN_ORIGIN = { x: 60, y: 120 };

const STROKE = '#0C4B5F';
const EYE_WHITE = '#F4F4F4';
const EYE_PUPIL = '#161719';
const ACCENT = '#00BDFF';
const SEAT_FILL = '#3a4046';
const SNORKEL_MASK = '#F2C12E';
const SNORKEL_LENS = '#BFE3F0';
const BAND_TEXT = '#161719';

function renderPattern(pattern: Pattern, bodyColor: string): string {
  switch (pattern) {
    case 'HEX':
      return `<g fill="none" stroke="${bodyColor}" stroke-width="1.5" opacity=".55"><polygon points="50,58 56,61 56,68 50,71 44,68 44,61"></polygon><polygon points="70,58 76,61 76,68 70,71 64,68 64,61"></polygon><polygon points="60,74 66,77 66,84 60,87 54,84 54,77"></polygon><polygon points="50,90 56,93 56,100 50,103 44,100 44,93"></polygon><polygon points="70,90 76,93 76,100 70,103 64,100 64,93"></polygon></g>`;
    case 'STRIPES':
      return `<g fill="${bodyColor}" opacity=".55"><rect x="30" y="56" width="60" height="5"></rect><rect x="30" y="68" width="60" height="5"></rect><rect x="30" y="80" width="60" height="5"></rect><rect x="30" y="92" width="60" height="5"></rect><rect x="30" y="104" width="60" height="5"></rect></g>`;
    case 'JG LOGO':
      return `<g><polygon points="60,64 74,72 74,88 60,96 46,88 46,72" fill="${STROKE}"></polygon><text x="60" y="85" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="13" fill="${ACCENT}">JG</text></g>`;
    case 'PIXEL HEART':
      return `<g fill="${ACCENT}"><rect x="50" y="68" width="6" height="6"></rect><rect x="64" y="68" width="6" height="6"></rect><rect x="44" y="74" width="32" height="6"></rect><rect x="47" y="80" width="26" height="6"></rect><rect x="51" y="86" width="18" height="6"></rect><rect x="57" y="92" width="6" height="6"></rect></g>`;
    case 'SNOWFLAKE':
      return `<g stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round"><line x1="60" y1="62" x2="60" y2="98"></line><line x1="44" y1="71" x2="76" y2="89"></line><line x1="76" y1="71" x2="44" y2="89"></line><path d="M56 68 L60 62 L64 68 M56 92 L60 98 L64 92"></path></g>`;
    case 'PLAIN':
    default:
      return '';
  }
}

function renderEyes(eyes: Eyes, forceSleepy: boolean): string {
  const effective: Eyes | 'SLEEPY' = forceSleepy ? 'SLEEPY' : eyes;
  switch (effective) {
    case 'SLEEPY':
      return `<g><path d="M45 35 Q50 30 55 35" fill="none" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path><path d="M65 35 Q70 30 75 35" fill="none" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path></g>`;
    case 'STAR':
      return `<g fill="${ACCENT}"><polygon points="50,28 51.8,32.5 56.5,32.8 52.9,35.8 54,40.5 50,38 46,40.5 47.1,35.8 43.5,32.8 48.2,32.5"></polygon><polygon points="70,28 71.8,32.5 76.5,32.8 72.9,35.8 74,40.5 70,38 66,40.5 67.1,35.8 63.5,32.8 68.2,32.5"></polygon></g>`;
    case 'WINK':
      return `<g><circle cx="50" cy="34" r="4.5" fill="${EYE_WHITE}"></circle><circle cx="51" cy="34" r="2" fill="${EYE_PUPIL}"></circle><path d="M65 34 L75 34" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path></g>`;
    case 'ROUND':
    default:
      return `<g><circle cx="50" cy="34" r="4.5" fill="${EYE_WHITE}"></circle><circle cx="70" cy="34" r="4.5" fill="${EYE_WHITE}"></circle><circle cx="51" cy="34" r="2" fill="${EYE_PUPIL}"></circle><circle cx="71" cy="34" r="2" fill="${EYE_PUPIL}"></circle></g>`;
  }
}

function renderHat(hat: Hat, capColor: string): string {
  switch (hat) {
    case 'JG CAP':
      return `<g><path d="M32 22 C38 4 82 4 88 22 L60 18 Z" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></path><path d="M30 22 L98 26 L96 30 L30 26 Z" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></path><polygon points="60,10 65,13 65,18 60,21 55,18 55,13" fill="${STROKE}"></polygon></g>`;
    case 'SNORKEL':
      return `<g><rect x="38" y="26" width="44" height="16" rx="6" fill="none" stroke="${ACCENT}" stroke-width="4"></rect><rect x="42" y="29" width="16" height="10" rx="2" fill="${SNORKEL_LENS}" opacity=".8"></rect><rect x="62" y="29" width="16" height="10" rx="2" fill="${SNORKEL_LENS}" opacity=".8"></rect><path d="M84 30 L92 30 L92 6" fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"></path><path d="M20 22 C30 6 90 6 100 22 L60 14 Z" fill="${SNORKEL_MASK}" stroke="${STROKE}" stroke-width="3"></path></g>`;
    case 'HEADPHONES':
      return `<g><path d="M30 34 C30 10 90 10 90 34" fill="none" stroke="${STROKE}" stroke-width="5"></path><rect x="24" y="28" width="10" height="16" rx="4" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></rect><rect x="86" y="28" width="10" height="16" rx="4" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></rect></g>`;
    case 'WAR WEEK BAND':
      return `<g><path d="M28 26 L92 26 L92 34 L28 34 Z" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></path><path d="M88 26 L100 30 L98 60 L90 58 Z" fill="${capColor}" stroke="${STROKE}" stroke-width="2"></path><text x="60" y="32.5" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="7" fill="${BAND_TEXT}" letter-spacing="1">WAR WEEK</text></g>`;
    case 'NONE':
    default:
      return '';
  }
}

/**
 * Renders `look` at `pose` as a standalone SVG string, verbatim from
 * `design/Penguin Creator.dc.html`'s figure (L38-71) with its `sc-if`
 * branches resolved and its CSS keyframe animations baked into `pose`'s
 * static transforms (#31 D2/D3). Pure: no DOM or Phaser import, so it runs
 * in Node (the e2e grid), jsdom (unit tests) and the browser (the Creator
 * preview, #35) alike.
 *
 * `look.name` never appears in the output (#31 D2).
 */
export function renderPenguinSvg(
  look: PenguinLook,
  pose: PenguinPose = { anim: look.emote, frame: 0 },
): string {
  const framePose = resolvePenguinFramePose(pose);
  const clipId = `penguin-belly-${penguinLookHash(look)}-${pose.anim}-${pose.frame}`;

  const bodyTransform = `rotate(${framePose.bodyRotateDeg} ${PENGUIN_ORIGIN.x} ${PENGUIN_ORIGIN.y}) translate(0 ${framePose.bodyTranslateY})`;
  const leftFootAttr = framePose.leftFootLift
    ? ` transform="translate(0 ${framePose.leftFootLift})"`
    : '';
  const rightFootAttr = framePose.rightFootLift
    ? ` transform="translate(0 ${framePose.rightFootLift})"`
    : '';

  const seat = framePose.sitting
    ? `<rect x="-40" y="128" width="200" height="40" rx="6" fill="${SEAT_FILL}" stroke="${STROKE}" stroke-width="3"></rect>`
    : '';

  const haha = framePose.showHaha
    ? `<text x="100" y="30" font-family="Bumbastika, Anton, sans-serif" font-size="14" fill="${ACCENT}">HA HA</text>`
    : '';

  const figure = [
    `<g transform="${bodyTransform}">`,
    `<defs><clipPath id="${clipId}"><path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z"></path></clipPath></defs>`,
    seat,
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${look.body}" stroke="${STROKE}" stroke-width="6"></path>`,
    `<path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="${look.belly}"></path>`,
    `<g clip-path="url(#${clipId})">${renderPattern(look.pattern, look.body)}</g>`,
    renderEyes(look.eyes, framePose.forceSleepyEyes),
    `<path d="M50 44 L70 44 L60 54 Z" fill="${look.beak}"></path>`,
    `<path d="M40 116 L26 124 L52 122 Z" fill="${look.feet}"${leftFootAttr}></path>`,
    `<path d="M80 116 L94 124 L68 122 Z" fill="${look.feet}"${rightFootAttr}></path>`,
    `<g transform="rotate(${framePose.leftArmRotateDeg} 26 62)"><path d="M24 60 C10 78 12 96 26 100 Z" fill="${look.body}" stroke="${STROKE}" stroke-width="4"></path></g>`,
    `<g transform="rotate(${framePose.rightArmRotateDeg} 94 62)"><path d="M96 60 C110 78 108 96 94 100 Z" fill="${look.body}" stroke="${STROKE}" stroke-width="4"></path></g>`,
    renderHat(look.hat, look.cap),
    haha,
    `</g>`,
  ].join('');

  const minX = -PENGUIN_FRAME_PADDING;
  const minY = -PENGUIN_FRAME_PADDING;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH}" height="${PENGUIN_FRAME_HEIGHT}">${figure}</svg>`;
}
