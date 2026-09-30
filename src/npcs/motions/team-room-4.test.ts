import { describe, expect, it } from 'vitest';
import { transformPoint } from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { RYAN_SHENDLER_SHEET, SAM_SCHANTZ_SHEET } from '../../game/npcs/render-npc-svg';
import { getNpcMotion } from '../npc-motions';
import { NPCS, type NpcId } from '../npcs';
import { TEAM_ROOM_4_MOTIONS } from './team-room-4';

const REST = { x: 0, y: 0 };
const ORIGIN = { x: 0, y: 0 };

function motionFor(id: NpcId) {
  const motion = createNpcMotion(getNpcMotion(id), REST, ORIGIN, { reducedMotion: false });
  if (!motion) throw new Error(`expected ${id} to have a motion`);
  return motion;
}

/** How far a layer's transform moves a point, in figure viewBox units. */
function drift(matrix: Parameters<typeof transformPoint>[0]) {
  return transformPoint(matrix, { x: 0, y: 0 });
}

describe("Team Room 4's NPC motions (owner request, 2026-09-30)", () => {
  it('registers exactly Sam Schantz and Ryan Shendler', () => {
    expect(Object.keys(TEAM_ROOM_4_MOTIONS).sort()).toEqual([
      'ryan-team-room-4',
      'sam-team-room-4',
    ]);
    for (const id of Object.keys(TEAM_ROOM_4_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('team-room-4');
    }
  });

  it('compiles every Team Room 4 NPC motion without throwing, and plays none under reduced motion', () => {
    for (const id of Object.keys(TEAM_ROOM_4_MOTIONS) as NpcId[]) {
      expect(() => motionFor(id)).not.toThrow();
      expect(createNpcMotion(getNpcMotion(id), REST, ORIGIN, { reducedMotion: true })).toBeNull();
    }
  });

  it("bobs each figure with its Characters sheet card's own bob (5 units up at half period), without walking", () => {
    for (const [id, periodMs] of [
      ['sam-team-room-4', 1_600],
      ['ryan-team-room-4', 3_810],
    ] as const) {
      const motion = motionFor(id);
      expect(motion.roams, id).toBe(false);
      motion.advance(periodMs / 2);
      expect(drift(motion.pose().figure!).y, id).toBeCloseTo(-5);
      expect(motion.pose().point, id).toEqual(REST);
    }
  });

  it("redraws each card's held prop as its own layers, so the figure texture drops it", () => {
    const sam = TEAM_ROOM_4_MOTIONS['sam-team-room-4']!;
    const ryan = TEAM_ROOM_4_MOTIONS['ryan-team-room-4']!;
    expect(sam.replaceFigureProp).toBe(true);
    expect(ryan.replaceFigureProp).toBe(true);
    const samLayers = sam.props!.map((layer) => layer.svg);
    expect(samLayers).toContain(SAM_SCHANTZ_SHEET.mouth);
    expect(samLayers).toContain(SAM_SCHANTZ_SHEET.micArm);
    // The mic arm is drawn over the mouth and sound arcs, as in the card.
    expect(samLayers.indexOf(SAM_SCHANTZ_SHEET.micArm)).toBeGreaterThan(
      samLayers.indexOf(SAM_SCHANTZ_SHEET.mouth),
    );
    const ryanLayers = ryan.props!.map((layer) => layer.svg);
    expect(ryanLayers.slice(0, 6)).toEqual([
      RYAN_SHENDLER_SHEET.deck,
      ...RYAN_SHENDLER_SHEET.litKeys,
      RYAN_SHENDLER_SHEET.hands,
    ]);
  });

  it("opens and closes Sam's mouth (the card's ry 3.5 -> 1.5 -> 3.5 over 0.4s) about its centre", () => {
    const motion = motionFor('sam-team-room-4');
    const mouthIndex = TEAM_ROOM_4_MOTIONS['sam-team-room-4']!.props!.findIndex(
      (layer) => layer.svg === SAM_SCHANTZ_SHEET.mouth,
    );
    motion.advance(200);
    const mouth = motion.pose().props[mouthIndex].matrix;
    expect(mouth.d).toBeCloseTo(1.5 / 3.5, 3);
    expect(mouth.a).toBeCloseTo(1);
  });

  it("blinks Ryan's lit deck keys at the card's own rates (1 -> .3 -> 1)", () => {
    const motion = motionFor('ryan-team-room-4');
    // The first lit key blinks every 0.5s: dimmest at 0.25s.
    motion.advance(250);
    const [, firstKey] = motion.pose().props;
    expect(firstKey.alpha).toBeCloseTo(0.3);
    // The deck itself never fades.
    expect(motion.pose().props[0].alpha).toBe(1);
  });

  it("floats Ryan's card notes up and out, fading in then out, 1.2s apart (the card's own SMIL timing)", () => {
    const motion = motionFor('ryan-team-room-4');
    const layers = TEAM_ROOM_4_MOTIONS['ryan-team-room-4']!.props!;
    const right = layers.findIndex((layer) => layer.svg.includes('M100 30 V20 L107 18 V28'));
    const left = layers.findIndex((layer) => layer.svg.includes('M14 40 V30 L21 28 V38'));
    expect(right).toBeGreaterThan(-1);
    expect(left).toBeGreaterThan(-1);

    expect(motion.pose().props[right].alpha).toBeCloseTo(0);
    // Half-way through its 2.4s cycle: fully shown, 3 right and 11 up.
    motion.advance(1_200);
    const note = motion.pose().props[right];
    expect(note.alpha).toBeCloseTo(1);
    expect(drift(note.matrix).x).toBeCloseTo(3);
    expect(drift(note.matrix).y).toBeCloseTo(-11);
    // The left note is half a cycle behind: just starting again, invisible.
    expect(motion.pose().props[left].alpha).toBeCloseTo(0);
  });

  it('gives Sam three music notes that each drift upward while fading in then out, staggered', () => {
    const layers = TEAM_ROOM_4_MOTIONS['sam-team-room-4']!.props!;
    const notes = layers
      .map((layer, index) => ({ layer, index }))
      .filter(
        ({ layer }) => layer.svg.includes('<ellipse') && layer.svg !== SAM_SCHANTZ_SHEET.mouth,
      );
    expect(notes).toHaveLength(3);
    const motion = motionFor('sam-team-room-4');
    const peaks = new Set<number>();
    for (let t = 0; t < 2_400; t += 100) {
      const poses = motion.pose().props;
      for (const { index } of notes) {
        if (poses[index].alpha > 0.95) peaks.add(index);
      }
      motion.advance(100);
    }
    // Every note is fully shown at some point in the cycle...
    expect(peaks.size).toBe(3);
    // ...and at no single moment are all three at the same opacity.
    const now = motion.pose().props;
    const alphas = notes.map(({ index }) => now[index].alpha.toFixed(2));
    expect(new Set(alphas).size).toBeGreaterThan(1);
    for (const { index } of notes) expect(drift(now[index].matrix).y).toBeLessThanOrEqual(0);
  });
});
