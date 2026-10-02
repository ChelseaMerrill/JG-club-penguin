// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { getNpcMotion } from '../../npcs/npc-motions';
import { renderNpcPropSvg, renderNpcSvg, type HumanFigureSpec } from './render-npc-svg';

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

  it("draws Sam Schantz as the Characters sheet's card: curly hair, striped shirt, tinted glasses, singing into a mic", () => {
    // Verbatim from design/Characters.dc.html's SAM SCHANTZ card.
    const svg = renderRosterNpc('sam-team-room-4');
    expect(svg).toContain(
      '<rect x="43" y="118" width="17" height="7" rx="3.5" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="34" y="76" width="52" height="3.5" fill="#F2C94C" clip-path="url(#npc-sam-team-room-4t)">',
    );
    expect(svg).toContain(
      '<rect x="24" y="70" width="12" height="30" rx="6" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2.5" transform="rotate(120 30 74)">',
    );
    expect(svg).toContain(
      '<circle cx="57" cy="15" r="7.5" fill="#4A3326" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<path d="M43 35 H57 V41 Q57 45 50 45 Q43 45 43 41 Z M63 35 H77 V41 Q77 45 70 45 Q63 45 63 41 Z" fill="#B9A7D9" fill-opacity=".3" stroke="none">',
    );
    expect(svg).toContain(
      '<ellipse cx="60" cy="54" rx="5" ry="3.5" fill="#6B2B2B" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<circle cx="67" cy="52" r="4" fill="#5A5F68" stroke="#161719" stroke-width="1.5">',
    );
    // Not the old humans.js look: no spiky hair, no coffee.
    expect(svg).not.toContain('M36 34 C34 22 40 12 46 16');
    expect(svg).not.toContain('<rect x="88" y="86" width="16" height="16"');
  });

  it("draws Ryan Shendler as the Characters sheet's card: headphones, glasses, DJ deck with lit keys", () => {
    // Verbatim from design/Characters.dc.html's RYAN SHENDLER card.
    const svg = renderRosterNpc('ryan-team-room-4');
    expect(svg).toContain(
      '<rect x="46" y="104" width="12" height="18" rx="3" fill="#2B3557" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<circle cx="60" cy="40" r="26" fill="#F2C9A8" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<path d="M36 34 C36 16 48 11 60 11 C72 11 84 16 84 34 C80 26 72 23 60 23 C48 23 40 26 36 34 Z" fill="#8A7458" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="43" y="35" width="14" height="10" rx="2" fill="#F4F4F4" fill-opacity=".25" stroke="#1E2A4A" stroke-width="1.6">',
    );
    expect(svg).toContain(
      '<path d="M31 40 C29 10 91 10 89 40" fill="none" stroke="#00BDFF" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="30" y="90" width="60" height="18" rx="3" fill="#1d1f22" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain('<rect x="36" y="94" width="10" height="5" rx="1" fill="#00BDFF">');
    // Not the old humans.js look: no stubble, no laptop.
    expect(svg).not.toContain('<rect x="86" y="84" width="22" height="14"');
    expect(svg).not.toContain('M40 46 C42 62 50 66 60 66');
  });

  it("drops the sheet figures' held props when told to, for their motions to redraw", () => {
    for (const id of ['sam-team-room-4', 'ryan-team-room-4'] as const) {
      const npc = NPCS[id];
      if (npc.kind !== 'human') throw new Error(`expected ${id} to be a Human NPC`);
      const svg = renderNpcSvg({ ...npc.figure, prop: undefined }, { idPrefix: id });
      assertValidSvg(svg);
      expect(svg, id).not.toContain('<ellipse cx="60" cy="54" rx="5" ry="3.5"');
      expect(svg, id).not.toContain('<rect x="30" y="90" width="60" height="18"');
      // The rest of the card stays.
      expect(svg, id).toContain('<rect x="54" y="58" width="12" height="12"');
    }
  });

  it("raises a whiteboard marker for Dev Pit's Ryan and Sam (cyan), and not Steven", () => {
    const markers: [NpcId, string, string, string][] = [
      ['ryan', '#1f2a4a', '#F3D3B8', '#00BDFF'],
      ['sam', '#1f2a4a', '#F3D3B8', '#00BDFF'],
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
    for (const id of ['ryan-team-room-4', 'sam-team-room-4', 'steven'] as const) {
      expect(renderRosterNpc(id), id).not.toContain('M92 78 L112 56');
    }
  });

  it("draws Steven as design/Characters.dc.html's STEVEN ZGALJIC card does", () => {
    const svg = renderRosterNpc('steven');
    // Grey `shortDark` hair, and no beard or grey streaks.
    expect(svg).toContain(
      '<path d="M35 34 C32 14 48 8 62 10 C78 12 88 18 85 34 C80 24 40 22 35 34 Z" fill="#6E7075" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).not.toContain('M38 44 C38 66 48 72 60 72');
    expect(svg).not.toContain('stroke="#B3B6C9"');
    // The green android badge on his jacket.
    expect(svg).toContain('<g transform="translate(44 82)">');
    expect(svg).toContain('fill="#7ED957"');
    // Medium skin, navy dotted shirt, black jacket, smirk.
    expect(svg).toContain('<circle cx="60" cy="40" r="25" fill="#E4B896"');
    expect(svg).toContain('fill="#2B3557"');
    expect(svg).toContain('<path d="M34 78 L34 110 L52 110 L54 72 L44 66 Z" fill="#161719"');
    expect(svg).toContain('<path d="M52 53 Q62 58 68 52"');
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

  it("draws the Icebox's Jethro with Team Room 1's lowered camera, not a chest rig", () => {
    // He takes photos as he walks, as in Team Room 1 (owner request,
    // 2026-10-01, Track D), so the chest rig would be a second camera.
    const svg = renderRosterNpc('jethro');
    expect(svg).not.toContain('<rect x="40" y="70" width="40" height="26"');
    expect(svg).toContain(
      '<rect x="84" y="82" width="26" height="18" rx="3" fill="#161719" stroke="#0C4B5F" stroke-width="2">',
    );
    // The same figure as Team Room 1's, apart from its element ids.
    expect(svg.replaceAll('npc-jethro', 'npc-jethro-team-room-1')).toBe(
      renderRosterNpc('jethro-team-room-1'),
    );
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

  it("dresses Team Room 1's and the Mullet's Dom in the design's running kit, and not the Dev Pit's", () => {
    // Verbatim from `design/Team Room 1.dc.html` (and `design/Characters.dc.html`'s sheet).
    const svg = renderRosterNpc('dom-team-room-1');
    const tankTop =
      '<path d="M42 66 H50 Q60 76 70 66 H78 L84 94 H36 Z" fill="#D9534F" stroke="#0C4B5F" stroke-width="2">';
    expect(svg).toContain(tankTop);
    expect(svg).toContain('<rect x="34" y="92" width="52" height="18" fill="#161719">');
    expect(svg).toContain(
      '<rect x="50" y="77" width="20" height="12" rx="1.5" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<path d="M35.5 27 Q60 19 84.5 27 L85 33 Q60 25 35 33 Z" fill="#D9534F" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="24" y="86" width="12" height="5" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.5">',
    );
    expect(svg).toContain(
      '<path d="M42 117 H58 Q61 117 61 121 V125 H42 Q39 125 39 121 Q39 117 42 117 Z" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2">',
    );
    // Bare legs and arms, and a bare torso under the tank top.
    expect(svg).toContain(
      '<rect x="47" y="104" width="10" height="16" rx="3" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<rect x="34" y="66" width="52" height="44" rx="12" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).toContain(
      '<rect x="24" y="70" width="12" height="30" rx="6" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2.5">',
    );
    expect(svg).not.toContain('<rect x="46" y="104" width="12" height="18"');
    // His laptop, as in the design.
    expect(svg).toContain('<rect x="86" y="84" width="22" height="14"');
    // The Mullet's Dom wears the same kit (owner request, 2026-09-30); the
    // Dev Pit's unplaced `dom` keeps humans.js's office clothes.
    expect(renderRosterNpc('dom-mullet')).toBe(
      svg.replaceAll('npc-dom-team-room-1', 'npc-dom-mullet'),
    );
    expect(renderRosterNpc('dom')).not.toContain(tankTop);
  });

  it("draws Team Room 1's Jethro with his hands and camera after his face, as the design's `jdown` group", () => {
    const svg = renderRosterNpc('jethro-team-room-1');
    const hand =
      '<circle cx="30" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2">';
    const camera =
      '<rect x="84" y="82" width="26" height="18" rx="3" fill="#161719" stroke="#0C4B5F" stroke-width="2">';
    const beard = '<path d="M38 44 C38 66 48 72 60 72';
    expect(svg.split(hand)).toHaveLength(2);
    expect(svg.split(camera)).toHaveLength(2);
    expect(svg.indexOf(hand)).toBeGreaterThan(svg.indexOf(beard));
    expect(svg.indexOf(camera)).toBeGreaterThan(svg.indexOf(hand));
    // While the camera raise plays, both belong to its prop layers instead.
    const raising = renderNpcSvg({ style: 'short', cameraRaise: 'raising' });
    expect(raising).not.toContain('<circle cx="30" cy="101"');
    expect(raising).not.toContain('<circle cx="90" cy="101"');
    expect(raising).not.toContain('<rect x="84" y="82" width="26"');
  });

  it("draws the Mullet's Jason with his hands raised on the controls at rest, and none while his arcade hands play (owner requests, 2026-10-01 and 2026-10-02)", () => {
    const raisedLeft =
      '<g transform="translate(10 -40)"><circle cx="30" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"></circle></g>';
    const raisedRight =
      '<g transform="translate(0 -36)"><circle cx="90" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"></circle></g>';
    const resting = renderRosterNpc('jason-mullet');
    expect(resting).toContain(raisedLeft);
    expect(resting).toContain(raisedRight);
    // No hands at his sides as well, and they're drawn before his head, as in the design.
    expect(resting.split('<circle cx="30" cy="101"')).toHaveLength(2);
    expect(resting.split('<circle cx="90" cy="101"')).toHaveLength(2);
    expect(resting.indexOf(raisedLeft)).toBeLessThan(
      resting.indexOf('<circle cx="60" cy="40" r="25"'),
    );
    // The Icebox's Jason keeps his hands at his sides.
    expect(renderRosterNpc('jason')).not.toContain('translate(10 -40)');
    const jason = NPCS['jason-mullet'];
    if (jason.kind !== 'human') throw new Error('expected jason-mullet to be a Human NPC');
    const playing = renderNpcSvg({ ...jason.figure, arcadeHands: 'playing' });
    assertValidSvg(playing);
    expect(playing).not.toContain('<circle cx="30" cy="101"');
    expect(playing).not.toContain('<circle cx="90" cy="101"');
    // His arms stay.
    expect(playing).toContain('<rect x="24" y="70" width="12" height="30" rx="6" fill="#F4F4F4"');
  });

  it("draws Tony's slick hair and henley collar, verbatim from humans.js", () => {
    const svg = renderRosterNpc('tony');
    assertValidSvg(svg);
    expect(svg).toContain(
      '<path d="M35 34 C34 14 50 6 66 10 C82 12 88 20 85 34 C80 26 40 24 35 34 Z" fill="#2b2118" stroke="#0C4B5F" stroke-width="2.5"></path>',
    );
    expect(svg).toContain(
      '<path d="M40 22 Q60 12 82 20" fill="none" stroke="#F4F4F4" stroke-width="1.5" opacity=".35"></path>',
    );
    expect(svg).toContain(
      '<path d="M60 66 V82" stroke="#0C4B5F" stroke-width="1.5"></path><circle cx="60" cy="72" r="1.5" fill="#0C4B5F"></circle><circle cx="60" cy="78" r="1.5" fill="#0C4B5F"></circle>',
    );
    // The henley's placket is drawn instead of a crew neck.
    expect(svg).not.toContain('<path d="M50 66 Q60 74 70 66"');
  });

  it("draws Ashley's curly volume hair in the Mullet, behind her head and over it, but not Town Center's", () => {
    const svg = renderRosterNpc('ashley-mullet');
    assertValidSvg(svg);
    const back = '<path d="M32 28 Q18 32 25 42 Q14 50 23 58';
    const front =
      '<path d="M33 42 C30 18 48 9 60 11 C74 10 90 18 87 42 Q86 33 80 33 Q77 25 70 28 Q64 22 58 27 Q50 22 46 30 Q38 29 33 42 Z" fill="#5e4128" stroke="#0C4B5F" stroke-width="2.5"></path>';
    expect(svg).toContain(back);
    expect(svg).toContain(front);
    expect(svg).toContain('stroke="#3a2818" stroke-width="1.6"');
    // The back hair is drawn before the torso, the front after the head.
    expect(svg.indexOf(back)).toBeLessThan(
      svg.indexOf('<rect x="34" y="66" width="52" height="44"'),
    );
    expect(svg.indexOf(front)).toBeGreaterThan(svg.indexOf('<circle cx="60" cy="40" r="25"'));
    expect(renderRosterNpc('ashley')).not.toContain(back);
  });

  it("draws the Mullet's ping-pong paddles at rest in Jon's right and Brandon's left hand, but not Town Center's", () => {
    const right =
      '<g><rect x="87.5" y="88" width="5" height="14" rx="2" fill="#8B5A2B" stroke="#0C4B5F" stroke-width="1.5"></rect><circle cx="90" cy="76" r="14" fill="#D9534F" stroke="#0C4B5F" stroke-width="2"></circle></g>';
    const left =
      '<g><rect x="27.5" y="88" width="5" height="14" rx="2" fill="#8B5A2B" stroke="#0C4B5F" stroke-width="1.5"></rect><circle cx="30" cy="76" r="14" fill="#D9534F" stroke="#0C4B5F" stroke-width="2"></circle></g>';
    expect(renderRosterNpc('jon-mullet')).toContain(right);
    expect(renderRosterNpc('brandon-mullet')).toContain(left);
    expect(renderRosterNpc('jon')).not.toContain(right);
    expect(renderRosterNpc('brandon')).not.toContain(left);
  });

  it("hands Team Room 3's Casey the design's open laptop, but not the Roof Deck's", () => {
    const svg = renderRosterNpc('casey-team-room-3');
    expect(svg).toContain(
      '<rect x="36" y="74" width="48" height="26" rx="2" fill="#2a2d31" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain('<polygon points="60,81 65,84 65,90 60,93 55,90 55,84" fill="#00BDFF">');
    expect(svg).toContain(
      '<rect x="30" y="99" width="60" height="6" rx="2" fill="#3a4046" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<circle cx="42" cy="100" r="5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2">',
    );
    // Drawn over her headphones, as in the design.
    expect(svg.indexOf('<rect x="36" y="74"')).toBeGreaterThan(svg.indexOf('<rect x="83" y="34"'));
    expect(renderRosterNpc('casey')).not.toContain('<rect x="36" y="74"');
  });

  it("puts a headset on Team Room 3's Sydney, but not Town Center's", () => {
    const svg = renderRosterNpc('sydney-team-room-3');
    expect(svg).toContain(
      '<path d="M34 38 C32 10 88 10 86 38" fill="none" stroke="#161719" stroke-width="4">',
    );
    expect(svg).toContain(
      '<rect x="29" y="34" width="10" height="15" rx="4" fill="#161719" stroke="#0C4B5F" stroke-width="2">',
    );
    expect(svg).toContain(
      '<path d="M34 48 Q38 60 50 59" fill="none" stroke="#161719" stroke-width="2.5" stroke-linecap="round">',
    );
    expect(svg).toContain('<circle cx="51" cy="59" r="2.6" fill="#00BDFF">');
    // Drawn after her clipboard, as in the design.
    expect(svg.indexOf('<path d="M34 38 C32 10')).toBeGreaterThan(
      svg.indexOf('<rect x="86" y="82"'),
    );
    expect(renderRosterNpc('sydney')).not.toContain('M34 48 Q38 60 50 59');
  });

  it("never draws a <text> element (an SVG loaded as a Phaser texture can't use page web fonts)", () => {
    for (const figure of humanFigures) {
      expect(renderNpcSvg(figure)).not.toContain('<text');
    }
  });
});

describe('renderNpcPropSvg (#113)', () => {
  it("draws a design prop layer in the figure's own padded frame, so it lines up with the figure", () => {
    const arm = getNpcMotion('darrin')?.props?.[0];
    if (!arm) throw new Error('expected Darrin to have a hype-lines prop layer');
    const doc = assertValidSvg(renderNpcPropSvg(arm.svg));
    const svg = doc.querySelector('svg')!;
    const figureSvg = assertValidSvg(renderNpcSvg(humanFigures[0])).querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe(figureSvg.getAttribute('viewBox'));
    expect(svg.getAttribute('width')).toBe(String(PENGUIN_FRAME_WIDTH));
    expect(svg.getAttribute('height')).toBe(String(PENGUIN_FRAME_HEIGHT));
    expect(doc.querySelector('path')?.getAttribute('d')).toBe(
      'M40 6 L44 -4 M60 2 L60 -10 M80 6 L76 -4',
    );
  });
});
