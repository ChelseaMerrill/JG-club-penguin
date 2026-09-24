import { describe, expect, it } from 'vitest';
import { computeStageFit } from './stage';

describe('computeStageFit', () => {
  it('fits a 1920x1080 viewport, height-bound, centered with a 9px gutter on the constrained axis', () => {
    const fit = computeStageFit(1920, 1080);
    expect(fit.scale).toBeCloseTo(1.18, 6);
    expect(fit.width).toBeCloseTo(1888, 6);
    expect(fit.height).toBeCloseTo(1062, 6);
    expect(fit.left).toBeCloseTo(16, 6);
    expect(fit.top).toBeCloseTo(9, 6);
  });

  it('fits a 1440x900 viewport, width-bound, centered with a 9px gutter on the constrained axis', () => {
    const fit = computeStageFit(1440, 900);
    expect(fit.scale).toBeCloseTo(0.88875, 6);
    expect(fit.width).toBeCloseTo(1422, 6);
    expect(fit.height).toBeCloseTo(799.875, 6);
    expect(fit.left).toBeCloseTo(9, 6);
    expect(fit.top).toBeCloseTo(50.0625, 6);
  });

  it('fits a 1280x720 viewport, height-bound, centered with a 9px gutter on the constrained axis', () => {
    const fit = computeStageFit(1280, 720);
    expect(fit.scale).toBeCloseTo(0.78, 6);
    expect(fit.width).toBeCloseTo(1248, 6);
    expect(fit.height).toBeCloseTo(702, 6);
    expect(fit.left).toBeCloseTo(16, 6);
    expect(fit.top).toBeCloseTo(9, 6);
  });

  it('fits a tall viewport (900x1600), width-bound with a 9px side gutter', () => {
    const fit = computeStageFit(900, 1600);
    expect(fit.scale).toBeCloseTo(0.55125, 6);
    expect(fit.width).toBeCloseTo(882, 6);
    expect(fit.height).toBeCloseTo(496.125, 6);
    expect(fit.left).toBeCloseTo(9, 6);
    expect(fit.top).toBeCloseTo(551.9375, 6);
  });

  it('fits a wide viewport (3000x900), height-bound with a 9px top/bottom gutter', () => {
    const fit = computeStageFit(3000, 900);
    expect(fit.scale).toBeCloseTo(0.98, 6);
    expect(fit.width).toBeCloseTo(1568, 6);
    expect(fit.height).toBeCloseTo(882, 6);
    expect(fit.left).toBeCloseTo(716, 6);
    expect(fit.top).toBeCloseTo(9, 6);
  });
});
