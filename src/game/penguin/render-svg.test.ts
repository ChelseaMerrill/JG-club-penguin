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
import { contrastRatio, MIN_CONTRAST } from './contrast';
import { BACKDROP } from './palette';
import { PENGUIN_ANIMS, PENGUIN_FRAMES } from './poses';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_VIEWBOX_HEIGHT,
  PENGUIN_VIEWBOX_WIDTH,
  renderPenguinSvg,
  resolvePenguinColors,
} from './render-svg';
import { PENGUIN_TEXT_PATHS } from './text-paths';

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

// #79's own custom-colour probes, distinct from every official swatch.
const CUSTOM_COLORS = ['#808080', '#1a3a4a', '#ffffff', '#00bdff'] as const;

describe('resolvePenguinColors (#79 D1/D2)', () => {
  const bodies = [...BODY_COLORS, ...CUSTOM_COLORS];
  const caps = [...CAP_COLORS, ...CUSTOM_COLORS];
  const beaks = [...BEAK_COLORS, ...CUSTOM_COLORS];
  const feetOptions = [...FEET_COLORS, ...CUSTOM_COLORS];

  it("every body x cap x beak x feet combination resolves a colour or rim that reaches 3:1 against each part's surface, for every official swatch and the custom colours (#79 acceptance criteria)", () => {
    for (const body of bodies) {
      for (const cap of caps) {
        for (const beak of beaks) {
          for (const feet of feetOptions) {
            const look: PenguinLook = { ...DEFAULT_LOOK, body, cap, beak, feet };
            const resolved = resolvePenguinColors(look);

            // Body/arm outline: always against the body; also against
            // BACKDROP whenever the body itself doesn't already clear it
            // (#79 execution plan table, row 1).
            expect(contrastRatio(resolved.bodyOutline, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
            if (contrastRatio(body, BACKDROP) < MIN_CONTRAST) {
              expect(contrastRatio(resolved.bodyOutline, BACKDROP)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }

            // Beak: against the body.
            if (contrastRatio(beak, body) < MIN_CONTRAST) {
              expect(resolved.beakRim).not.toBeNull();
              expect(contrastRatio(resolved.beakRim!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
            }

            // Feet: against BACKDROP.
            if (contrastRatio(feet, BACKDROP) < MIN_CONTRAST) {
              expect(resolved.feetRim).not.toBeNull();
              expect(contrastRatio(resolved.feetRim!, BACKDROP)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }

            // Eyes: ROUND/SLEEPY/WINK's whites and STAR's polygons, against
            // the body.
            if (contrastRatio('#F4F4F4', body) < MIN_CONTRAST) {
              expect(resolved.eyeWhiteRim).not.toBeNull();
              expect(contrastRatio(resolved.eyeWhiteRim!, body)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }
            if (contrastRatio('#00BDFF', body) < MIN_CONTRAST) {
              expect(resolved.eyeStarRim).not.toBeNull();
              expect(contrastRatio(resolved.eyeStarRim!, body)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }

            // Hat outline / JG badge fill: against the cap.
            expect(contrastRatio(resolved.capOutline, cap)).toBeGreaterThanOrEqual(MIN_CONTRAST);

            // WAR WEEK BAND text fill: against the cap.
            expect(contrastRatio(resolved.warWeekFill, cap)).toBeGreaterThanOrEqual(MIN_CONTRAST);

            // Headphone band: against the body (and BACKDROP, as for the
            // body outline).
            expect(contrastRatio(resolved.headphoneBand, body)).toBeGreaterThanOrEqual(
              MIN_CONTRAST,
            );
            if (contrastRatio(body, BACKDROP) < MIN_CONTRAST) {
              expect(contrastRatio(resolved.headphoneBand, BACKDROP)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }

            // Snorkel frame: against the body.
            if (contrastRatio('#00BDFF', body) < MIN_CONTRAST) {
              expect(resolved.snorkelRim).not.toBeNull();
              expect(contrastRatio(resolved.snorkelRim!, body)).toBeGreaterThanOrEqual(
                MIN_CONTRAST,
              );
            }
          }
        }
      }
    }
  });

  it('every belly colour (official swatch or custom) resolves a belly rim and pattern ink that reach 3:1, for every body colour', () => {
    for (const body of bodies) {
      for (const belly of bodies) {
        const look: PenguinLook = { ...DEFAULT_LOOK, body, belly };
        const resolved = resolvePenguinColors(look);

        if (contrastRatio(belly, body) < MIN_CONTRAST) {
          expect(resolved.bellyRim).not.toBeNull();
          expect(contrastRatio(resolved.bellyRim!, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          expect(contrastRatio(resolved.bellyRim!, body)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
        expect(contrastRatio(resolved.patternInk, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);

        if (contrastRatio('#00BDFF', belly) < MIN_CONTRAST) {
          expect(resolved.pixelHeartRim).not.toBeNull();
          expect(contrastRatio(resolved.pixelHeartRim!, belly)).toBeGreaterThanOrEqual(
            MIN_CONTRAST,
          );
          expect(resolved.snowflakeRim).not.toBeNull();
          expect(contrastRatio(resolved.snowflakeRim!, belly)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
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
      `fill="#F4F4F4" stroke="${resolved.bellyRim}" stroke-width="1.5"></path><g clip-path`,
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
      `<circle cx="50" cy="34" r="4.5" fill="#F4F4F4" stroke="${resolved.eyeWhiteRim}" stroke-width="1.5"></circle><circle cx="70" cy="34" r="4.5" fill="#F4F4F4" stroke="${resolved.eyeWhiteRim}" stroke-width="1.5"></circle>`,
    );

    expect(svg).toBe(expectedSvg);
  });
});
