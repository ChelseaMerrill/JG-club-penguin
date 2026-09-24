// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, HATS, PATTERNS, type PenguinAppearance } from './appearance';
import { renderPenguinSvg } from './penguin-svg';

const appearance: PenguinAppearance = {
  ...DEFAULT_APPEARANCE,
  name: 'Waddles',
  body: '#123456',
  cap: '#abcdef',
  beak: '#f2c12e',
  feet: '#e07a2f',
};

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.documentElement as unknown as SVGSVGElement;
}

describe('renderPenguinSvg', () => {
  it('produces well-formed SVG for every hat and pattern', () => {
    for (const hat of HATS) {
      for (const pattern of PATTERNS) {
        parse(renderPenguinSvg({ ...appearance, hat, pattern }));
      }
    }
  });

  it('paints each color part', () => {
    const svg = renderPenguinSvg(appearance);
    for (const color of ['#123456', '#abcdef', '#f2c12e', '#e07a2f']) {
      expect(svg).toContain(`fill="${color}"`);
    }
  });

  it('never includes the name', () => {
    expect(renderPenguinSvg({ ...appearance, name: '<script>x</script>' })).not.toContain(
      'script',
    );
  });

  it('draws no hat for NONE', () => {
    const withCap = parse(renderPenguinSvg({ ...appearance, hat: 'JG CAP' }));
    const bare = parse(renderPenguinSvg({ ...appearance, hat: 'NONE' }));
    expect(bare.querySelectorAll('path').length).toBeLessThan(withCap.querySelectorAll('path').length);
  });

  it('closes the eyes and shows HA HA while laughing', () => {
    const svg = renderPenguinSvg({ ...appearance, eyes: 'STAR' }, { emote: 'LAUGH' });
    expect(svg).toContain('HA HA');
    expect(svg).toContain('Q50 30 55 35'); // the SLEEPY eye curve
    expect(svg).not.toContain('51.8,32.5'); // a STAR eye point
  });

  it('shows a snowball only for the SNOWBALL emote', () => {
    expect(renderPenguinSvg(appearance, { emote: 'SNOWBALL' })).toContain('penguin-svg__snowball');
    expect(renderPenguinSvg(appearance, { emote: 'WAVE' })).not.toContain('penguin-svg__snowball');
  });

  it('scopes the belly clip-path id with idPrefix', () => {
    const svg = renderPenguinSvg(appearance, { idPrefix: 'npc-7' });
    expect(svg).toContain('id="npc-7-belly"');
    expect(svg).toContain('url(#npc-7-belly)');
  });
});
