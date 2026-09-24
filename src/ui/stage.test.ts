// @vitest-environment jsdom
// stage.ts imports GAME_WIDTH/GAME_HEIGHT from game/config, which imports
// Phaser; Phaser reads `window` at import time, so this file needs a DOM
// environment (see game/config.test.ts).
import { describe, expect, it } from 'vitest';
import { computeStageFit } from './stage';

describe('computeStageFit', () => {
  it('fits a 1920x1080 viewport, height-bound, centred with a 9px gutter on the short axis', () => {
    expect(computeStageFit(1920, 1080)).toEqual({
      scale: 1.18,
      width: 1888,
      height: 1062,
      left: 16,
      top: 9,
    });
  });

  it('fits a 1440x900 viewport, width-bound, centred with a 9px gutter on the short axis', () => {
    expect(computeStageFit(1440, 900)).toEqual({
      scale: 0.88875,
      width: 1422,
      height: 799.875,
      left: 9,
      top: 50.0625,
    });
  });

  it('fits a 1280x720 viewport, height-bound, centred with a 9px gutter on the short axis', () => {
    expect(computeStageFit(1280, 720)).toEqual({
      scale: 0.78,
      width: 1248,
      height: 702,
      left: 16,
      top: 9,
    });
  });

  it('fits a tall viewport (900x1600), width-bound with a 9px side gutter', () => {
    expect(computeStageFit(900, 1600)).toEqual({
      scale: 0.55125,
      width: 882,
      height: 496.125,
      left: 9,
      top: 551.9375,
    });
  });

  it('fits a wide viewport (3000x900), height-bound with a 9px top/bottom gutter', () => {
    expect(computeStageFit(3000, 900)).toEqual({
      scale: 0.98,
      width: 1568,
      height: 882,
      left: 716,
      top: 9,
    });
  });
});
