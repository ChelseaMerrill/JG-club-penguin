import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BEAK_COLORS,
  BODY_COLORS,
  CAP_COLORS,
  DEFAULT_LOOK,
  EYES,
  FEET_COLORS,
  HATS,
  IDLE_EMOTES,
  PATTERNS,
  isHexColor,
} from './penguin';

// Reads the mirrored design file directly rather than comparing against
// literals copied into this test, so the test fails if the contract ever
// drifts from the design instead of drifting alongside a hand-copied fixture.
const designPath = fileURLToPath(new URL('../../design/Penguin Creator.dc.html', import.meta.url));
const design = readFileSync(designPath, 'utf-8');

function extractArray(source: string, pattern: RegExp): string[] {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Pattern not found in design file: ${pattern}`);
  }
  return match[1]
    .split(',')
    .map((item) => item.trim().replace(/^'|'$/g, ''))
    .filter((item) => item.length > 0);
}

function extractStateDefaults(source: string): Record<string, string> {
  const match = source.match(/state\s*=\s*\{([^}]*)\}/);
  if (!match) {
    throw new Error('state = {...} not found in design file');
  }
  const defaults: Record<string, string> = {};
  const pairPattern = /(\w+):\s*'([^']*)'/g;
  let pairMatch: RegExpExecArray | null;
  while ((pairMatch = pairPattern.exec(match[1])) !== null) {
    defaults[pairMatch[1]] = pairMatch[2];
  }
  return defaults;
}

describe('penguin option lists match the mirrored Creator design', () => {
  const state = extractStateDefaults(design);
  const bodyColors = extractArray(design, /const JG = \[([^\]]*)\]/);
  const capColors = extractArray(design, /sw\(\[([^\]]*)\],\s*'cap'\)/);
  const beakColors = extractArray(design, /sw\(\[([^\]]*)\],\s*'beak'\)/);
  const feetColors = extractArray(design, /sw\(\[([^\]]*)\],\s*'feet'\)/);
  const hats = extractArray(design, /hats = \[([^\]]*)\]/);
  const patterns = extractArray(design, /pats = \[([^\]]*)\]/);
  const eyes = extractArray(design, /eyes = \[([^\]]*)\]/);
  const emotes = extractArray(design, /emotes = \[([^\]]*)\]/);

  it('BODY_COLORS matches the design JG palette verbatim, including lowercase #3a4046', () => {
    expect(BODY_COLORS).toEqual(bodyColors);
    expect(BODY_COLORS).toContain('#3a4046');
  });

  it('CAP_COLORS matches the design cap swatch list', () => {
    expect(CAP_COLORS).toEqual(capColors);
  });

  it('BEAK_COLORS matches the design beak swatch list', () => {
    expect(BEAK_COLORS).toEqual(beakColors);
  });

  it('FEET_COLORS matches the design feet swatch list', () => {
    expect(FEET_COLORS).toEqual(feetColors);
  });

  it('HATS matches the design hat option list', () => {
    expect(HATS).toEqual(hats);
  });

  it('PATTERNS matches the design belly pattern option list', () => {
    expect(PATTERNS).toEqual(patterns);
  });

  it('EYES matches the design eye option list', () => {
    expect(EYES).toEqual(eyes);
  });

  it('IDLE_EMOTES is exactly the design emote list minus SNOWBALL and FACEPALM', () => {
    const expected = emotes.filter((emote) => emote !== 'SNOWBALL' && emote !== 'FACEPALM');
    expect(expected).toHaveLength(5);
    expect(IDLE_EMOTES).toEqual(expected);
  });

  it('DEFAULT_LOOK matches the design state defaults', () => {
    expect(DEFAULT_LOOK).toEqual({
      name: state.name,
      body: state.body,
      cap: state.cap,
      beak: state.beak,
      feet: state.feet,
      belly: state.belly,
      hat: state.hat,
      pattern: state.pattern,
      eyes: state.eyes,
      emote: state.emote,
    });
  });
});

describe('isHexColor', () => {
  it('accepts the design lowercase hex color #3a4046', () => {
    expect(isHexColor('#3a4046')).toBe(true);
  });

  it('accepts an uppercase 6-digit hex color', () => {
    expect(isHexColor('#00BDFF')).toBe(true);
  });

  it('rejects a 3-digit hex shorthand', () => {
    expect(isHexColor('#fff')).toBe(false);
  });

  it('rejects a hex value missing the leading #', () => {
    expect(isHexColor('00BDFF')).toBe(false);
  });
});
