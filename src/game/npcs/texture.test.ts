import { describe, expect, it } from 'vitest';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { getNpcMotion } from '../../npcs/npc-motions';
import type { SvgTextureManager } from '../svg-texture';
import { ensureNpcTexture } from './texture';

/** A texture manager fake that records each registered texture's decoded SVG by key. */
function fakeTextures(): { manager: SvgTextureManager; svgs: Map<string, string> } {
  const svgs = new Map<string, string>();
  const manager: SvgTextureManager = {
    exists: (key) => svgs.has(key),
    addBase64: (key, data) => {
      svgs.set(key, atob(data.replace('data:image/svg+xml;base64,', '')));
    },
    once: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
  return { manager, svgs };
}

/** The texture an NPC's figure gets while its designed motion (PR #136) runs. */
function movingFigureSvg(id: NpcId): string {
  const { manager, svgs } = fakeTextures();
  const motion = getNpcMotion(id);
  const key = ensureNpcTexture({ textures: manager }, NPCS[id], {
    omitProp: motion?.replaceFigureProp === true,
    omitRestPose: motion?.replaceFigureRestPose === true,
  });
  return svgs.get(key)!;
}

function stillFigureSvg(id: NpcId): string {
  const { manager, svgs } = fakeTextures();
  return svgs.get(ensureNpcTexture({ textures: manager }, NPCS[id]))!;
}

const JON_CARDS = '<g transform="translate(96 84) rotate(-12)">';
const JON_SCARF = '<path d="M40 66 L60 78 L80 66 L80 74 L60 88 L40 74 Z"';
const MARKER_ARM = '<path d="M92 78 L112 56"';
const ROD = '<path d="M92 96 L118 10"';

describe('ensureNpcTexture: one of each prop while an NPC moves (#137 with PR #136)', () => {
  it("drops a resting pose (Jon's cards) when asked, and keeps the rest of the figure", () => {
    const { manager, svgs } = fakeTextures();
    expect(stillFigureSvg('jon')).toContain(JON_CARDS);
    const key = ensureNpcTexture({ textures: manager }, NPCS.jon, { omitRestPose: true });
    expect(svgs.get(key)).not.toContain(JON_CARDS);
    expect(svgs.get(key)).toContain(JON_SCARF);
  });

  it('draws Steven with no marker, still or walking: he no longer scribbles', () => {
    expect(stillFigureSvg('steven')).not.toContain(MARKER_ARM);
    expect(movingFigureSvg('steven')).not.toContain(MARKER_ARM);
  });

  it("drops Team Room 4's mic and DJ deck while their motions redraw them (Sam Schantz, Ryan Shendler)", () => {
    const samMouth = '<ellipse cx="60" cy="54" rx="5" ry="3.5"';
    const ryanDeck = '<rect x="30" y="90" width="60" height="18"';
    expect(stillFigureSvg('sam-team-room-4')).toContain(samMouth);
    expect(movingFigureSvg('sam-team-room-4')).not.toContain(samMouth);
    expect(stillFigureSvg('ryan-team-room-4')).toContain(ryanDeck);
    expect(movingFigureSvg('ryan-team-room-4')).not.toContain(ryanDeck);
    // The Dev Pit copies only drop their markers, keeping the mic and deck.
    expect(movingFigureSvg('sam')).toContain(samMouth);
    expect(movingFigureSvg('ryan')).toContain(ryanDeck);
  });

  it("keeps Anthony's resting rod while he guards a door (#146): his pacing replaces no prop", () => {
    expect(getNpcMotion('anthony')).toBeUndefined();
    expect(stillFigureSvg('anthony')).toContain(ROD);
    expect(movingFigureSvg('anthony')).toContain(ROD);
  });

  it("hands the Mullet's Jason's hands to his arcade layers, and Ashley's chicken to her throw, while they play (owner request, 2026-10-01)", () => {
    const hand = '<circle cx="30" cy="101"';
    expect(stillFigureSvg('jason-mullet')).toContain(hand);
    expect(movingFigureSvg('jason-mullet')).not.toContain(hand);
    expect(movingFigureSvg('jason-mullet')).toContain('<path d="M37 30 C40 20 50 16 60 16');
    const chicken = '<ellipse cx="20" cy="98" rx="11" ry="9"';
    expect(stillFigureSvg('ashley-mullet')).toContain(chicken);
    expect(movingFigureSvg('ashley-mullet')).not.toContain(chicken);
    // The Dev Pit's Ashley keeps hers: her toss draws its own chicken.
    expect(movingFigureSvg('ashley')).toContain(chicken);
  });

  it("hands Team Room 1's Jethro's hands and camera to his `jdown`/`jup` layers while they play", () => {
    const hand = '<circle cx="30" cy="101"';
    const camera = '<rect x="84" y="82" width="26" height="18"';
    expect(stillFigureSvg('jethro-team-room-1')).toContain(hand);
    expect(stillFigureSvg('jethro-team-room-1')).toContain(camera);
    const moving = movingFigureSvg('jethro-team-room-1');
    expect(moving).not.toContain(hand);
    expect(moving).not.toContain(camera);
  });

  it('drops a figure prop that a moving prop replaces (`omitProp`)', () => {
    const { manager, svgs } = fakeTextures();
    const key = ensureNpcTexture({ textures: manager }, NPCS.anthony, { omitProp: true });
    expect(svgs.get(key)).not.toContain(ROD);
  });

  it('keeps each variant under its own texture key', () => {
    const { manager } = fakeTextures();
    const plain = ensureNpcTexture({ textures: manager }, NPCS.jon);
    const noRestPose = ensureNpcTexture({ textures: manager }, NPCS.jon, { omitRestPose: true });
    expect(plain).toBe('npc:jon');
    expect(noRestPose).toBe('npc:jon:no-rest-pose');
  });
});
