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
  IDLE_EMOTES,
  PATTERNS,
  type PenguinLook,
} from '../../contracts';
import { PENGUIN_FRAMES, type PenguinAnim } from './poses';
import { renderPenguinSvg } from './render-svg';

const ALL_ANIMS: readonly PenguinAnim[] = [...IDLE_EMOTES, 'WALK'];

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
    for (const anim of ALL_ANIMS) {
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

  it("the default look's SVG carries the DEFAULT_LOOK colours and JG CAP / PLAIN / ROUND", () => {
    const svg = renderPenguinSvg(DEFAULT_LOOK);
    const doc = assertValidSvg(svg);

    expect(svg).toContain(`fill="${DEFAULT_LOOK.body}"`);
    expect(svg).toContain(`fill="${DEFAULT_LOOK.belly}"`);
    expect(svg).toContain(`fill="${DEFAULT_LOOK.beak}"`);
    expect(svg).toContain(`fill="${DEFAULT_LOOK.feet}"`);
    // JG CAP: the cap panels use the look's cap colour.
    expect(svg).toContain(`fill="${DEFAULT_LOOK.cap}"`);

    // PLAIN: the belly pattern group renders no children.
    const patternGroup = doc.querySelector('g[clip-path]');
    expect(patternGroup).not.toBeNull();
    expect(patternGroup!.childElementCount).toBe(0);

    // ROUND: two round eye circles with pupils, no SLEEPY/STAR/WINK markers.
    expect(svg).toContain('cx="50" cy="34" r="4.5"');
    expect(svg).toContain('cx="70" cy="34" r="4.5"');
    expect(svg).not.toContain('M45 35 Q50 30 55 35');
  });

  it('never includes the look name', () => {
    const look: PenguinLook = { ...DEFAULT_LOOK, name: 'Zaphod Beeblebrox' };
    const svg = renderPenguinSvg(look);
    expect(svg).not.toContain('Zaphod');
    expect(svg).not.toContain(look.name);
  });

  it('LAUGH frames force sleepy eyes regardless of the look eyes option', () => {
    for (const eyes of EYES) {
      const look: PenguinLook = { ...DEFAULT_LOOK, eyes, emote: 'LAUGH' };
      for (let frame = 0; frame < PENGUIN_FRAMES.LAUGH; frame++) {
        const svg = renderPenguinSvg(look, { anim: 'LAUGH', frame });
        expect(svg).toContain('M45 35 Q50 30 55 35');
        // No round pupil, star point or wink line should sneak through.
        expect(svg).not.toContain('r="4.5"');
        expect(svg).toContain('HA HA');
      }
    }
  });
});
