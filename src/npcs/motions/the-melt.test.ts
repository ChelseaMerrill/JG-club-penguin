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
  it('registers exactly the NPCs with a designed motion (Tom)', () => {
    expect(Object.keys(THE_MELT_MOTIONS).sort()).toEqual(['tom']);
    for (const id of Object.keys(THE_MELT_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('the-melt');
    }
  });

  it('compiles every Kitchen NPC motion without throwing', () => {
    for (const id of Object.keys(THE_MELT_MOTIONS) as NpcId[]) {
      expect(() => motionFor(id)).not.toThrow();
    }
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
