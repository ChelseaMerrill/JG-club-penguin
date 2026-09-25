import { describe, expect, it } from 'vitest';
import { compileCssAnimation, sampleCssAnimation, transformPoint } from './css-keyframes';

// Verbatim from `design/Room 05 Roof Deck.dc.html`.
const MK_BRANDON_GALLOP = {
  keyframes:
    '@keyframes mkBrandonGallop { 0% { transform: translate(0,0);} 20% { transform: translate(150px,75px);} 40% { transform: translate(250px,0);} 60% { transform: translate(50px,-100px);} 80% { transform: translate(-100px,-50px);} 100% { transform: translate(0,0);} }',
  animation: 'mkBrandonGallop 26s ease-in-out infinite',
};

function pointAt(source: Parameters<typeof compileCssAnimation>[0], elapsedMs: number) {
  return transformPoint(sampleCssAnimation(compileCssAnimation(source), elapsedMs), {
    x: 0,
    y: 0,
  });
}

describe('CSS keyframe animations from the Room designs', () => {
  it('reaches each percent stop of a path exactly on time', () => {
    expect(pointAt(MK_BRANDON_GALLOP, 0)).toEqual({ x: 0, y: 0 });
    const at20 = pointAt(MK_BRANDON_GALLOP, 0.2 * 26_000);
    expect(at20.x).toBeCloseTo(150);
    expect(at20.y).toBeCloseTo(75);
    const at40 = pointAt(MK_BRANDON_GALLOP, 0.4 * 26_000);
    expect(at40.x).toBeCloseTo(250);
    expect(at40.y).toBeCloseTo(0);
  });

  it('eases each segment with the animation timing function (ease-in-out)', () => {
    // Half-way through the 0%->20% segment: ease-in-out is symmetric, so 0.5.
    const mid = pointAt(MK_BRANDON_GALLOP, 0.1 * 26_000);
    expect(mid.x).toBeCloseTo(75);
    expect(mid.y).toBeCloseTo(37.5);
    // A quarter of the way: cubic-bezier(.42,0,.58,1)(0.25) is about 0.129,
    // well behind linear's 0.25.
    const quarter = pointAt(MK_BRANDON_GALLOP, 0.05 * 26_000);
    expect(quarter.x / 150).toBeCloseTo(0.129, 2);
  });

  it('loops: one full period later is the same point', () => {
    const early = pointAt(MK_BRANDON_GALLOP, 3_100);
    const looped = pointAt(MK_BRANDON_GALLOP, 3_100 + 26_000 * 3);
    expect(looped.x).toBeCloseTo(early.x);
    expect(looped.y).toBeCloseTo(early.y);
  });

  it('holds between a shared "a%,b%" stop pair (the NPC pauses at a waypoint)', () => {
    const mkAnthony = {
      keyframes:
        '@keyframes mkAnthony { 0% { transform: translate(0,0);} 29.3%,37.3% { transform: translate(-155px, -157.50000000000003px);} 62.7%,70.7% { transform: translate(-144.99999999999994px, 137.5px);} 100% { transform: translate(0,0);} }',
      animation: 'mkAnthony 28s ease-in-out infinite',
    };
    for (const percent of [29.3, 32, 37.3]) {
      const point = pointAt(mkAnthony, (percent / 100) * 28_000);
      expect(point.x).toBeCloseTo(-155);
      expect(point.y).toBeCloseTo(-157.5);
    }
  });

  it('rotates around the transform-origin (gallop pivots on the feet)', () => {
    const gallop = {
      keyframes:
        '@keyframes gallop { 0%,100% { transform: translateY(0) rotate(-4deg);} 50% { transform: translateY(-9px) rotate(4deg);} }',
      animation: 'gallop .45s ease-in-out infinite',
      transformOrigin: '60px 120px',
    };
    const compiled = compileCssAnimation(gallop);
    const feet = { x: 60, y: 120 };

    const start = sampleCssAnimation(compiled, 0);
    expect(transformPoint(start, feet).x).toBeCloseTo(60);
    expect(transformPoint(start, feet).y).toBeCloseTo(120);
    // rotate(-4deg): the head (straight above the feet) leans left.
    expect(transformPoint(start, { x: 60, y: 20 }).x).toBeCloseTo(
      60 - 100 * Math.sin(Math.PI / 45),
    );

    const peak = sampleCssAnimation(compiled, 225);
    expect(transformPoint(peak, feet).x).toBeCloseTo(60);
    expect(transformPoint(peak, feet).y).toBeCloseTo(111);
    expect(transformPoint(peak, { x: 60, y: 20 }).x).toBeGreaterThan(60);
  });

  it('applies a negative animation-delay as time already elapsed', () => {
    const idle = {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out -1.5s infinite',
    };
    expect(pointAt(idle, 0).y).toBeCloseTo(-3);
  });

  it('composes transform functions in order (rotate first, then translate in the rotated frame)', () => {
    const cartwheel = {
      keyframes:
        '@keyframes cartwheel { 0%,8% { transform: rotate(0) translateX(0);} 30% { transform: rotate(-180deg) translateX(-20px) translateY(-14px);} 52%,100% { transform: rotate(-360deg) translateX(-40px);} }',
      animation: 'cartwheel 10s linear infinite',
    };
    const at30 = pointAt(cartwheel, 3_000);
    // rotate(-180deg) flips the frame, so translate(-20px, -14px) lands at (+20, +14).
    expect(at30.x).toBeCloseTo(20);
    expect(at30.y).toBeCloseTo(14);
    // Linear, half-way from 8% to 30%: rotate(-90deg) translate(-10px, -7px).
    // rotate(-90deg) maps (x, y) to (y, -x): (-7, 10).
    const mid = pointAt(cartwheel, 1_900);
    expect(mid.x).toBeCloseTo(-7);
    expect(mid.y).toBeCloseTo(10);
  });

  it('rejects transform functions it cannot reproduce, so a port fails loudly', () => {
    expect(() =>
      compileCssAnimation({
        keyframes:
          '@keyframes swim { 0% { transform: skewY(26deg);} 100% { transform: skewY(0);} }',
        animation: 'swim 7s linear infinite',
      }),
    ).toThrow(/skewY/);
  });
});
