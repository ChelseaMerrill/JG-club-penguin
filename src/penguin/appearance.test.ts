import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  EYES,
  HATS,
  MAX_NAME_LENGTH,
  PATTERNS,
  SWATCHES,
  defaultAppearanceFor,
  normalizeName,
  parseAppearance,
  shuffleAppearance,
  type PenguinAppearance,
} from './appearance';

const valid: PenguinAppearance = {
  name: 'Waddles',
  body: '#161719',
  cap: '#00bdff',
  beak: '#f2c12e',
  feet: '#e07a2f',
  hat: 'SNORKEL',
  pattern: 'HEX',
  eyes: 'STAR',
};

/** Deterministic RNG cycling through the given values. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('DEFAULT_APPEARANCE', () => {
  it('matches the design defaults', () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      name: '',
      body: '#161719',
      cap: '#00bdff',
      beak: '#00bdff',
      feet: '#00bdff',
      hat: 'JG CAP',
      pattern: 'PLAIN',
      eyes: 'ROUND',
    });
  });
});

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Ada   Lovelace \n')).toBe('Ada Lovelace');
  });

  it('drops control characters', () => {
    expect(normalizeName('Ad\u0000a\u0007')).toBe('Ada');
  });

  it(`caps the name at ${MAX_NAME_LENGTH} characters`, () => {
    expect(normalizeName('x'.repeat(50))).toHaveLength(MAX_NAME_LENGTH);
  });
});

describe('defaultAppearanceFor', () => {
  it('pre-fills the name from the Google display name', () => {
    expect(defaultAppearanceFor('Ada Lovelace')).toEqual({
      ...DEFAULT_APPEARANCE,
      name: 'Ada Lovelace',
    });
  });

  it('shortens a long email-style display name to the name limit', () => {
    expect(defaultAppearanceFor('someone.with.a.long.name@example.com').name).toHaveLength(
      MAX_NAME_LENGTH,
    );
  });
});

describe('parseAppearance', () => {
  it('accepts a valid appearance', () => {
    expect(parseAppearance(valid)).toEqual(valid);
  });

  it('lowercases colors', () => {
    expect(parseAppearance({ ...valid, body: '#ABCDEF' })?.body).toBe('#abcdef');
  });

  it('drops unknown extra keys', () => {
    expect(parseAppearance({ ...valid, igloo: 'DEV CAVE' })).toEqual(valid);
  });

  it.each([
    ['null (never saved)', null],
    ['an array', []],
    ['a string', 'penguin'],
    ['an empty name', { ...valid, name: '   ' }],
    ['a missing color', { ...valid, cap: undefined }],
    ['a named color', { ...valid, body: 'red' }],
    ['a short hex color', { ...valid, feet: '#fff' }],
    ['an unknown hat', { ...valid, hat: 'TOP HAT' }],
    ['an unknown pattern', { ...valid, pattern: 'PLAID' }],
    ['unknown eyes', { ...valid, eyes: 'LASER' }],
  ])('rejects %s', (_label, value) => {
    expect(parseAppearance(value)).toBeNull();
  });
});

describe('shuffleAppearance', () => {
  it('keeps the name and always produces a valid appearance', () => {
    for (let i = 0; i < 200; i++) {
      const shuffled = shuffleAppearance(valid);
      expect(shuffled.name).toBe('Waddles');
      expect(parseAppearance(shuffled)).toEqual(shuffled);
    }
  });

  it('picks the body from the JG palette when the first roll is under 0.6', () => {
    const shuffled = shuffleAppearance(valid, sequence(0.1, 0.5));
    expect(SWATCHES.body).toContain(shuffled.body);
  });

  it('reaches every hat, pattern and eyes option', () => {
    const lastIndex = (n: number) => (n - 0.5) / n;
    const shuffled = shuffleAppearance(
      valid,
      sequence(0.9, 0, 0, 0, 0, lastIndex(HATS.length), lastIndex(PATTERNS.length), 0.99),
    );
    expect(shuffled.hat).toBe(HATS[HATS.length - 1]);
    expect(shuffled.pattern).toBe(PATTERNS[PATTERNS.length - 1]);
    expect(shuffled.eyes).toBe(EYES[EYES.length - 1]);
  });
});
