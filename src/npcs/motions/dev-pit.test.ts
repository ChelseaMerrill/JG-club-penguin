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
const REST = { x: 600, y: 425 }; // Ian's own slot point (1,5)

describe('Dev Pit NPC motions (#113)', () => {
  it('registers a motion for every Dev Pit NPC with a designed one, and no other', () => {
    // Dom removed (owner request, 2026-09-25, Track D): no longer a Dev Pit
    // NPC. Ian's own loop is authored (see `dev-pit.ts`'s comment), not from
    // the design.
    expect((Object.keys(DEV_PIT_MOTIONS) as NpcId[]).sort()).toEqual([
      'ian',
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

  it("samples Ian's authored ianWalk path at its 22% stop, 3.96s into the 18s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.ian!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 3_960), { x: 0, y: 0 });
    // The (0,5) waypoint, one tile west of his (1,5) slot.
    expect(point.x).toBeCloseTo(-50);
    expect(point.y).toBeCloseTo(-25);
  });

  it("samples Ian's reused idle figure bob at its 50% stop, 1.5s into the 3s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.ian!.figure!);
    const matrix = sampleCssAnimation(compiled, 1_500);
    const point = transformPoint(matrix, { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(-3);
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
