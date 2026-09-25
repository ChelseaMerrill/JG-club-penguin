import { describe, expect, it } from 'vitest';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { transformPoint } from '../../game/npcs/css-keyframes';
import { getNpcMotion } from '../npc-motions';
import { NPCS, type NpcId } from '../npcs';
import { TOWN_CENTER_MOTIONS } from './town-center';

// A neutral rest point and grid origin: these tests only care about a
// motion's own offsets/transforms, not where its Room slot happens to sit.
const REST = { x: 0, y: 0 };
const ORIGIN = { x: 0, y: 0 };
const FEET = { x: -60, y: -120 }; // the figure's feet (60,120), expressed relative to the feet (i.e. the origin of a prop's own 120x130 viewBox, feet-relative)

function motionFor(id: NpcId) {
  const motion = createNpcMotion(getNpcMotion(id), REST, ORIGIN, { reducedMotion: false });
  if (!motion) throw new Error(`expected ${id} to have a motion`);
  return motion;
}

describe("Town Center's NPC motions (#113)", () => {
  it('registers exactly the NPCs with a designed motion (Darrin, Jon, Sydney)', () => {
    expect(Object.keys(TOWN_CENTER_MOTIONS).sort()).toEqual(['darrin', 'jon', 'sydney']);
    for (const id of Object.keys(TOWN_CENTER_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('town-center');
    }
  });

  it('compiles every Town Center NPC motion without throwing', () => {
    for (const id of Object.keys(TOWN_CENTER_MOTIONS) as NpcId[]) {
      expect(() => motionFor(id)).not.toThrow();
    }
  });

  it("follows walkDarrin's own path (exact at its 20% stop, 3.2s into 16s)", () => {
    const motion = motionFor('darrin');
    motion.advance(3_200);
    // mkBrandonGallop-style exact boundary stop: translate(300px,150px).
    expect(motion.pose().point.x).toBeCloseTo(300);
    expect(motion.pose().point.y).toBeCloseTo(150);
  });

  it('rests the pump figure motion at rest (0%/100% stop is the identity transform)', () => {
    const motion = motionFor('darrin');
    const feet = transformPoint(motion.pose().figure!, { x: 0, y: 0 });
    expect(feet.x).toBeCloseTo(0);
    expect(feet.y).toBeCloseTo(0);
  });

  it('lifts Darrin up mid-pump (40% stop: translateY(-40px))', () => {
    const motion = motionFor('darrin');
    motion.advance(280); // 40% of pump's 0.7s
    const feet = transformPoint(motion.pose().figure!, { x: 0, y: 0 });
    expect(feet.y).toBeLessThan(-20); // well off the ground, matching the -40px lift
  });

  it('poses the hype flourish at rest (0%/100% stop is scale(.6) around 60px 10px)', () => {
    const motion = motionFor('darrin');
    const [hype] = motion.pose().props;
    // scale(.6) around (60,10): the feet point (60,120, 110px below the
    // origin) scales to 66px below it, landing at design y 76 -- (0,-44)
    // once re-expressed relative to the feet (60,120).
    const feet = transformPoint(hype.matrix, { x: 0, y: 0 });
    expect(feet.x).toBeCloseTo(0);
    expect(feet.y).toBeCloseTo(-44);
  });

  it("follows walkJon's own path (exact at its 18% stop, 2.52s into 14s)", () => {
    const motion = motionFor('jon');
    motion.advance(2_520);
    expect(motion.pose().point.x).toBeCloseTo(150);
    expect(motion.pose().point.y).toBeCloseTo(75);
  });

  it('poses the trick wand at its 0%/17% stop (translate(96px,84px) rotate(-12deg) around 0,0)', () => {
    const motion = motionFor('jon');
    const [trick] = motion.pose().props;
    // transform-origin defaults to 0,0 (unset in the design), so the wand's
    // own local origin (0,0) is invariant under the rotate and lands exactly
    // at the translate: (96,84), i.e. (36,-36) relative to the feet (60,120).
    const localOrigin = transformPoint(trick.matrix, FEET);
    expect(localOrigin.x).toBeCloseTo(36);
    expect(localOrigin.y).toBeCloseTo(-36);
  });

  it("follows walkSyd's own path (exact at its 19% stop, 4.56s into 24s)", () => {
    const motion = motionFor('sydney');
    motion.advance(4_560);
    expect(motion.pose().point.x).toBeCloseTo(-150);
    expect(motion.pose().point.y).toBeCloseTo(75);
  });
});
