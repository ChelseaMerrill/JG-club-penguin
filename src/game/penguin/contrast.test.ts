import { describe, expect, it } from 'vitest';
import { contrastRatio, MIN_CONTRAST, pickContrasting, relativeLuminance } from './contrast';
import { ACCENT, EYE_PUPIL, EYE_WHITE, STROKE } from './palette';

describe('relativeLuminance / contrastRatio (WCAG 2.x, #79 D1)', () => {
  it('relativeLuminance is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 10);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('black vs white is the maximum ratio, 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('a colour against itself is 1', () => {
    expect(contrastRatio('#0C4B5F', '#0C4B5F')).toBeCloseTo(1, 5);
    expect(contrastRatio('#F4F4F4', '#F4F4F4')).toBeCloseTo(1, 5);
  });

  it('is symmetric: order of the two colours does not matter', () => {
    expect(contrastRatio('#0C4B5F', '#F4F4F4')).toBeCloseTo(contrastRatio('#F4F4F4', '#0C4B5F'), 5);
  });

  it('STROKE (#0C4B5F) vs EYE_WHITE (#F4F4F4) is about 8.7, computed independently from the WCAG formula', () => {
    // Independently derived (not copied from the implementation): sRGB ->
    // linear with the 0.03928 threshold, luminance-weighted 0.2126/0.7152/
    // 0.0722, ratio (lighter+0.05)/(darker+0.05).
    expect(contrastRatio('#0C4B5F', '#F4F4F4')).toBeCloseTo(8.7, 1);
  });

  it('accepts lower-case and upper-case hex input identically', () => {
    expect(contrastRatio('#3a4046', '#F4F4F4')).toBeCloseTo(
      contrastRatio('#3A4046', '#f4f4f4'),
      10,
    );
  });

  it('MIN_CONTRAST is the WCAG 1.4.11 non-text threshold', () => {
    expect(MIN_CONTRAST).toBe(3);
  });
});

describe('pickContrasting', () => {
  it('keeps the preferred colour when it already reaches 3:1 against every surface', () => {
    // STROKE vs a light surface clears 3:1 on its own.
    expect(pickContrasting(STROKE, ['#F4F4F4'])).toBe(STROKE);
  });

  it('falls back to the first candidate, in order, that reaches 3:1 against every surface', () => {
    // Preferred is the surface colour itself (0 contrast), and STROKE, the
    // first candidate, is also the surface colour, so it must skip to
    // ACCENT, the next candidate in the default order.
    const surface = '#0C4B5F';
    expect(pickContrasting('#0C4B5F', [surface])).toBe(ACCENT);
  });

  it('honours a caller-supplied candidate order over the default one', () => {
    const surface = '#0C4B5F';
    expect(pickContrasting('#0C4B5F', [surface], [EYE_WHITE, ACCENT])).toBe(EYE_WHITE);
  });

  it('picks the candidate with the best worst-case ratio when none of them clears every surface', () => {
    // A dark surface and a mid-grey surface bracket every default
    // candidate (verified independently: none of STROKE/ACCENT/EYE_WHITE/
    // EYE_PUPIL, nor the mid-grey preferred, reaches 3:1 against both), so
    // this exercises the final "best worst case" branch, not an early
    // return.
    const surfaces = ['#282828', '#909090'];
    const preferred = '#606060';
    const candidates = [STROKE, ACCENT, EYE_WHITE, EYE_PUPIL];
    const worstCase = (color: string): number =>
      Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

    // Precondition for hitting the "nothing passes" branch: the preferred
    // colour and every candidate each fail at least one of the two
    // surfaces, so no earlier branch could have returned first.
    expect(
      [preferred, ...candidates].every(
        (color) => !surfaces.every((surface) => contrastRatio(color, surface) >= MIN_CONTRAST),
      ),
    ).toBe(true);

    const result = pickContrasting(preferred, surfaces, candidates);
    const bestPossible = Math.max(...candidates.map((candidate) => worstCase(candidate)));

    expect(worstCase(result)).toBeCloseTo(bestPossible, 10);
  });
});
