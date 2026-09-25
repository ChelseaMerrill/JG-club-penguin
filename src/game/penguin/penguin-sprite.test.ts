// @vitest-environment jsdom
// Phaser reads `window` at import time, so this file needs a DOM environment.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../contracts';
import { BUBBLE_ANCHOR_Y, nameTagText, PLAYER_PENGUIN_SCALE } from './penguin-sprite';

describe('nameTagText', () => {
  it('returns the name when it is not empty', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: 'Waddles' })).toBe('Waddles');
  });

  it('returns null for an empty name, so the tag is hidden with no placeholder (#75)', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: '' })).toBeNull();
  });
});

describe('BUBBLE_ANCHOR_Y (#131 review fix)', () => {
  it('scales the sprite-top-edge term by PLAYER_PENGUIN_SCALE but not the fixed gap above it', () => {
    // Independently worked out from the design constants this formula is
    // built from (PENGUIN_ORIGIN.y = 120, PENGUIN_FRAME_PADDING_Y = 30) and
    // the locked #131 scale (0.58), rather than re-deriving the production
    // formula: -(120 + 30) * 0.58 - 10 = -97.
    expect(PLAYER_PENGUIN_SCALE).toBe(0.58);
    expect(BUBBLE_ANCHOR_Y).toBeCloseTo(-97, 5);
  });
});
