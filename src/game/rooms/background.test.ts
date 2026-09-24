import { describe, expect, it } from 'vitest';
import { planBackgroundDraw } from './background';

describe('planBackgroundDraw', () => {
  it('draws the procedural floor for a procedural background', () => {
    expect(planBackgroundDraw({ kind: 'procedural' })).toEqual({ kind: 'procedural' });
  });

  it('draws the exported image, by its preload key, for an image background', () => {
    expect(
      planBackgroundDraw({
        kind: 'image',
        key: 'town-center-bg',
        url: '/rooms/town-center.png',
      }),
    ).toEqual({ kind: 'image', key: 'town-center-bg' });
  });
});
