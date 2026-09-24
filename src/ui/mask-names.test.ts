import { describe, expect, it } from 'vitest';
import { isMaskNamesEnabled, maskName, MASKED_NAME } from './mask-names';

describe('isMaskNamesEnabled', () => {
  it('is true only when the masknames URL param is present', () => {
    expect(isMaskNamesEnabled('?debug&masknames')).toBe(true);
    expect(isMaskNamesEnabled('?debug')).toBe(false);
  });
});

describe('maskName', () => {
  it('replaces the name with a fixed mask when masknames is on', () => {
    expect(maskName('Waddles', '?masknames')).toBe('•••');
    expect(MASKED_NAME).toBe('•••');
  });

  it('returns the name unchanged when masknames is off', () => {
    expect(maskName('Waddles', '?debug')).toBe('Waddles');
  });
});
