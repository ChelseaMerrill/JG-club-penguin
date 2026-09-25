import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  decomposeAffine,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import type { NpcId } from '../npcs';
import { DEV_PIT_MOTIONS } from './dev-pit';

const ORIGIN = { x: 800, y: 250 };
const REST = { x: 630, y: 456.5 }; // Dom's own slot point in the design

describe('Dev Pit NPC motions (#113)', () => {
  it('registers a motion for every Dev Pit NPC with a designed one, and no other', () => {
    expect((Object.keys(DEV_PIT_MOTIONS) as NpcId[]).sort()).toEqual([
      'dom',
      'ryan',
      'sam',
      'steven',
    ]);
  });

  it('compiles every Dev Pit motion spec without throwing', () => {
    for (const spec of Object.values(DEV_PIT_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("samples Dom's domHop path at its 20% stop, 3.6s into the 18s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.dom!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 3_600), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(170);
    expect(point.y).toBeCloseTo(-85);
  });

  it("samples Dom's hop2 figure squash-and-stretch at its 50% stop, .3s into the .6s hop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.dom!.figure!);
    const matrix = sampleCssAnimation(compiled, 300);
    // translateY(-14px): the figure's own feet (the 60px,120px transform
    // origin) rise straight up by 14px, however the scale below also
    // stretches the figure about that same point.
    const feet = transformPoint(matrix, { x: 60, y: 120 });
    expect(feet.x).toBeCloseTo(60);
    expect(feet.y).toBeCloseTo(106);
    expect(decomposeAffine(matrix).scaleY).toBeCloseTo(1.06); // scaleY(1.06)
  });

  it("samples Ryan's scribble prop rotation at its 50% stop, .25s into the .5s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.ryan!.props![0].motion!);
    const matrix = sampleCssAnimation(compiled, 250);
    // rotate(-14deg): an origin-independent check of the angle itself...
    expect((decomposeAffine(matrix).rotation * 180) / Math.PI).toBeCloseTo(-14);
    // ...and that it pivots on the prop's own 92px,78px origin (maps to itself).
    const origin = transformPoint(matrix, { x: 92, y: 78 });
    expect(origin.x).toBeCloseTo(92);
    expect(origin.y).toBeCloseTo(78);
  });
});
