// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  BEAK_COLORS,
  BODY_COLORS,
  CAP_COLORS,
  DEFAULT_LOOK,
  EYES,
  FEET_COLORS,
  HATS,
  PATTERNS,
  type PenguinLook,
} from '../../contracts';
import { blend, contrastRatio, MIN_CONTRAST, reachesMinContrast } from './contrast';
import { ACCENT, BACKDROP, EYE_PUPIL, EYE_WHITE, STROKE } from './palette';
import { PENGUIN_ANIMS, PENGUIN_FRAMES } from './poses';
import {
  PATTERN_OPACITY,
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_VIEWBOX_HEIGHT,
  PENGUIN_VIEWBOX_WIDTH,
  preContrastFixColors,
  renderPenguinSvg,
  renderPenguinSvgWithColors,
  resolvePenguinColors,
  type ResolvedPenguinColors,
} from './render-svg';
import { PENGUIN_TEXT_PATHS } from './text-paths';
import preContrastFixSvgsJson from './__fixtures__/pre-79-golden.json';

const preContrastFixSvgs = preContrastFixSvgsJson as Record<string, string>;

// Distinct from every colour in render-svg.ts's own fixed palette (STROKE
// `#0C4B5F`, EYE_WHITE `#F4F4F4`, EYE_PUPIL `#161719`, ACCENT `#00BDFF`,
// SEAT_FILL `#3a4046`, SNORKEL_MASK `#F2C12E`, SNORKEL_LENS `#BFE3F0`) and
// from `DEFAULT_LOOK`'s own colours, so a fill assertion can only be
// satisfied by the part it names (#31 review fix 8).
const CUSTOM_BODY = '#123456';
const CUSTOM_BELLY = '#abcdef';
const CUSTOM_BEAK = '#a1b2c3';
const CUSTOM_FEET = '#c3b2a1';
const CUSTOM_CAP = '#4d5e6f';

const SLEEPY_EYE_PATH = 'M45 35 Q50 30 55 35';
const ROUND_EYE_LEFT = 'cx="50" cy="34" r="4.5"';
const ROUND_EYE_RIGHT = 'cx="70" cy="34" r="4.5"';
const ROUND_EYE_RADIUS_ATTR = 'r="4.5"';
const WINK_EYE_LINE = 'M65 34 L75 34';
const STAR_EYE_POLYGON_START = 'polygon points="50,28';

function assertValidSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.querySelector('svg')).not.toBeNull();
  return doc;
}

describe('renderPenguinSvg', () => {
  it('produces valid SVG for every hat option', () => {
    for (const hat of HATS) {
      assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, hat }));
    }
  });

  it('produces valid SVG for every belly pattern option', () => {
    for (const pattern of PATTERNS) {
      assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, pattern }));
    }
  });

  it('produces valid SVG for every eyes option', () => {
    for (const eyes of EYES) {
      assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, eyes }));
    }
  });

  it('produces valid SVG for every anim frame, including WALK', () => {
    for (const anim of PENGUIN_ANIMS) {
      const frameCount = PENGUIN_FRAMES[anim];
      for (let frame = 0; frame < frameCount; frame++) {
        assertValidSvg(renderPenguinSvg(DEFAULT_LOOK, { anim, frame }));
      }
    }
  });

  it('produces valid SVG for every body, cap, beak and feet colour option', () => {
    for (const body of BODY_COLORS) assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, body }));
    for (const cap of CAP_COLORS) assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, cap }));
    for (const beak of BEAK_COLORS) assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, beak }));
    for (const feet of FEET_COLORS) assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, feet }));
  });

  it('produces valid SVG for every belly colour in the body palette', () => {
    for (const belly of BODY_COLORS) assertValidSvg(renderPenguinSvg({ ...DEFAULT_LOOK, belly }));
  });

  it("the default look's SVG uses JG CAP / PLAIN / ROUND", () => {
    const svg = renderPenguinSvg(DEFAULT_LOOK);
    const doc = assertValidSvg(svg);

    // PLAIN: the belly pattern group renders no children.
    const patternGroup = doc.querySelector('g[clip-path]');
    expect(patternGroup).not.toBeNull();
    expect(patternGroup!.childElementCount).toBe(0);

    // ROUND: two round eye circles with pupils, no SLEEPY/STAR/WINK markers.
    expect(svg).toContain(ROUND_EYE_LEFT);
    expect(svg).toContain(ROUND_EYE_RIGHT);
    expect(svg).not.toContain(SLEEPY_EYE_PATH);
  });

  // #92 D4: the JG CAP's geometry, copied verbatim from `design/Penguin
  // Creator.dc.html` L59 (an independent source, not `render-svg.ts`
  // itself), so this fails if the renderer's cap ever drifts from the
  // design's own crown/brim/seam/button paths.
  const DESIGN_JG_CAP_CROWN_D = 'M34 24 C36 6 84 6 86 24 Z';
  const DESIGN_JG_CAP_BACK_BRIM_D = 'M34 24 L86 24 C86 27 82 29 74 30 L46 30 C38 29 34 27 34 24 Z';
  const DESIGN_JG_CAP_FRONT_BRIM_D = 'M58 24 L102 26 C104 28 102 32 98 33 L60 29 Z';
  const DESIGN_JG_CAP_SEAM_D = 'M60 8 L60 24';
  const DESIGN_JG_CAP_BUTTON_POINTS = '60,11 65,14 65,20 60,23 55,20 55,14';

  it("the JG CAP hat matches the design's crown, brim, seam and button paths (#92 D4)", () => {
    const svg = renderPenguinSvg({ ...DEFAULT_LOOK, hat: 'JG CAP' });
    expect(svg).toContain(`d="${DESIGN_JG_CAP_CROWN_D}"`);
    expect(svg).toContain(`d="${DESIGN_JG_CAP_BACK_BRIM_D}"`);
    expect(svg).toContain(`d="${DESIGN_JG_CAP_FRONT_BRIM_D}"`);
    expect(svg).toContain(`d="${DESIGN_JG_CAP_SEAM_D}"`);
    expect(svg).toContain(`points="${DESIGN_JG_CAP_BUTTON_POINTS}"`);
    expect(svg).toContain('stroke-width="2.5"');
    expect(svg).toContain('stroke-linejoin="round"');
    // The "JG" crown label is baked to path outlines (#62's SVG-as-texture
    // rule), not a live `<text>` element.
    expect(svg).not.toContain('<text');
    expect(svg).toContain(PENGUIN_TEXT_PATHS.jgCap.d);
  });

  it("a custom look's SVG carries its own colours for body, belly, beak, feet and cap", () => {
    const look: PenguinLook = {
      ...DEFAULT_LOOK,
      body: CUSTOM_BODY,
      belly: CUSTOM_BELLY,
      beak: CUSTOM_BEAK,
      feet: CUSTOM_FEET,
      cap: CUSTOM_CAP,
    };
    const svg = renderPenguinSvg(look);
    assertValidSvg(svg);

    expect(svg).toContain(`fill="${CUSTOM_BODY}"`);
    expect(svg).toContain(`fill="${CUSTOM_BELLY}"`);
    expect(svg).toContain(`fill="${CUSTOM_BEAK}"`);
    expect(svg).toContain(`fill="${CUSTOM_FEET}"`);
    expect(svg).toContain(`fill="${CUSTOM_CAP}"`);
  });

  it('never includes the look name', () => {
    const look: PenguinLook = { ...DEFAULT_LOOK, name: 'Zaphod Beeblebrox' };
    const svg = renderPenguinSvg(look);
    expect(svg).not.toContain('Zaphod');
    expect(svg).not.toContain(look.name);
  });

  it('LAUGH frames force sleepy eyes regardless of the look eyes option, hiding WINK and STAR markers', () => {
    for (const eyes of EYES) {
      const look: PenguinLook = { ...DEFAULT_LOOK, eyes, emote: 'LAUGH' };
      for (let frame = 0; frame < PENGUIN_FRAMES.LAUGH; frame++) {
        const svg = renderPenguinSvg(look, { anim: 'LAUGH', frame });
        expect(svg).toContain(SLEEPY_EYE_PATH);
        // No round pupil, star point or wink line should sneak through.
        expect(svg).not.toContain(ROUND_EYE_RADIUS_ATTR);
        expect(svg).not.toContain(WINK_EYE_LINE);
        expect(svg).not.toContain(STAR_EYE_POLYGON_START);
        expect(svg).toContain(PENGUIN_TEXT_PATHS.haha.d);
      }
    }
  });

  it('the SIT seat sits fully inside the padded frame box (#31 review fix 1)', () => {
    const svg = renderPenguinSvg(DEFAULT_LOOK, { anim: 'SIT', frame: 0 });
    const doc = assertValidSvg(svg);

    const rect = doc.querySelector('rect[rx]');
    expect(rect).not.toBeNull();

    const x = Number(rect!.getAttribute('x'));
    const y = Number(rect!.getAttribute('y'));
    const width = Number(rect!.getAttribute('width'));
    const height = Number(rect!.getAttribute('height'));

    const minX = -PENGUIN_FRAME_PADDING_X;
    const minY = -PENGUIN_FRAME_PADDING_Y;
    const maxX = PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING_X;
    const maxY = PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING_Y;
    expect(maxX - minX).toBe(PENGUIN_FRAME_WIDTH);
    expect(maxY - minY).toBe(PENGUIN_FRAME_HEIGHT);

    expect(x).toBeGreaterThanOrEqual(minX);
    expect(y).toBeGreaterThanOrEqual(minY);
    expect(x + width).toBeLessThanOrEqual(maxX);
    expect(y + height).toBeLessThanOrEqual(maxY);
  });

  it('never draws a <text> element, for any hat, pattern, eyes option or anim frame (#62 D3)', () => {
    // Browsers don't let an SVG loaded as an `<img>`/Phaser texture use the
    // page's web fonts, so any `<text>` here would fall back to a system
    // font in Rooms (#62); the JG LOGO/WAR WEEK BAND/"HA HA" strings must be
    // pre-baked `<path>` outlines instead (`PENGUIN_TEXT_PATHS`).
    for (const hat of HATS) {
      expect(renderPenguinSvg({ ...DEFAULT_LOOK, hat })).not.toContain('<text');
    }
    for (const pattern of PATTERNS) {
      expect(renderPenguinSvg({ ...DEFAULT_LOOK, pattern })).not.toContain('<text');
    }
    for (const eyes of EYES) {
      expect(renderPenguinSvg({ ...DEFAULT_LOOK, eyes })).not.toContain('<text');
    }
    for (const anim of PENGUIN_ANIMS) {
      const frameCount = PENGUIN_FRAMES[anim];
      for (let frame = 0; frame < frameCount; frame++) {
        expect(renderPenguinSvg(DEFAULT_LOOK, { anim, frame })).not.toContain('<text');
      }
    }
  });

  it('accepts an idPrefix so multiple inline renders never clash on clipPath ids (#31 review fix 7)', () => {
    const svgA = renderPenguinSvg(DEFAULT_LOOK, undefined, { idPrefix: 'cell-a' });
    const svgB = renderPenguinSvg(DEFAULT_LOOK, undefined, { idPrefix: 'cell-b' });

    const idA = svgA.match(/clipPath id="([^"]+)"/)?.[1];
    const idB = svgB.match(/clipPath id="([^"]+)"/)?.[1];

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(idA).toContain('cell-a');
    expect(idB).toContain('cell-b');
  });
});

// #79's own custom-colour probes: distinct from every official swatch, from
// STROKE/EYE_WHITE/EYE_PUPIL/ACCENT/BACKDROP, and from each other (#79
// review round 1 nit 9 dropped the original `#00bdff`, which is ACCENT
// itself -- an existing swatch, not a new probe).
const CUSTOM_COLORS = ['#808080', '#1a3a4a', '#ffffff', '#5a3d7a'] as const;

describe('resolvePenguinColors (#79 D1/D2)', () => {
  // Every rule depends on at most the body (plus BACKDROP), the belly (plus
  // the body, for bellyRim), or the cap alone -- never on more than one
  // PenguinLook field at a time except that one pairing. So varying one
  // axis at a time against DEFAULT_LOOK's own values for every other field
  // exercises each rule's full input range (official swatches plus the
  // custom probes) without the combinatorial body x cap x beak x feet
  // matrix's cost (#79 review round 1 nit 9; the full cross product,
  // including every custom colour above, was separately verified offline
  // against this same resolver with zero failures before this suite was
  // written, so trimming here doesn't relax the acceptance criteria, only
  // how many times the already-proven maths gets re-checked in CI).
  const bodies = [...BODY_COLORS, ...CUSTOM_COLORS];
  const caps = [...CAP_COLORS, ...CUSTOM_COLORS];
  const beaks = [...BEAK_COLORS, ...CUSTOM_COLORS];
  const feetOptions = [...FEET_COLORS, ...CUSTOM_COLORS];

  it('every body colour: the outline and HEADPHONES band are two-sided (STROKE kept when it already clears the body plus BACKDROP, replaced and re-verified otherwise)', () => {
    for (const body of bodies) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, body });
      const bodyClearsBackdrop = reachesMinContrast(body, [BACKDROP]);
      const surfaces = bodyClearsBackdrop ? [body] : [body, BACKDROP];
      const strokeAlreadyPasses = reachesMinContrast(STROKE, surfaces);

      for (const field of ['bodyOutline', 'headphoneBand'] as const) {
        if (strokeAlreadyPasses) {
          expect(resolved[field]).toBe(STROKE);
        } else {
          expect(resolved[field]).not.toBe(STROKE);
          expect(contrastRatio(resolved[field], body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          if (!bodyClearsBackdrop) {
            expect(contrastRatio(resolved[field], BACKDROP)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          }
        }
      }
    }
  });

  it('every body colour: the eye-white, STAR-eye and snorkel rims are two-sided (null when the design colour already clears the body, a verified substitute otherwise)', () => {
    for (const body of bodies) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, body });

      if (reachesMinContrast(EYE_WHITE, [body])) {
        expect(resolved.eyeWhiteRim).toBeNull();
      } else {
        expect(resolved.eyeWhiteRim).not.toBeNull();
        expect(contrastRatio(resolved.eyeWhiteRim!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      const accentPasses = reachesMinContrast(ACCENT, [body]);
      for (const field of ['eyeStarRim', 'snorkelRim'] as const) {
        if (accentPasses) {
          expect(resolved[field]).toBeNull();
        } else {
          expect(resolved[field]).not.toBeNull();
          expect(contrastRatio(resolved[field]!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
      }
    }
  });

  it('every beak colour, against a light body baseline (#F4F4F4) that fails several official beak swatches: beakRim is two-sided', () => {
    const body = '#F4F4F4';
    for (const beak of beaks) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, body, beak });

      if (reachesMinContrast(beak, [body])) {
        expect(resolved.beakRim).toBeNull();
      } else {
        expect(resolved.beakRim).not.toBeNull();
        expect(contrastRatio(resolved.beakRim!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it('every feet colour: feetRim against BACKDROP is two-sided', () => {
    for (const feet of feetOptions) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, feet });

      if (reachesMinContrast(feet, [BACKDROP])) {
        expect(resolved.feetRim).toBeNull();
      } else {
        expect(resolved.feetRim).not.toBeNull();
        expect(contrastRatio(resolved.feetRim!, BACKDROP)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it('every cap colour: capOutline and warWeekFill are two-sided against the cap', () => {
    for (const cap of caps) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, cap });

      if (reachesMinContrast(STROKE, [cap])) {
        expect(resolved.capOutline).toBe(STROKE);
      } else {
        expect(resolved.capOutline).not.toBe(STROKE);
        expect(contrastRatio(resolved.capOutline, cap)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      if (reachesMinContrast(EYE_PUPIL, [cap])) {
        expect(resolved.warWeekFill).toBe(EYE_PUPIL);
      } else {
        expect(resolved.warWeekFill).not.toBe(EYE_PUPIL);
        expect(contrastRatio(resolved.warWeekFill, cap)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  // #92 round 2 nit 4: the JG CAP's "JG" label sits on the badge polygon
  // (filled with `capOutline`), not on the cap itself, so it's checked
  // against `capOutline`, the same two-sided rule as every other resolved
  // colour -- including every official CAP_COLORS swatch (`#D63C3C` named
  // explicitly in review) and the `#808080` custom probe, both already in
  // `caps` above.
  it('every cap colour: capLabel is two-sided against the resolved capOutline (badge)', () => {
    for (const cap of caps) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, cap });

      if (reachesMinContrast(EYE_WHITE, [resolved.capOutline])) {
        expect(resolved.capLabel).toBe(EYE_WHITE);
      } else {
        expect(resolved.capLabel).not.toBe(EYE_WHITE);
      }
      expect(contrastRatio(resolved.capLabel, resolved.capOutline)).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it("every belly colour (official swatch or custom), against DEFAULT_LOOK's body: bellyRim, the painted (blended) pattern ink, and the PIXEL HEART/SNOWFLAKE rims are two-sided", () => {
    const body = DEFAULT_LOOK.body;
    for (const belly of bodies) {
      const resolved = resolvePenguinColors({ ...DEFAULT_LOOK, belly });

      if (reachesMinContrast(belly, [body])) {
        expect(resolved.bellyRim).toBeNull();
      } else {
        expect(resolved.bellyRim).not.toBeNull();
        expect(contrastRatio(resolved.bellyRim!, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(contrastRatio(resolved.bellyRim!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      // Checked as painted at PATTERN_OPACITY over the belly, not raw (#79
      // review round 1 nit 1), mirroring pickContrastingOverlay's own
      // three-tier contract exactly (preferred, then the first passing
      // candidate in order, then -- like plain pickContrasting -- whichever
      // candidate has the best worst-case blended ratio, with no guarantee
      // that ratio clears MIN_CONTRAST). That third tier is real, not just
      // theoretical: a mid-grey belly such as the `#808080` custom probe
      // blends every one of STROKE/ACCENT/EYE_WHITE/EYE_PUPIL at
      // `PATTERN_OPACITY` to under 3:1 against itself, so the ink can't
      // reach 3:1 there no matter which candidate wins.
      const blendedContrast = (color: string): number =>
        contrastRatio(blend(color, belly, PATTERN_OPACITY), belly);
      const inkCandidates = [STROKE, ACCENT, EYE_WHITE, EYE_PUPIL];

      if (blendedContrast(body) >= MIN_CONTRAST) {
        expect(resolved.patternInk).toBe(body);
      } else {
        const firstPassing = inkCandidates.find((c) => blendedContrast(c) >= MIN_CONTRAST);
        if (firstPassing) {
          expect(resolved.patternInk).toBe(firstPassing);
        } else {
          const bestPossible = Math.max(...inkCandidates.map(blendedContrast));
          expect(blendedContrast(resolved.patternInk)).toBeCloseTo(bestPossible, 10);
        }
      }

      if (reachesMinContrast(ACCENT, [belly])) {
        expect(resolved.pixelHeartRim).toBeNull();
        expect(resolved.snowflakeRim).toBeNull();
      } else {
        expect(resolved.pixelHeartRim).not.toBeNull();
        expect(resolved.snowflakeRim).not.toBeNull();
        expect(contrastRatio(resolved.pixelHeartRim!, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(contrastRatio(resolved.snowflakeRim!, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });
});

describe('renderPenguinSvg colour contrast (#79)', () => {
  it('a teal body (#0C4B5F) now gets a non-teal outline in the SVG, reaching 3:1 against the teal body', () => {
    const look: PenguinLook = { ...DEFAULT_LOOK, body: '#0C4B5F' };
    const resolved = resolvePenguinColors(look);
    const svg = renderPenguinSvg(look);

    expect(resolved.bodyOutline).not.toBe('#0C4B5F');
    expect(contrastRatio(resolved.bodyOutline, '#0C4B5F')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(svg).toContain(
      `fill="#0C4B5F" stroke="${resolved.bodyOutline}" stroke-width="6"></path>`,
    );
  });

  it('a white body (#F4F4F4) gets a rim on the (also white, #F4F4F4) belly', () => {
    const look: PenguinLook = { ...DEFAULT_LOOK, body: '#F4F4F4' };
    const resolved = resolvePenguinColors(look);
    const svg = renderPenguinSvg(look);

    expect(resolved.bellyRim).not.toBeNull();
    expect(contrastRatio(resolved.bellyRim!, '#F4F4F4')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(svg).toContain(
      `fill="#F4F4F4" stroke="${resolved.bellyRim}" stroke-width="2"></path><g clip-path`,
    );
  });

  // #79's own rule table makes the default body/arm outline colour (STROKE)
  // and the default ROUND/SLEEPY/WINK eye colour (EYE_WHITE) impossible to
  // both clear 3:1 against any single body colour: STROKE only clears 3:1
  // against a body lighter than ~28% relative luminance, while EYE_WHITE
  // only clears 3:1 against a body darker than ~27% (verified by an
  // exhaustive sweep of the RGB cube, not just the official swatches) --
  // ranges that never overlap. So no PenguinLook's SVG is entirely
  // untouched by #79; every body colour needs either the outline or an eye
  // rim fixed. This look is the closest thing to "a passing look": every
  // *other* governed rule (outline, belly, beak, feet) already clears 3:1
  // on the design's own colours, and only the eye-white rim -- structurally
  // unavoidable for this body, not a bug -- is added.
  it('is byte-identical to the pre-#79 render for a look whose outline, belly, beak and feet rules already clear 3:1; only the (structurally unavoidable, see above) eye-white rim differs', () => {
    const look: PenguinLook = {
      ...DEFAULT_LOOK,
      body: '#F2C12E',
      belly: '#0C4B5F',
      beak: '#0C4B5F',
      feet: '#F2C12E',
      hat: 'NONE',
      pattern: 'PLAIN',
      eyes: 'ROUND',
    };
    const resolved = resolvePenguinColors(look);

    // Confirms this look isn't a coincidence: every rule but the eye-white
    // rim already passes on its own design colour.
    expect(resolved.bodyOutline).toBe('#0C4B5F');
    expect(resolved.bellyRim).toBeNull();
    expect(resolved.beakRim).toBeNull();
    expect(resolved.feetRim).toBeNull();
    expect(resolved.eyeWhiteRim).not.toBeNull();

    const svg = renderPenguinSvg(look, { anim: 'WADDLE', frame: 0 }, { idPrefix: 'golden' });

    // Captured from `5ddaaae` (pre-#79) for this exact look/pose/idPrefix.
    const PRE_79_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -30 260 190" width="260" height="190"><g transform="rotate(-5 60 130) translate(0 0)"><defs><clipPath id="penguin-belly-golden"><path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z"></path></clipPath></defs><path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="#F2C12E" stroke="#0C4B5F" stroke-width="6"></path><path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="#0C4B5F"></path><g clip-path="url(#penguin-belly-golden)"></g><g><circle cx="50" cy="34" r="4.5" fill="#F4F4F4"></circle><circle cx="70" cy="34" r="4.5" fill="#F4F4F4"></circle><circle cx="51" cy="34" r="2" fill="#161719"></circle><circle cx="71" cy="34" r="2" fill="#161719"></circle></g><path d="M50 44 L70 44 L60 54 Z" fill="#0C4B5F"></path><path d="M40 116 L26 124 L52 122 Z" fill="#F2C12E"></path><path d="M80 116 L94 124 L68 122 Z" fill="#F2C12E"></path><g transform="rotate(0 26 62)"><path d="M24 60 C10 78 12 96 26 100 Z" fill="#F2C12E" stroke="#0C4B5F" stroke-width="4"></path></g><g transform="rotate(0 94 62)"><path d="M96 60 C110 78 108 96 94 100 Z" fill="#F2C12E" stroke="#0C4B5F" stroke-width="4"></path></g></g></svg>';

    const expectedSvg = PRE_79_SVG.replace(
      '<circle cx="50" cy="34" r="4.5" fill="#F4F4F4"></circle><circle cx="70" cy="34" r="4.5" fill="#F4F4F4"></circle>',
      `<circle cx="50" cy="34" r="4.5" fill="#F4F4F4" stroke="${resolved.eyeWhiteRim}" stroke-width="2"></circle><circle cx="70" cy="34" r="4.5" fill="#F4F4F4" stroke="${resolved.eyeWhiteRim}" stroke-width="2"></circle>`,
    );

    expect(svg).toBe(expectedSvg);
  });
});

// #79 review round 1 nit 2a: rather than a single hand-picked "passing"
// look, this proves the two-sided guarantee at the mechanism level --
// `renderPenguinSvgWithColors` fed `preContrastFixColors(look)` (the
// pre-#79 renderer's fixed colours, on every rule) must reproduce the real
// pre-#79 renderer's output byte-for-byte, for every hat, every pattern,
// every eye style and a LAUGH (forced-sleepy) frame. The fixtures were
// captured by checking out `render-svg.ts` (and its then-unchanged sibling
// modules) from `5ddaaae` into a temporary directory outside the repo --
// never `git stash`, which is shared across worktrees -- and running the
// unmodified old renderer there; see
// `src/game/penguin/__fixtures__/pre-79-golden.json`.
//
// Every JG-CAP-bearing entry (`hat:JG CAP` itself, plus every `pattern:*`,
// `eyes:*` and `laugh:*` entry -- `DEFAULT_LOOK.hat` is `'JG CAP'`, so all of
// them draw it) was regenerated for #92 D4's cap redraw: not a fresh capture
// from `5ddaaae` (that commit predates the redraw and never drew this
// geometry), but a call to the *current* `renderPenguinSvgWithColors` +
// `preContrastFixColors` -- the exact call each `it` below makes -- so the
// fixture and the assertion can never drift apart. The other four `hat:*`
// entries (SNORKEL/HEADPHONES/WAR WEEK BAND/NONE, which override the hat
// away from JG CAP) are untouched real `5ddaaae` captures.
describe('renderPenguinSvgWithColors + preContrastFixColors: pre-#79 golden fixture (#79 review round 1 nit 2a)', () => {
  const FIXTURE_POSE = { anim: 'WADDLE', frame: 0 } as const;
  const FIXTURE_OPTIONS = { idPrefix: 'fixture' };

  it('reproduces the pre-#79 renderer byte-for-byte for every hat', () => {
    for (const hat of HATS) {
      const look: PenguinLook = { ...DEFAULT_LOOK, hat };
      const svg = renderPenguinSvgWithColors(
        look,
        FIXTURE_POSE,
        FIXTURE_OPTIONS,
        preContrastFixColors(look),
      );
      expect(svg).toBe(preContrastFixSvgs[`hat:${hat}`]);
    }
  });

  it('reproduces the pre-#79 renderer byte-for-byte for every belly pattern', () => {
    for (const pattern of PATTERNS) {
      const look: PenguinLook = { ...DEFAULT_LOOK, pattern };
      const svg = renderPenguinSvgWithColors(
        look,
        FIXTURE_POSE,
        FIXTURE_OPTIONS,
        preContrastFixColors(look),
      );
      expect(svg).toBe(preContrastFixSvgs[`pattern:${pattern}`]);
    }
  });

  it('reproduces the pre-#79 renderer byte-for-byte for every eye style', () => {
    for (const eyes of EYES) {
      const look: PenguinLook = { ...DEFAULT_LOOK, eyes };
      const svg = renderPenguinSvgWithColors(
        look,
        FIXTURE_POSE,
        FIXTURE_OPTIONS,
        preContrastFixColors(look),
      );
      expect(svg).toBe(preContrastFixSvgs[`eyes:${eyes}`]);
    }
  });

  it('reproduces the pre-#79 renderer byte-for-byte for a LAUGH (forced-sleepy) frame', () => {
    for (let frame = 0; frame < PENGUIN_FRAMES.LAUGH; frame++) {
      const svg = renderPenguinSvgWithColors(
        DEFAULT_LOOK,
        { anim: 'LAUGH', frame },
        FIXTURE_OPTIONS,
        preContrastFixColors(DEFAULT_LOOK),
      );
      expect(svg).toBe(preContrastFixSvgs[`laugh:${frame}`]);
    }
  });
});

// #79 review round 1 nit 2b: proves `renderPenguinSvgWithColors` wires each
// `ResolvedPenguinColors` field to exactly one markup fragment, and no
// other, by giving every field its own distinct placeholder colour (not a
// realistic, contrast-passing one -- that's the resolver's job, already
// covered above), changing exactly one field to a shared MARKER, and
// checking the rendered string differs *only* by that field's baseline
// colour being replaced with MARKER everywhere it appeared.
const MARKER_COLORS: ResolvedPenguinColors = {
  bodyOutline: '#111111',
  bellyRim: '#222222',
  patternInk: '#333333',
  pixelHeartRim: '#444444',
  snowflakeRim: '#555555',
  eyeWhiteRim: '#666666',
  eyeStarRim: '#777777',
  beakRim: '#888888',
  feetRim: '#999999',
  capOutline: '#aaaaaa',
  capLabel: '#eeeeee',
  headphoneBand: '#bbbbbb',
  snorkelRim: '#cccccc',
  warWeekFill: '#dddddd',
};
const MARKER = '#ff00ff';

const FIELD_CASES: Array<{ field: keyof ResolvedPenguinColors; overrides: Partial<PenguinLook> }> =
  [
    { field: 'bodyOutline', overrides: {} },
    { field: 'bellyRim', overrides: {} },
    { field: 'patternInk', overrides: { pattern: 'HEX' } },
    { field: 'pixelHeartRim', overrides: { pattern: 'PIXEL HEART' } },
    { field: 'snowflakeRim', overrides: { pattern: 'SNOWFLAKE' } },
    { field: 'eyeWhiteRim', overrides: { eyes: 'ROUND' } },
    { field: 'eyeStarRim', overrides: { eyes: 'STAR' } },
    { field: 'beakRim', overrides: {} },
    { field: 'feetRim', overrides: {} },
    { field: 'capOutline', overrides: { hat: 'JG CAP' } },
    { field: 'capLabel', overrides: { hat: 'JG CAP' } },
    { field: 'headphoneBand', overrides: { hat: 'HEADPHONES' } },
    { field: 'snorkelRim', overrides: { hat: 'SNORKEL' } },
    { field: 'warWeekFill', overrides: { hat: 'WAR WEEK BAND' } },
  ];

describe('renderPenguinSvgWithColors one-field markers (#79 review round 1 nit 2b)', () => {
  it.each(FIELD_CASES)(
    'changing only $field changes only that fragment',
    ({ field, overrides }) => {
      const look: PenguinLook = { ...DEFAULT_LOOK, ...overrides };
      const baselineValue = MARKER_COLORS[field];
      expect(baselineValue).not.toBeNull();

      const baselineSvg = renderPenguinSvgWithColors(
        look,
        undefined,
        { idPrefix: 'marker' },
        MARKER_COLORS,
      );
      expect(baselineSvg).toContain(baselineValue as string);

      const modifiedSvg = renderPenguinSvgWithColors(
        look,
        undefined,
        { idPrefix: 'marker' },
        { ...MARKER_COLORS, [field]: MARKER },
      );

      expect(modifiedSvg).not.toBe(baselineSvg);
      expect(modifiedSvg).toContain(MARKER);
      expect(modifiedSvg).toBe(baselineSvg.split(baselineValue as string).join(MARKER));
    },
  );
});
