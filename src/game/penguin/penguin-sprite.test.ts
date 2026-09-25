// @vitest-environment jsdom
// Phaser reads `window` at import time, so this file needs a DOM environment.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../contracts';
import { nameTagText } from './penguin-sprite';

describe('nameTagText', () => {
  it('returns the name when it is not empty', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: 'Waddles' })).toBe('Waddles');
  });

  it('returns null for an empty name, so the tag is hidden with no placeholder (#75)', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: '' })).toBeNull();
  });
});
