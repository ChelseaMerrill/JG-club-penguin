// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';
import { NPCS } from '../../npcs/npcs';
import { renderNpcSvg, type HumanFigureSpec } from './render-npc-svg';

function assertValidSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.querySelector('svg')).not.toBeNull();
  return doc;
}

const humanFigures: HumanFigureSpec[] = Object.values(NPCS)
  .filter((npc) => npc.kind === 'human')
  .map((npc) => npc.figure);

describe('renderNpcSvg', () => {
  it('produces valid SVG for every Human NPC figure in the roster', () => {
    expect(humanFigures.length).toBeGreaterThan(0);
    for (const figure of humanFigures) {
      assertValidSvg(renderNpcSvg(figure));
    }
  });

  it('uses the same padded frame size as the Penguin renderer, anchored the same way', () => {
    const svg = renderNpcSvg(humanFigures[0]!);
    const doc = assertValidSvg(svg);
    const svgEl = doc.querySelector('svg')!;

    expect(svgEl.getAttribute('width')).toBe(String(PENGUIN_FRAME_WIDTH));
    expect(svgEl.getAttribute('height')).toBe(String(PENGUIN_FRAME_HEIGHT));

    const viewBox = svgEl.getAttribute('viewBox');
    expect(viewBox).toBe(
      `${-PENGUIN_FRAME_PADDING_X} ${-PENGUIN_FRAME_PADDING_Y} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}`,
    );
  });

  it("carries a figure's own top/jacket colour", () => {
    const figure: HumanFigureSpec = {
      style: 'short',
      hair: 'brown',
      skin: 'fair',
      top: '#123456',
      jacket: '#abcdef',
      collar: 'crew',
      mouth: 'flat',
    };
    const svg = renderNpcSvg(figure);
    assertValidSvg(svg);
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#abcdef"');
  });

  // #51: the Icebox's Jason and Jethro use three `humans.js` options the
  // earlier Rooms never needed. Expected markup is copied from the figures
  // `design/Room 03 The Icebox.dc.html` bakes for them.
  it("draws humans.js's buzz cut as a translucent cap of the hair colour", () => {
    const svg = renderNpcSvg({ style: 'buzz', hair: 'brown', skin: 'fair' });
    assertValidSvg(svg);
    expect(svg).toContain(
      '<path d="M37 30 C40 20 50 16 60 16 C70 16 80 20 83 30 C76 26 44 26 37 30 Z" fill="#5e4128" opacity=".55">',
    );
  });

  it("draws humans.js's plaid shirt pattern as clipped horizontal and vertical stripes", () => {
    const svg = renderNpcSvg(
      { top: '#F4F4F4', pattern: 'plaid', pattern2: '#8FB5D8' },
      { idPrefix: 'plaid' },
    );
    const doc = assertValidSvg(svg);
    const stripes = [...doc.querySelectorAll('rect[clip-path="url(#npc-plaidt)"]')];
    const horizontal = stripes.filter((rect) => rect.getAttribute('width') === '52');
    const vertical = stripes.filter((rect) => rect.getAttribute('height') === '44');
    expect(horizontal.map((rect) => rect.getAttribute('y'))).toEqual([
      '70',
      '79',
      '88',
      '97',
      '106',
    ]);
    expect(vertical.map((rect) => rect.getAttribute('x'))).toEqual([
      '38',
      '47',
      '56',
      '65',
      '74',
      '83',
    ]);
    for (const rect of stripes) {
      expect(rect.getAttribute('fill')).toBe('#8FB5D8');
      expect(rect.getAttribute('opacity')).toBe('.8');
    }
  });

  it("draws humans.js's camera prop, lens and red record light included", () => {
    const svg = renderNpcSvg({ prop: 'camera' });
    assertValidSvg(svg);
    expect(svg).toContain(
      '<rect x="84" y="82" width="26" height="18" rx="3" fill="#161719" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<circle cx="97" cy="91" r="6" fill="#0a3d4d" stroke="#00BDFF" stroke-width="2">',
    );
    expect(svg).toContain('<rect x="104" y="85" width="3" height="3" fill="#D63C3C">');
  });

  // #51: Team Room 4's Michael Prete holds a beyblade in each hand, a
  // `humans.js` prop no earlier Room needed. Expected markup is copied from
  // the figure `design/Team Room 4.dc.html` bakes for him.
  it("draws humans.js's beyblade prop, one top in each hand", () => {
    const svg = renderNpcSvg({ prop: 'beyblade' });
    assertValidSvg(svg);
    expect(svg).toContain(
      '<circle cx="18" cy="96" r="11" fill="#00BDFF" stroke="#F4F4F4" stroke-width="3">',
    );
    expect(svg).toContain(
      '<path d="M18 85 L18 107 M7 96 L29 96 M10 88 L26 104 M26 88 L10 104" stroke="#161719" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<circle cx="102" cy="96" r="11" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="3">',
    );
    expect(svg).toContain(
      '<path d="M102 85 L102 107 M91 96 L113 96 M94 88 L110 104 M110 88 L94 104" stroke="#0C4B5F" stroke-width="1.5">',
    );
  });

  it("never draws a <text> element (an SVG loaded as a Phaser texture can't use page web fonts)", () => {
    for (const figure of humanFigures) {
      expect(renderNpcSvg(figure)).not.toContain('<text');
    }
  });
});
