import { describe, expect, it } from 'vitest';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { getNpcMotion } from '../npc-motions';
import { NPCS, type NpcId } from '../npcs';
import { THE_MELT_MOTIONS } from './the-melt';

const REST = { x: 0, y: 0 };
const ORIGIN = { x: 0, y: 0 };

function motionFor(id: NpcId) {
  const motion = createNpcMotion(getNpcMotion(id), REST, ORIGIN, { reducedMotion: false });
  if (!motion) throw new Error(`expected ${id} to have a motion`);
  return motion;
}

describe("The Kitchen's NPC motions (#113)", () => {
  it('registers exactly the NPCs with a motion (Tom, and Chelsea flipping pancakes)', () => {
    expect(Object.keys(THE_MELT_MOTIONS).sort()).toEqual(['chelsea', 'tom']);
    for (const id of Object.keys(THE_MELT_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('the-melt');
    }
  });

  it('compiles every Kitchen NPC motion without throwing', () => {
    for (const id of Object.keys(THE_MELT_MOTIONS) as NpcId[]) {
      expect(() => motionFor(id)).not.toThrow();
    }
  });

  it("flicks Chelsea's spatula up 55 degrees at flipArm's 40% (0.64s into 1.6s) and back", () => {
    const motion = motionFor('chelsea');
    const [spatula] = motion.pose().props;
    expect(spatula!.matrix.b).toBeCloseTo(0);
    motion.advance(640);
    expect(
      Math.atan2(motion.pose().props[0]!.matrix.b, motion.pose().props[0]!.matrix.a),
    ).toBeCloseTo((-55 * Math.PI) / 180);
    motion.advance(960);
    expect(motion.pose().props[0]!.matrix.b).toBeCloseTo(0);
  });

  it("sends Chelsea's pancake up off the spatula and lands it, turned a full circle, by cakeFly's 90%", () => {
    const motion = motionFor('chelsea');
    // The pancake is the spatula's nested layer: its own motion, on top of the flick.
    const pancake = () => motion.pose().props[0]!.children[0]!.matrix;
    // 45% (0.72s): turned half over, high above the spatula.
    motion.advance(720);
    expect(pancake().a).toBeCloseTo(-1, 1);
    expect(pancake().f).toBeLessThan(-50);
    // 90% (1.44s): turned all the way round and back on the spatula.
    motion.advance(720);
    expect(pancake().a).toBeCloseTo(1);
    expect(pancake().b).toBeCloseTo(0);
    expect(pancake().f).toBeCloseTo(0);
  });

  it('draws Chelsea without her own static spatula, so it is not drawn twice', () => {
    expect(THE_MELT_MOTIONS.chelsea?.replaceFigureProp).toBe(true);
  });

  it("follows tomWalk's own path (exact at its 35% stop, 5.6s into 16s)", () => {
    const motion = motionFor('tom');
    motion.advance(5_600);
    // The 35%,60% stop: translate(-240px, 60px).
    expect(motion.pose().point.x).toBeCloseTo(-240);
    expect(motion.pose().point.y).toBeCloseTo(60);
    expect(motion.pose().moving).toBe(true);
  });

  it('rests Tom at his slot point at the loop boundary (0%/15% stop is translate(0,0))', () => {
    const motion = motionFor('tom');
    expect(motion.pose().point).toEqual(REST);
  });
});
