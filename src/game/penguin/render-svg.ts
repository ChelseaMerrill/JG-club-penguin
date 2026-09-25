import type { Eyes, Hat, Pattern, PenguinLook } from '../../contracts';
import { contrastRatio, MIN_CONTRAST, pickContrasting } from './contrast';
import { DESIGN_TO_VIEWBOX_SCALE } from './design-scale';
import { penguinLookHash } from './look-hash';
import {
  ACCENT,
  BACKDROP,
  EYE_PUPIL,
  EYE_WHITE,
  SEAT_FILL,
  SNORKEL_LENS,
  SNORKEL_MASK,
  STROKE,
} from './palette';
import { type PenguinPose, resolvePenguinFramePose } from './poses';
import { PENGUIN_TEXT_PATHS } from './text-paths';

/**
 * Every colour `renderPenguinSvg` actually draws, resolved once from `look`
 * (#79 D2). A rim/halo field is `null` when that part's design colour
 * already clears `MIN_CONTRAST` against the surface it sits on, so the
 * renderer adds nothing and the SVG is byte-identical to before #79.
 */
export interface ResolvedPenguinColors {
  /** Body fill outline and both arm outlines (same rule, #79 table row 1). */
  bodyOutline: string;
  /** Extra rim on the belly path, against the body. */
  bellyRim: string | null;
  /** HEX/STRIPES ink -- the body colour, or a substitute that clears the belly. */
  patternInk: string;
  /** Rim around the PIXEL HEART pattern, against the belly. */
  pixelHeartRim: string | null;
  /** Halo under the SNOWFLAKE pattern's lines, against the belly. */
  snowflakeRim: string | null;
  /** Rim on the EYE_WHITE-coloured whites/lines (ROUND, SLEEPY, WINK), against the body. */
  eyeWhiteRim: string | null;
  /** Rim on the ACCENT-coloured STAR eyes, against the body. */
  eyeStarRim: string | null;
  /** Rim on the beak, against the body. */
  beakRim: string | null;
  /** Rim on both feet, against `BACKDROP`. */
  feetRim: string | null;
  /** JG CAP/HEADPHONES cup outline and the JG badge fill, against the cap. */
  capOutline: string;
  /** HEADPHONES band, against the body (and `BACKDROP`, as for the body outline). */
  headphoneBand: string;
  /** Halo under the SNORKEL frame/strap, against the body. */
  snorkelRim: string | null;
  /** WAR WEEK BAND text fill, against the cap. */
  warWeekFill: string;
}

function reachesMinContrast(color: string, surfaces: readonly string[]): boolean {
  return surfaces.every((surface) => contrastRatio(color, surface) >= MIN_CONTRAST);
}

/**
 * Resolves every colour `renderPenguinSvg` draws for `look`, applying the
 * #79 execution plan's per-part rule table. Pure: no DOM or Phaser import,
 * so it can be unit-tested directly (`render-svg.test.ts`'s swatch matrix)
 * without rendering anything.
 */
export function resolvePenguinColors(look: PenguinLook): ResolvedPenguinColors {
  // The body outline (and the HEADPHONES band, which follows the same rule)
  // must also clear BACKDROP when the body itself sinks into it, so a dark
  // body doesn't get an outline that's merely readable against the body but
  // still lost against the Room floor/Creator backdrop behind it.
  const bodySurfaces = reachesMinContrast(look.body, [BACKDROP])
    ? [look.body]
    : [look.body, BACKDROP];

  return {
    bodyOutline: pickContrasting(STROKE, bodySurfaces),
    bellyRim: reachesMinContrast(look.belly, [look.body])
      ? null
      : pickContrasting(STROKE, [look.belly, look.body]),
    patternInk: pickContrasting(look.body, [look.belly]),
    pixelHeartRim: reachesMinContrast(ACCENT, [look.belly])
      ? null
      : pickContrasting(STROKE, [look.belly]),
    snowflakeRim: reachesMinContrast(ACCENT, [look.belly])
      ? null
      : pickContrasting(STROKE, [look.belly]),
    eyeWhiteRim: reachesMinContrast(EYE_WHITE, [look.body])
      ? null
      : pickContrasting(STROKE, [look.body]),
    eyeStarRim: reachesMinContrast(ACCENT, [look.body])
      ? null
      : pickContrasting(STROKE, [look.body]),
    beakRim: reachesMinContrast(look.beak, [look.body])
      ? null
      : pickContrasting(STROKE, [look.body]),
    feetRim: reachesMinContrast(look.feet, [BACKDROP]) ? null : pickContrasting(STROKE, [BACKDROP]),
    capOutline: pickContrasting(STROKE, [look.cap]),
    headphoneBand: pickContrasting(STROKE, bodySurfaces),
    snorkelRim: reachesMinContrast(ACCENT, [look.body])
      ? null
      : pickContrasting(STROKE, [look.body]),
    warWeekFill: pickContrasting(EYE_PUPIL, [look.cap]),
  };
}

/** A thin rim stroke on a filled shape, or '' when no rim is needed. */
function rimAttr(color: string | null, width = 1.5): string {
  return color ? ` stroke="${color}" stroke-width="${width}"` : '';
}

/**
 * The design's own figure box (`design/Penguin Creator.dc.html`'s
 * `viewBox="0 0 120 130"`, also `design/Characters.dc.html`'s 120×130 sprite
 * box).
 */
export const PENGUIN_VIEWBOX_WIDTH = 120;
export const PENGUIN_VIEWBOX_HEIGHT = 130;

/**
 * Extra room on left/right of the design box, so a raised arm or the
 * "HA HA" text never clips against the rendered frame's edge (#31 D4).
 * "HA HA" starts at x=100 and, drawn as real Bumbastika outlines (#62),
 * reaches about x=182, so the horizontal padding must clear 62 units plus
 * the LAUGH tilt. Kept equal on both left and right (unlike
 * `PENGUIN_FRAME_PADDING_Y`, which has no such constraint) so the feet
 * anchor stays centred for `setFlipX` mirroring (#62 review fix 3).
 */
export const PENGUIN_FRAME_PADDING_X = 70;

/**
 * Extra room above/below the design box. Nothing vertical needs anywhere
 * near `PENGUIN_FRAME_PADDING_X`'s clearance: the SIT seat
 * (`design/Penguin Creator.dc.html` line 67) and the small per-frame body
 * lift/tilt in `poses.ts` are the only sources of vertical overhang, both
 * far smaller than the "HA HA" text's horizontal reach (#62 review fix 3;
 * `render-svg.test.ts`'s seat-in-frame check and `text-paths.test.ts`'s
 * worst-case-pose check both prove nothing clips at this value).
 */
export const PENGUIN_FRAME_PADDING_Y = 30;

export const PENGUIN_FRAME_WIDTH = PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING_X * 2;
export const PENGUIN_FRAME_HEIGHT = PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING_Y * 2;

/**
 * The feet-centre anchor, in the design's own 120×130 coordinate space (the
 * same space `renderPenguinSvg`'s `viewBox` uses, padding aside). A consumer
 * placing a Phaser sprite by its feet computes the sprite's fractional
 * origin as
 * `(PENGUIN_ORIGIN.x + PENGUIN_FRAME_PADDING_X) / PENGUIN_FRAME_WIDTH` and
 * `(PENGUIN_ORIGIN.y + PENGUIN_FRAME_PADDING_Y) / PENGUIN_FRAME_HEIGHT`,
 * since the rendered image's pixel (0,0) is the padded box's top-left
 * corner.
 */
export const PENGUIN_ORIGIN = { x: 60, y: 120 };

/**
 * The design's own body-rotation pivot: `design/Penguin Creator.dc.html`
 * line 37's `transform-origin: 50% 100%` on the figure's animated wrapper
 * div. 50% of its width is this viewBox's horizontal centre (`60`); 100% of
 * its height is this viewBox's bottom edge (`130`, `PENGUIN_VIEWBOX_HEIGHT`)
 * — a percentage-based origin needs no `DESIGN_TO_VIEWBOX_SCALE` conversion,
 * since it is already relative to the box's own size in either coordinate
 * system (#31 review fix 2). Distinct from `PENGUIN_ORIGIN`, which anchors
 * the *sprite* at its feet for #14/#28, not the body's rotation.
 */
const BODY_ROTATE_ORIGIN = { x: PENGUIN_VIEWBOX_WIDTH / 2, y: PENGUIN_VIEWBOX_HEIGHT };

/**
 * The SIT seat, converted from the design's own CSS box (#31 review fix 1):
 * `design/Penguin Creator.dc.html` line 67's
 * `left:50%; bottom:40px; width:200px; height:40px; margin-left:-100px;
 * border:3px solid; border-radius:6px` inside its 520x470 Creator canvas
 * (line 34, `display:grid; place-items:center`), which centres the figure's
 * 340px-wide, `130 * DESIGN_TO_VIEWBOX_SCALE`px-tall (~368.33px) box inside
 * it — a `(520-340)/2 = 90`px horizontal gap and a
 * `(470-368.33)/2 ≈ 50.83`px vertical gap on every side.
 *
 * The seat sets `left`/`bottom` explicitly (not `auto`), so it is positioned
 * from the *canvas's* edges regardless of `place-items`, not centred on the
 * figure's own grid cell:
 * - width/height/stroke/radius are lengths, so dividing by
 *   `DESIGN_TO_VIEWBOX_SCALE` converts them directly.
 * - x: the seat is centred on the same vertical centreline as the figure
 *   (both are centred on the canvas), which is this viewBox's `x = 60`
 *   (`PENGUIN_VIEWBOX_WIDTH / 2`); so `x = 60 - width/2`.
 * - y: the seat's top edge sits
 *   `470 - 40(bottom) - 40(height) = 390`px from the canvas top. Relative to
 *   the figure's own top edge (`50.83`px from the canvas top, above), that's
 *   `390 - 50.83 ≈ 339.17`px into the figure's own box, which converts to
 *   viewBox units by the same scale.
 */
const DESIGN_SEAT_WIDTH = 200;
const DESIGN_SEAT_HEIGHT = 40;
const DESIGN_SEAT_BOTTOM = 40;
const DESIGN_SEAT_STROKE = 3;
const DESIGN_SEAT_RADIUS = 6;
const DESIGN_CANVAS_HEIGHT = 470;
const DESIGN_FIGURE_HEIGHT = PENGUIN_VIEWBOX_HEIGHT * DESIGN_TO_VIEWBOX_SCALE;
const DESIGN_FIGURE_TOP_GAP = (DESIGN_CANVAS_HEIGHT - DESIGN_FIGURE_HEIGHT) / 2;
const DESIGN_SEAT_TOP_FROM_CANVAS_TOP =
  DESIGN_CANVAS_HEIGHT - DESIGN_SEAT_BOTTOM - DESIGN_SEAT_HEIGHT;

const SEAT_WIDTH = DESIGN_SEAT_WIDTH / DESIGN_TO_VIEWBOX_SCALE; // ~70.6
const SEAT_HEIGHT = DESIGN_SEAT_HEIGHT / DESIGN_TO_VIEWBOX_SCALE; // ~14.1
const SEAT_STROKE_WIDTH = DESIGN_SEAT_STROKE / DESIGN_TO_VIEWBOX_SCALE; // ~1.06
const SEAT_RADIUS = DESIGN_SEAT_RADIUS / DESIGN_TO_VIEWBOX_SCALE; // ~2.12
const SEAT_X = PENGUIN_VIEWBOX_WIDTH / 2 - SEAT_WIDTH / 2; // ~24.7
const SEAT_Y = (DESIGN_SEAT_TOP_FROM_CANVAS_TOP - DESIGN_FIGURE_TOP_GAP) / DESIGN_TO_VIEWBOX_SCALE; // ~119.7

function renderPattern(
  pattern: Pattern,
  ink: string,
  rims: Pick<ResolvedPenguinColors, 'pixelHeartRim' | 'snowflakeRim'>,
): string {
  switch (pattern) {
    case 'HEX':
      return `<g fill="none" stroke="${ink}" stroke-width="1.5" opacity=".55"><polygon points="50,58 56,61 56,68 50,71 44,68 44,61"></polygon><polygon points="70,58 76,61 76,68 70,71 64,68 64,61"></polygon><polygon points="60,74 66,77 66,84 60,87 54,84 54,77"></polygon><polygon points="50,90 56,93 56,100 50,103 44,100 44,93"></polygon><polygon points="70,90 76,93 76,100 70,103 64,100 64,93"></polygon></g>`;
    case 'STRIPES':
      return `<g fill="${ink}" opacity=".55"><rect x="30" y="56" width="60" height="5"></rect><rect x="30" y="68" width="60" height="5"></rect><rect x="30" y="80" width="60" height="5"></rect><rect x="30" y="92" width="60" height="5"></rect><rect x="30" y="104" width="60" height="5"></rect></g>`;
    case 'JG LOGO':
      return `<g><polygon points="60,64 74,72 74,88 60,96 46,88 46,72" fill="${STROKE}"></polygon><path d="${PENGUIN_TEXT_PATHS.jgLogo.d}" fill="${PENGUIN_TEXT_PATHS.jgLogo.fill}"></path></g>`;
    case 'PIXEL HEART':
      // Keeps the design's cyan (#79 D2); a rim on the group is inherited by
      // every unstroked rect child, so it only needs setting once.
      return `<g fill="${ACCENT}"${rimAttr(rims.pixelHeartRim)}><rect x="50" y="68" width="6" height="6"></rect><rect x="64" y="68" width="6" height="6"></rect><rect x="44" y="74" width="32" height="6"></rect><rect x="47" y="80" width="26" height="6"></rect><rect x="51" y="86" width="18" height="6"></rect><rect x="57" y="92" width="6" height="6"></rect></g>`;
    case 'SNOWFLAKE': {
      // Keeps the design's cyan; for these stroke-only lines a halo is a
      // wider duplicate drawn first, so the original cyan lines sit on top.
      const halo = rims.snowflakeRim
        ? `<g stroke="${rims.snowflakeRim}" stroke-width="5.5" stroke-linecap="round"><line x1="60" y1="62" x2="60" y2="98"></line><line x1="44" y1="71" x2="76" y2="89"></line><line x1="76" y1="71" x2="44" y2="89"></line><path d="M56 68 L60 62 L64 68 M56 92 L60 98 L64 92"></path></g>`
        : '';
      return `${halo}<g stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round"><line x1="60" y1="62" x2="60" y2="98"></line><line x1="44" y1="71" x2="76" y2="89"></line><line x1="76" y1="71" x2="44" y2="89"></line><path d="M56 68 L60 62 L64 68 M56 92 L60 98 L64 92"></path></g>`;
    }
    case 'PLAIN':
    default:
      return '';
  }
}

function renderEyes(
  eyes: Eyes,
  forceSleepy: boolean,
  rims: Pick<ResolvedPenguinColors, 'eyeWhiteRim' | 'eyeStarRim'>,
): string {
  const effective: Eyes | 'SLEEPY' = forceSleepy ? 'SLEEPY' : eyes;
  switch (effective) {
    case 'SLEEPY': {
      const halo = rims.eyeWhiteRim
        ? `<g fill="none" stroke="${rims.eyeWhiteRim}" stroke-width="6" stroke-linecap="round"><path d="M45 35 Q50 30 55 35"></path><path d="M65 35 Q70 30 75 35"></path></g>`
        : '';
      return `${halo}<g><path d="M45 35 Q50 30 55 35" fill="none" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path><path d="M65 35 Q70 30 75 35" fill="none" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path></g>`;
    }
    case 'STAR':
      return `<g fill="${ACCENT}"${rimAttr(rims.eyeStarRim)}><polygon points="50,28 51.8,32.5 56.5,32.8 52.9,35.8 54,40.5 50,38 46,40.5 47.1,35.8 43.5,32.8 48.2,32.5"></polygon><polygon points="70,28 71.8,32.5 76.5,32.8 72.9,35.8 74,40.5 70,38 66,40.5 67.1,35.8 63.5,32.8 68.2,32.5"></polygon></g>`;
    case 'WINK': {
      const lineHalo = rims.eyeWhiteRim
        ? `<path d="M65 34 L75 34" stroke="${rims.eyeWhiteRim}" stroke-width="6" stroke-linecap="round"></path>`
        : '';
      return `<g>${lineHalo}<circle cx="50" cy="34" r="4.5" fill="${EYE_WHITE}"${rimAttr(rims.eyeWhiteRim)}></circle><circle cx="51" cy="34" r="2" fill="${EYE_PUPIL}"></circle><path d="M65 34 L75 34" stroke="${EYE_WHITE}" stroke-width="3" stroke-linecap="round"></path></g>`;
    }
    case 'ROUND':
    default:
      return `<g><circle cx="50" cy="34" r="4.5" fill="${EYE_WHITE}"${rimAttr(rims.eyeWhiteRim)}></circle><circle cx="70" cy="34" r="4.5" fill="${EYE_WHITE}"${rimAttr(rims.eyeWhiteRim)}></circle><circle cx="51" cy="34" r="2" fill="${EYE_PUPIL}"></circle><circle cx="71" cy="34" r="2" fill="${EYE_PUPIL}"></circle></g>`;
  }
}

function renderHat(
  hat: Hat,
  capColor: string,
  resolved: Pick<
    ResolvedPenguinColors,
    'capOutline' | 'headphoneBand' | 'snorkelRim' | 'warWeekFill'
  >,
): string {
  switch (hat) {
    case 'JG CAP':
      return `<g><path d="M32 22 C38 4 82 4 88 22 L60 18 Z" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></path><path d="M30 22 L98 26 L96 30 L30 26 Z" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></path><polygon points="60,10 65,13 65,18 60,21 55,18 55,13" fill="${resolved.capOutline}"></polygon></g>`;
    case 'SNORKEL': {
      // The frame/strap are stroke-only, so their rim is a wider halo drawn
      // first (same shapes), rather than a `stroke` attribute (#79 D2).
      const halo = resolved.snorkelRim
        ? `<g fill="none" stroke="${resolved.snorkelRim}" stroke-width="7" stroke-linecap="round"><rect x="38" y="26" width="44" height="16" rx="6"></rect><path d="M84 30 L92 30 L92 6"></path></g>`
        : '';
      return `<g>${halo}<rect x="38" y="26" width="44" height="16" rx="6" fill="none" stroke="${ACCENT}" stroke-width="4"></rect><rect x="42" y="29" width="16" height="10" rx="2" fill="${SNORKEL_LENS}" opacity=".8"></rect><rect x="62" y="29" width="16" height="10" rx="2" fill="${SNORKEL_LENS}" opacity=".8"></rect><path d="M84 30 L92 30 L92 6" fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"></path><path d="M20 22 C30 6 90 6 100 22 L60 14 Z" fill="${SNORKEL_MASK}" stroke="${STROKE}" stroke-width="3"></path></g>`;
    }
    case 'HEADPHONES':
      return `<g><path d="M30 34 C30 10 90 10 90 34" fill="none" stroke="${resolved.headphoneBand}" stroke-width="5"></path><rect x="24" y="28" width="10" height="16" rx="4" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></rect><rect x="86" y="28" width="10" height="16" rx="4" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></rect></g>`;
    case 'WAR WEEK BAND':
      return `<g><path d="M28 26 L92 26 L92 34 L28 34 Z" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></path><path d="M88 26 L100 30 L98 60 L90 58 Z" fill="${capColor}" stroke="${resolved.capOutline}" stroke-width="2"></path><path d="${PENGUIN_TEXT_PATHS.warWeek.d}" fill="${resolved.warWeekFill}"></path></g>`;
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
 *
 * `options.idPrefix`, when given, replaces the hash+pose suffix in the belly
 * `clipPath` id (#31 review fix 7), so a caller rendering many instances
 * inline on one DOM page (e.g. the e2e grid) can guarantee unique ids itself
 * without relying on every cell happening to differ by look or pose.
 */
export function renderPenguinSvg(
  look: PenguinLook,
  pose: PenguinPose = { anim: look.emote, frame: 0 },
  options: { idPrefix?: string } = {},
): string {
  const framePose = resolvePenguinFramePose(pose);
  const resolved = resolvePenguinColors(look);
  const clipId = options.idPrefix
    ? `penguin-belly-${options.idPrefix}`
    : `penguin-belly-${penguinLookHash(look)}-${pose.anim}-${pose.frame}`;

  const bodyTransform = `rotate(${framePose.bodyRotateDeg} ${BODY_ROTATE_ORIGIN.x} ${BODY_ROTATE_ORIGIN.y}) translate(0 ${framePose.bodyTranslateY})`;
  const leftFootAttr = framePose.leftFootLift
    ? ` transform="translate(0 ${framePose.leftFootLift})"`
    : '';
  const rightFootAttr = framePose.rightFootLift
    ? ` transform="translate(0 ${framePose.rightFootLift})"`
    : '';

  // Painted after (outside) the figure's rotate/translate group, as a
  // sibling rather than a child, matching the design (`sc-if sitting` at
  // line 67 is a sibling of the animated figure div at line 37) (#31 review
  // fix 1).
  const seat = framePose.sitting
    ? `<rect x="${SEAT_X}" y="${SEAT_Y}" width="${SEAT_WIDTH}" height="${SEAT_HEIGHT}" rx="${SEAT_RADIUS}" fill="${SEAT_FILL}" stroke="${STROKE}" stroke-width="${SEAT_STROKE_WIDTH}"></rect>`
    : '';

  const haha = framePose.showHaha
    ? `<path d="${PENGUIN_TEXT_PATHS.haha.d}" fill="${PENGUIN_TEXT_PATHS.haha.fill}"></path>`
    : '';

  const figure = [
    `<g transform="${bodyTransform}">`,
    `<defs><clipPath id="${clipId}"><path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z"></path></clipPath></defs>`,
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${look.body}" stroke="${resolved.bodyOutline}" stroke-width="6"></path>`,
    `<path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="${look.belly}"${rimAttr(resolved.bellyRim)}></path>`,
    `<g clip-path="url(#${clipId})">${renderPattern(look.pattern, resolved.patternInk, resolved)}</g>`,
    renderEyes(look.eyes, framePose.forceSleepyEyes, resolved),
    `<path d="M50 44 L70 44 L60 54 Z" fill="${look.beak}"${rimAttr(resolved.beakRim)}></path>`,
    `<path d="M40 116 L26 124 L52 122 Z" fill="${look.feet}"${rimAttr(resolved.feetRim)}${leftFootAttr}></path>`,
    `<path d="M80 116 L94 124 L68 122 Z" fill="${look.feet}"${rimAttr(resolved.feetRim)}${rightFootAttr}></path>`,
    `<g transform="rotate(${framePose.leftArmRotateDeg} 26 62)"><path d="M24 60 C10 78 12 96 26 100 Z" fill="${look.body}" stroke="${resolved.bodyOutline}" stroke-width="4"></path></g>`,
    `<g transform="rotate(${framePose.rightArmRotateDeg} 94 62)"><path d="M96 60 C110 78 108 96 94 100 Z" fill="${look.body}" stroke="${resolved.bodyOutline}" stroke-width="4"></path></g>`,
    renderHat(look.hat, look.cap, resolved),
    haha,
    `</g>`,
    seat,
  ].join('');

  const minX = -PENGUIN_FRAME_PADDING_X;
  const minY = -PENGUIN_FRAME_PADDING_Y;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH}" height="${PENGUIN_FRAME_HEIGHT}">${figure}</svg>`;
}
