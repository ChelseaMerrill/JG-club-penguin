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
  it("drops Jon's resting cards while his spinning `trick` fan plays, and keeps his scarf", () => {
    expect(stillFigureSvg('jon')).toContain(JON_CARDS);
    const moving = movingFigureSvg('jon');
    expect(moving).not.toContain(JON_CARDS);
    expect(moving).toContain(JON_SCARF);
  });

  it('drops the Dev Pit markers while each `scribble` arm plays (Steven, Ryan, Sam)', () => {
    for (const id of ['steven', 'ryan', 'sam'] as const) {
      expect(stillFigureSvg(id), id).toContain(MARKER_ARM);
      expect(movingFigureSvg(id), id).not.toContain(MARKER_ARM);
    }
  });

  it("drops Anthony's resting rod while his casting rod plays", () => {
    expect(stillFigureSvg('anthony')).toContain(ROD);
    expect(movingFigureSvg('anthony')).not.toContain(ROD);
  });

  it('keeps each variant under its own texture key', () => {
    const { manager } = fakeTextures();
    const plain = ensureNpcTexture({ textures: manager }, NPCS.jon);
    const noRestPose = ensureNpcTexture({ textures: manager }, NPCS.jon, { omitRestPose: true });
    expect(plain).toBe('npc:jon');
    expect(noRestPose).toBe('npc:jon:no-rest-pose');
  });
});
