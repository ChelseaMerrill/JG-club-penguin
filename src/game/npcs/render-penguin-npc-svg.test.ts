// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { renderPenguinNpcSvg } from './render-penguin-npc-svg';

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

function renderRosterPenguin(id: NpcId): string {
  const npc = NPCS[id];
  if (npc.kind !== 'penguin') throw new Error(`expected ${id} to be a Penguin NPC`);
  return renderPenguinNpcSvg(npc.look);
}

// The Room designs' shared Penguin NPC figure, verbatim from Town Center's
// Front Desk (`design/Room 01 Town Center.dc.html`), with its body and cap
// colours swapped in: body and flippers take the body colour, the small brow
// cap takes the cap colour, and nothing else varies.
function designPenguin(body: string, cap: string): string {
  return (
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${body}" stroke="#0C4B5F" stroke-width="6"></path>` +
    '<path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="#F4F4F4"></path>' +
    '<circle cx="50" cy="34" r="4.5" fill="#F4F4F4"></circle>' +
    '<circle cx="70" cy="34" r="4.5" fill="#F4F4F4"></circle>' +
    '<circle cx="51" cy="34" r="2" fill="#161719"></circle>' +
    '<circle cx="71" cy="34" r="2" fill="#161719"></circle>' +
    '<path d="M50 44 L70 44 L60 54 Z" fill="#00BDFF"></path>' +
    '<path d="M40 116 L26 124 L52 122 Z" fill="#00BDFF"></path>' +
    '<path d="M80 116 L94 124 L68 122 Z" fill="#00BDFF"></path>' +
    `<path d="M24 60 C10 78 12 96 26 100 Z" fill="${body}" stroke="#0C4B5F" stroke-width="4"></path>` +
    `<path d="M96 60 C110 78 108 96 94 100 Z" fill="${body}" stroke="#0C4B5F" stroke-width="4"></path>` +
    `<path d="M34 22 C40 8 80 8 86 22 L60 18 Z" fill="${cap}"></path>`
  );
}

describe('renderPenguinNpcSvg', () => {
  it("draws the Room designs' Penguin NPC: brow cap, #0C4B5F stroke, no JG CAP or contrast outline", () => {
    const svg = renderPenguinNpcSvg({ body: '#161719', cap: '#00BDFF' });
    const doc = parse(svg);
    expect(svg).toContain(designPenguin('#161719', '#00BDFF'));
    // Exactly the design's 12 shapes: nothing else (no cap crown, no outline).
    expect(doc.querySelector('svg')!.children).toHaveLength(12);
  });

  it('uses the same padded, feet-anchored frame as the Player Penguin renderer', () => {
    const svgEl = parse(renderPenguinNpcSvg({ body: '#161719', cap: '#00BDFF' })).querySelector(
      'svg',
    )!;
    expect(svgEl.getAttribute('width')).toBe(String(PENGUIN_FRAME_WIDTH));
    expect(svgEl.getAttribute('height')).toBe(String(PENGUIN_FRAME_HEIGHT));
    expect(svgEl.getAttribute('viewBox')).toBe(
      `${-PENGUIN_FRAME_PADDING_X} ${-PENGUIN_FRAME_PADDING_Y} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}`,
    );
  });

  it("gives each Penguin NPC its Room design's body and cap colours", () => {
    expect(renderRosterPenguin('jesse')).toContain(designPenguin('#0C4B5F', '#F4F4F4'));
    expect(renderRosterPenguin('tonya')).toContain(designPenguin('#3a4046', '#0C4B5F'));
    expect(renderRosterPenguin('tristin')).toContain(designPenguin('#3a4046', '#0C4B5F'));
    expect(renderRosterPenguin('kevin')).toContain(designPenguin('#161719', '#F4F4F4'));
    expect(renderRosterPenguin('front-desk')).toContain(designPenguin('#161719', '#F4F4F4'));
    expect(renderRosterPenguin('samantha')).toContain(designPenguin('#161719', '#0C4B5F'));
  });
});
