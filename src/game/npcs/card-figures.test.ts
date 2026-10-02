import { describe, expect, it } from 'vitest';
import { NPCS } from '../../npcs/npcs';
import { CARD_FIGURES, renderCardFigure } from './card-figures';
import { renderNpcSvg } from './render-npc-svg';
import { NPC_TEXT_PATHS } from './text-paths';

describe('card figures (the Characters sheet drawn verbatim)', () => {
  it('draws each new Dev Pit person from their own card, with a per-NPC clip id', () => {
    for (const [id, card] of [
      ['jesse-lucier', 'jesseLucier'],
      ['alex-kelly', 'alexKelly'],
      ['alex-nikolis', 'alexNikolis'],
    ] as const) {
      const npc = NPCS[id];
      if (npc.kind !== 'human') throw new Error(`${id} should be a Human NPC`);
      expect(npc.figure, id).toEqual({ card });
      const svg = renderNpcSvg(npc.figure, { idPrefix: id });
      expect(svg, id).toContain(`<clipPath id="npc-${id}t">`);
      expect(svg, id).not.toContain('__ID__');
      expect(svg, id).not.toContain('<text');
    }
  });

  it("keeps Jesse's kettlebell weight as a pre-baked outline, not font text", () => {
    const svg = renderCardFigure('jesseLucier', 'x');
    expect(svg).toContain(`<path d="${NPC_TEXT_PATHS.kettlebell24.d}" fill="#00BDFF"></path>`);
    // The kettlebell itself, verbatim from his card.
    expect(svg).toContain('<circle cx="92" cy="112" r="11" fill="#2a2d31"');
  });

  it("has nothing a texture can't draw: no font text, no SMIL", () => {
    for (const markup of Object.values(CARD_FIGURES)) {
      expect(markup).not.toMatch(/<text|<animate|<image/);
    }
  });
});
