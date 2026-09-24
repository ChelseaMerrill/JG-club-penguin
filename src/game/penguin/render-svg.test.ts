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
import { PENGUIN_ANIMS, PENGUIN_FRAMES } from './poses';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_VIEWBOX_HEIGHT,
  PENGUIN_VIEWBOX_WIDTH,
  renderPenguinSvg,
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

    const minX = -PENGUIN_FRAME_PADDING;
    const minY = -PENGUIN_FRAME_PADDING;
    const maxX = PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING;
    const maxY = PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING;
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
