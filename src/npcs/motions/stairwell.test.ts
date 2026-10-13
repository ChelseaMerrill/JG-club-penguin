import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { NPCS, type NpcId } from '../npcs';
import { STAIRWELL_MOTIONS } from './stairwell';

const ORIGIN = { x: 800, y: 360 };
const REST = { x: 0, y: 0 };

const STAIRWELL_IDS: NpcId[] = [0, 1, 2, 3, 4, 5].flatMap((floor) => [
  `dom-stairwell-${floor}` as NpcId,
  `jason-stairwell-${floor}` as NpcId,
]);
const GUEST_IDS: NpcId[] = [
  'anthony-stairwell-0',
  'casey-stairwell-1',
  'sydney-stairwell-2',
  'tony-stairwell-3',
  'jory-stairwell-4',
  'ashley-stairwell-5',
];

describe("The Stairwell's NPC motions (#182)", () => {
  it('registers a motion for all 18 Stairwell placements, on their own floor, and no other', () => {
    const expected = [...STAIRWELL_IDS, ...GUEST_IDS].sort();
    expect((Object.keys(STAIRWELL_MOTIONS) as NpcId[]).sort()).toEqual(expected);
    for (const id of Object.keys(STAIRWELL_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId, id).toMatch(/^stairwell-\d$/);
    }
  });

  it('compiles every Stairwell motion spec without throwing', () => {
    for (const spec of Object.values(STAIRWELL_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("samples Dom's domRun at its 43.6% stop and its 88%-100% hold, 9s loop", () => {
    const compiled = compileCssAnimation(STAIRWELL_MOTIONS['dom-stairwell-0']!.path!);
    const atStop = transformPoint(sampleCssAnimation(compiled, 3_924), { x: 0, y: 0 });
    expect(atStop.x).toBeCloseTo(160);
    expect(atStop.y).toBeCloseTo(-183);
    const atHold = transformPoint(sampleCssAnimation(compiled, 8_460), { x: 0, y: 0 });
    expect(atHold.x).toBeCloseTo(360);
    expect(atHold.y).toBeCloseTo(-216);
  });

  it("samples Dom's hop2 at its 50% stop, .3s loop", () => {
    const compiled = compileCssAnimation(STAIRWELL_MOTIONS['dom-stairwell-0']!.figure!);
    const point = transformPoint(sampleCssAnimation(compiled, 150), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(-10);
  });

  it("holds Jason's jasonPace at (170,-65) through its 45%-70% stop, 14s loop", () => {
    const compiled = compileCssAnimation(STAIRWELL_MOTIONS['jason-stairwell-0']!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 7_000), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(170);
    expect(point.y).toBeCloseTo(-65);
  });

  it("holds a guest's mingle at (-10,-50) through its 45%-70% stop, and idle at its 50% stop", () => {
    const motion = STAIRWELL_MOTIONS['anthony-stairwell-0']!;
    const path = compileCssAnimation(motion.path!);
    const pathPoint = transformPoint(sampleCssAnimation(path, 9_000), { x: 0, y: 0 });
    expect(pathPoint.x).toBeCloseTo(-10);
    expect(pathPoint.y).toBeCloseTo(-50);
    const figure = compileCssAnimation(motion.figure!);
    const figurePoint = transformPoint(sampleCssAnimation(figure, 1_500), { x: 0, y: 0 });
    expect(figurePoint.x).toBeCloseTo(0);
    expect(figurePoint.y).toBeCloseTo(-3);
  });
});
