import { describe, expect, it } from 'vitest';
import {
  sampleMarkerBall,
  sampleMarkerCalloutBob,
  sampleMarkerGlow,
  soccerBallPattern,
} from './minigame-markers';

describe('sampleMarkerGlow', () => {
  it("starts at 0 (the design's own rest frame, also what reduced motion freezes on)", () => {
    expect(sampleMarkerGlow(0.22, 1400, 0)).toBeCloseTo(0, 5);
  });

  it('peaks at the given opacity halfway through the period', () => {
    expect(sampleMarkerGlow(0.22, 1400, 700)).toBeCloseTo(0.22, 5);
    expect(sampleMarkerGlow(0.3, 1400, 700)).toBeCloseTo(0.3, 5);
  });

  it('loops back to 0 at the end of a period, and keeps looping', () => {
    expect(sampleMarkerGlow(0.22, 1400, 1400)).toBeCloseTo(0, 5);
    expect(sampleMarkerGlow(0.22, 1400, 1400 + 700)).toBeCloseTo(0.22, 5);
  });

  it("a quarter through the period is halfway to peak (linear, SMIL's own default)", () => {
    expect(sampleMarkerGlow(0.22, 1400, 350)).toBeCloseTo(0.11, 5);
  });
});

describe('sampleMarkerCalloutBob', () => {
  it("starts at 0 (the design's own rest frame)", () => {
    expect(sampleMarkerCalloutBob(0)).toBeCloseTo(0, 5);
  });

  it('bobs up 6px halfway through its 1.2s period, shared by every marker callout', () => {
    expect(sampleMarkerCalloutBob(600)).toBeCloseTo(-6, 5);
  });

  it('loops back to rest at the end of its period', () => {
    expect(sampleMarkerCalloutBob(1200)).toBeCloseTo(0, 5);
  });
});

describe('sampleMarkerBall', () => {
  const ball = { bounceHeight: 34, bouncePeriodMs: 900, shadow: { rx: 14, squashedRx: 9 } };

  it('rests on the ground with a full shadow and no rotation at elapsedMs 0', () => {
    const pose = sampleMarkerBall(ball, 0);
    expect(pose.dy).toBeCloseTo(0, 5);
    expect(pose.shadowScaleX).toBeCloseTo(1, 5);
    expect(pose.valveRotationDeg).toBeCloseTo(0, 5);
  });

  it('peaks the bounce height and narrows the shadow halfway through the bounce period', () => {
    const pose = sampleMarkerBall(ball, 450);
    expect(pose.dy).toBeCloseTo(-34, 5);
    expect(pose.shadowScaleX).toBeCloseTo(9 / 14, 5);
  });

  it('spins the valve dots a full turn over 1.8s, independently of the 0.9s bounce', () => {
    expect(sampleMarkerBall(ball, 900).valveRotationDeg).toBeCloseTo(180, 5);
    expect(sampleMarkerBall(ball, 1800).valveRotationDeg).toBeCloseTo(0, 5);
  });
});

describe('soccerBallPattern', () => {
  const radius = 22;
  const pattern = soccerBallPattern(radius);
  const inside = (point: { x: number; y: number }) => Math.hypot(point.x, point.y) <= radius + 1e-9;

  it('draws a centre pentagon, five rim patches and five seams', () => {
    expect(pattern.centre).toHaveLength(5);
    expect(pattern.rimPatches).toHaveLength(5);
    for (const patch of pattern.rimPatches) expect(patch).toHaveLength(5);
    expect(pattern.seams).toHaveLength(5);
  });

  it('keeps every patch corner on or inside the ball', () => {
    for (const point of [...pattern.centre, ...pattern.rimPatches.flat()]) {
      expect(inside(point), JSON.stringify(point)).toBe(true);
    }
  });

  it('clips each rim patch against the edge, so the ball reads as round, not starred', () => {
    for (const patch of pattern.rimPatches) {
      const onEdge = patch.filter(
        (point) => Math.abs(Math.hypot(point.x, point.y) - radius) < 1e-9,
      );
      expect(onEdge.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('joins each centre-pentagon corner to its own rim patch', () => {
    pattern.seams.forEach((seam, i) => {
      expect(seam.from).toEqual(pattern.centre[i]);
      expect(seam.to).toEqual(pattern.rimPatches[i]![0]);
      expect(Math.hypot(seam.to.x, seam.to.y)).toBeGreaterThan(
        Math.hypot(seam.from.x, seam.from.y),
      );
    });
  });
});
