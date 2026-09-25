import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { HUMAN_NPC_SCALE } from '../../game/npcs/npc-layout';
import type { NpcId } from '../npcs';
import { THE_ICEBOX_MOTIONS } from './the-icebox';

const ORIGIN = { x: 800, y: 250 };
const REST = { x: 840, y: 310 }; // Millie's own slot point in the design

describe('The Icebox NPC motions (#113)', () => {
  it("registers a motion for every one of this Room's five NPCs", () => {
    expect((Object.keys(THE_ICEBOX_MOTIONS) as NpcId[]).sort()).toEqual([
      'darrin-icebox',
      'jason',
      'jethro',
      'millie-icebox',
      'nicole',
    ]);
  });

  it('compiles every Icebox motion spec without throwing', () => {
    for (const spec of Object.values(THE_ICEBOX_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("samples Millie's milRoam path at its 30% stop, 7.8s into the 26s loop", () => {
    const compiled = compileCssAnimation(THE_ICEBOX_MOTIONS['millie-icebox']!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 7_800), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(-140);
    expect(point.y).toBeCloseTo(68);
  });

  it("samples Jethro's jetRoam path at its 65% stop, 16.9s into the 26s loop", () => {
    const compiled = compileCssAnimation(THE_ICEBOX_MOTIONS.jethro!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 16_900), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(20);
    expect(point.y).toBeCloseTo(100);
  });

  it("bobs every NPC 3 Stage px at the shared roam-idle's 50% stop, .55s into the 1.1s loop", () => {
    // The design's `idle` (translateY(-3px)) wraps the figure's scaled `<svg>`
    // from outside, so it moves 3 Stage px; a `figure` track runs inside the
    // 0.62 scaled wrapper instead.
    for (const spec of Object.values(THE_ICEBOX_MOTIONS)) {
      const compiled = compileCssAnimation(spec!.figure!);
      const point = transformPoint(sampleCssAnimation(compiled, 550), { x: 0, y: 0 });
      expect(point.x).toBeCloseTo(0);
      expect(point.y * HUMAN_NPC_SCALE).toBeCloseTo(-3);
    }
  });
});
