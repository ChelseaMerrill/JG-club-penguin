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

  it("never draws a <text> element (an SVG loaded as a Phaser texture can't use page web fonts)", () => {
    for (const figure of humanFigures) {
      expect(renderNpcSvg(figure)).not.toContain('<text');
    }
  });
});
