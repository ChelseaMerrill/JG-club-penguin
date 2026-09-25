import { describe, expect, it } from 'vitest';
import {
  BODY_COLORS,
  DEFAULT_LOOK,
  EYES,
  HATS,
  PATTERNS,
  PENGUIN_NAME_MAX,
  isHexColor,
  type PenguinLook,
} from '../contracts';
import { normalizeName, sameColor, shuffleLook, toHexColor } from './look';

const look: PenguinLook = {
  ...DEFAULT_LOOK,
  name: 'Waddles',
  hat: 'SNORKEL',
  pattern: 'HEX',
  eyes: 'STAR',
  emote: 'DANCE',
};

/** Deterministic RNG cycling through the given values. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Ada   Lovelace \n')).toBe('Ada Lovelace');
  });

  it('drops control characters', () => {
    expect(normalizeName('Ad\u0000a\u0007')).toBe('Ada');
  });

  it(`caps the name at ${PENGUIN_NAME_MAX} characters`, () => {
    expect(normalizeName('x'.repeat(50))).toHaveLength(PENGUIN_NAME_MAX);
  });

  it('counts code points, so an emoji is never split in half', () => {
    const name = normalizeName('🐧'.repeat(20));
    expect(Array.from(name)).toHaveLength(PENGUIN_NAME_MAX);
    expect(name).toBe('🐧'.repeat(PENGUIN_NAME_MAX));
  });

  it('never leaves trailing whitespace after capping', () => {
    expect(normalizeName('abcdefghijklmno pqr')).toBe('abcdefghijklmno');
  });
});

describe('toHexColor', () => {
  it('accepts 6-digit hex in either case', () => {
    expect(toHexColor('#abcdef')).toBe('#abcdef');
    expect(toHexColor('#ABCDEF')).toBe('#ABCDEF');
  });

  it.each(['red', '#fff', 'abcdef', '#abcdefg'])('rejects %s', (value) => {
    expect(toHexColor(value)).toBeNull();
  });
});

describe('sameColor', () => {
  it('ignores case', () => {
    expect(sameColor('#00BDFF', '#00bdff')).toBe(true);
    expect(sameColor('#00BDFF', '#00bdfe')).toBe(false);
  });
});

describe('shuffleLook', () => {
  it('keeps the name, belly and Idle animation and always produces a valid look', () => {
    for (let i = 0; i < 200; i++) {
      const shuffled = shuffleLook(look);
      expect(shuffled.name).toBe('Waddles');
      expect(shuffled.belly).toBe(look.belly);
      expect(shuffled.emote).toBe('DANCE');
      for (const color of [shuffled.body, shuffled.cap, shuffled.beak, shuffled.feet]) {
        expect(isHexColor(color)).toBe(true);
      }
      expect(HATS).toContain(shuffled.hat);
      expect(PATTERNS).toContain(shuffled.pattern);
      expect(EYES).toContain(shuffled.eyes);
    }
  });

  it('picks the body from the JG palette when the first roll is under 0.6', () => {
    const shuffled = shuffleLook(look, sequence(0.1, 0.5));
    expect(BODY_COLORS).toContain(shuffled.body);
  });

  it('reaches every hat, pattern and eyes option', () => {
    const lastIndex = (n: number) => (n - 0.5) / n;
    const shuffled = shuffleLook(
      look,
      sequence(0.9, 0, 0, 0, 0, lastIndex(HATS.length), lastIndex(PATTERNS.length), 0.99),
    );
    expect(shuffled.hat).toBe(HATS[HATS.length - 1]);
    expect(shuffled.pattern).toBe(PATTERNS[PATTERNS.length - 1]);
    expect(shuffled.eyes).toBe(EYES[EYES.length - 1]);
  });
});
