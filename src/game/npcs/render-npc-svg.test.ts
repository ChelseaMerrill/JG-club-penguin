// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { renderNpcSvg, type HumanFigureSpec } from './render-npc-svg';

function assertValidSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.querySelector('svg')).not.toBeNull();
  return doc;
}

/** Renders a roster NPC's own figure, with its id as the clip-path prefix. */
function renderRosterNpc(id: NpcId): string {
  const npc = NPCS[id];
  if (npc.kind !== 'human') throw new Error(`expected ${id} to be a Human NPC`);
  const svg = renderNpcSvg(npc.figure, { idPrefix: id });
  assertValidSvg(svg);
  return svg;
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

  // #113: each Room design's own figure markup, where it differs from
  // humans.js. Expected markup is copied from the figure each Room design
  // bakes (the audit's element-by-element figure diff).
  it("draws Ian's dotted stubble in both his Rooms, not humans.js's full beard", () => {
    for (const id of ['ian', 'ian-team-room-2'] as const) {
      const svg = renderRosterNpc(id);
      expect(svg).toContain(
        '<path d="M38 47 Q42 64 60 64.5 Q78 64 82 47 Q77 57 68 57 Q60 55 52 57 Q43 57 38 47 Z" fill="#8A7A6E" opacity=".22">',
      );
      expect(svg.match(/r="\.7" fill="#5A4A3E" opacity="\.55"/g), id).toHaveLength(19);
      expect(svg).toContain('<circle cx="60" cy="62.5" r=".7" fill="#5A4A3E" opacity=".55">');
      expect(svg).not.toContain('M38 44 C38 66 48 72 60 72');
    }
  });

  it("draws Tom's green Kitchen apron over his shirt, clipped to the torso", () => {
    const svg = renderRosterNpc('tom');
    expect(svg).toContain(
      '<g clip-path="url(#npc-tomt)"><path d="M47 67 L50 76 M73 67 L70 76" stroke="#2F6B3A" stroke-width="2.5" stroke-linecap="round">',
    );
    expect(svg).toContain(
      '<path d="M47 76 H73 V86 H78 L80 110 H40 L42 86 H47 Z" fill="#3E8E4E" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain('<rect x="34" y="85" width="52" height="3" fill="#2F6B3A">');
    expect(svg).toContain(
      '<rect x="52" y="93" width="16" height="9" rx="2" fill="none" stroke="#2F6B3A" stroke-width="1.8">',
    );
  });

  it("draws Chelsea's textured hair and pleated toque, not the curls and puffy chef's hat", () => {
    const svg = renderRosterNpc('chelsea');
    expect(svg).toContain(
      '<path d="M32 28 Q18 32 25 42 Q14 50 23 58 Q12 66 21 74 Q11 82 21 90 Q14 99 28 102 L92 102 Q106 99 99 90 Q109 82 99 74 Q108 66 97 58 Q106 50 95 42 Q102 32 88 28 Z" fill="#E5C27A" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<path d="M33 42 C30 18 48 9 60 11 C74 10 90 18 87 42 Q86 33 80 33 Q77 25 70 28 Q64 22 58 27 Q50 22 46 30 Q38 29 33 42 Z" fill="#E5C27A" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<path d="M40 22 C27 21 23 5 35 1 C34 -10 49 -13 54 -5 C58 -14 73 -13 75 -4 C86 -9 96 4 86 12 C92 16 88 23 80 22 Z" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<rect x="36" y="19" width="48" height="12" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<path d="M44 20 V30 M52 20 V30 M60 20 V30 M68 20 V30 M76 20 V30" stroke="#B3B6C9" stroke-width="1.4">',
    );
    expect(svg).not.toContain('<circle cx="30" cy="50" r="6"');
    expect(svg).not.toContain('M36 26 L36 14');
  });

  it("draws Jory's SURVIVOR headband and tee (humans.js's `hutchins`)", () => {
    const svg = renderRosterNpc('jory');
    expect(svg).toContain(
      '<path d="M35 28 L85 28 L85 36 L35 36 Z" fill="#E07A2F" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<path d="M84 30 L92 26 L96 40 L90 44 Z" fill="#E07A2F" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toMatch(/<path d="[^"]+" fill="#F2C12E" clip-path="url\(#npc-joryt\)">/);
    expect(svg).toContain(
      '<path d="M48 96 q12 4 24 0" fill="none" stroke="#E07A2F" stroke-width="1.5" clip-path="url(#npc-joryt)">',
    );
  });

  it("puts Jon's three playing cards in his right hand, scarf kept", () => {
    const svg = renderRosterNpc('jon');
    expect(svg).toContain('<path d="M40 66 L60 78 L80 66 L80 74 L60 88 L40 74 Z"');
    expect(svg).toContain(
      '<g transform="translate(96 84) rotate(-12)"><rect x="0" y="0" width="16" height="22" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain('<rect x="6" y="-6" width="16" height="22" rx="2"');
    expect(svg).toContain('<path d="M14 -1 l2 3 l-2 3 l-2 -3 z" fill="#00BDFF">');
  });

  it("raises a whiteboard marker for Dev Pit's Ryan and Sam (cyan) and Steven (red)", () => {
    const markers: [NpcId, string, string, string][] = [
      ['ryan', '#1f2a4a', '#F3D3B8', '#00BDFF'],
      ['sam', '#1f2a4a', '#F3D3B8', '#00BDFF'],
      ['steven', '#2B3557', '#E4B896', '#D63C3C'],
    ];
    for (const [id, arm, hand, marker] of markers) {
      const svg = renderRosterNpc(id);
      expect(svg, id).toContain(
        `<path d="M92 78 L112 56" stroke="${arm}" stroke-width="6" stroke-linecap="round">`,
      );
      expect(svg, id).toContain(
        `<circle cx="113" cy="54" r="5.5" fill="${hand}" stroke="#0C4B5F" stroke-width="2">`,
      );
      expect(svg, id).toContain(
        `<rect x="110" y="44" width="6" height="14" rx="2" fill="${marker}" stroke="#0C4B5F" stroke-width="1.5">`,
      );
    }
    for (const id of ['ryan-team-room-4', 'sam-team-room-4'] as const) {
      expect(renderRosterNpc(id), id).not.toContain('M92 78 L112 56');
    }
  });

  it("gives Roof Deck's Anthony a fishing rod with the FREE $$$ envelope bait instead of his laptop", () => {
    const svg = renderRosterNpc('anthony');
    expect(svg).toContain(
      '<path d="M92 96 L118 10" stroke="#C9A366" stroke-width="3.5" stroke-linecap="round">',
    );
    expect(svg).toContain('<path d="M118 10 L118 70" stroke="#F4F4F4" stroke-width="1.2">');
    expect(svg).toContain(
      '<rect x="108" y="72" width="20" height="14" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<path d="M108 72 L118 80 L128 72" stroke="#0C4B5F" stroke-width="1.5" fill="none">',
    );
    expect(svg).toMatch(/<path d="[^"]+" fill="#00BDFF"><\/path><\/svg>$/);
    expect(svg).not.toContain('<rect x="86" y="84" width="22" height="14"');
    // The Hallway design still draws his laptop.
    expect(renderRosterNpc('anthony-hallway')).toContain(
      '<rect x="86" y="84" width="22" height="14"',
    );
  });

  it("straps the Icebox design's camera rig to Jethro's chest", () => {
    const svg = renderRosterNpc('jethro');
    expect(svg).toContain(
      '<rect x="40" y="70" width="40" height="26" rx="4" fill="#161719" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<circle cx="60" cy="83" r="9" fill="#2f3338" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="66" y="66" width="10" height="6" rx="1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(renderRosterNpc('jethro-team-room-1')).not.toContain('<rect x="40" y="70" width="40"');
  });

  it('seats Nicole with a laptop on her lap, the whole figure lowered 14 px', () => {
    const svg = renderRosterNpc('nicole');
    expect(svg).toContain('<g transform="translate(0 14)">');
    expect(svg).toContain(
      '<path d="M30 104 Q60 92 90 104 L96 112 Q60 122 24 112 Z" fill="#1d1f22" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="44" y="84" width="32" height="20" rx="2" fill="#2f3338" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="42" y="103" width="36" height="3" fill="#161719" stroke="#0C4B5F" stroke-width="1.5">',
    );
  });

  it("never draws a <text> element (an SVG loaded as a Phaser texture can't use page web fonts)", () => {
    for (const figure of humanFigures) {
      expect(renderNpcSvg(figure)).not.toContain('<text');
    }
  });
});
