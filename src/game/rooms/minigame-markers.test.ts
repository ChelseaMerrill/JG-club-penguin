import { describe, expect, it } from 'vitest';
import { sampleMarkerBall, sampleMarkerCalloutBob, sampleMarkerGlow } from './minigame-markers';

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
