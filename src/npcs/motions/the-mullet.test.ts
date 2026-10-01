import { describe, expect, it } from 'vitest';
import {
  decomposeAffine,
  multiplyAffine as multiply,
  transformPoint,
  type Affine,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion, type NpcMotion } from '../../game/npcs/npc-motion';
import { npcScale } from '../../game/npcs/npc-layout';
import { npcSlotPoint, type ScreenPoint } from '../../game/rooms/iso';
import { theMullet } from '../../game/rooms/definitions/the-mullet';
import { getNpcMotion } from '../npc-motions';
import { NPCS, type NpcId } from '../npcs';
import { THE_MULLET_MOTIONS } from './the-mullet';

const ORIGIN = theMullet.grid.origin;

/** Where the Room draws this NPC at rest: its slot point, `offset` included. */
function slotPoint(id: NpcId): ScreenPoint {
  const slot = theMullet.npcSlots.find((candidate) => candidate.npcId === id);
  if (!slot) throw new Error(`expected ${id} to have a Mullet slot`);
  return npcSlotPoint(slot, ORIGIN);
}

function motionFor(id: NpcId): NpcMotion {
  const motion = createNpcMotion(getNpcMotion(id), slotPoint(id), ORIGIN, {
    reducedMotion: false,
  });
  if (!motion) throw new Error(`expected ${id} to have a motion`);
  return motion;
}

const offsetOf = (m: Affine | null): ScreenPoint => transformPoint(m!, { x: 0, y: 0 });

/**
 * Where a figure-unit point (the 120x130 viewBox) of a prop layer is drawn on
 * the Stage right now: the NPC's feet, plus its Stage-level motion, plus the
 * layer's feet-relative transform at the NPC's draw scale. Ignores a
 * `figure` track (none of the NPCs this is used for has one).
 */
function stagePointOf(
  id: NpcId,
  motion: NpcMotion,
  layer: Affine,
  figurePoint: ScreenPoint,
): ScreenPoint {
  const pose = motion.pose();
  const scale = npcScale(NPCS[id]);
  const local = transformPoint(layer, { x: figurePoint.x - 60, y: figurePoint.y - 120 });
  const stage = pose.stage ? offsetOf(pose.stage) : { x: 0, y: 0 };
  return {
    x: pose.point.x + stage.x + local.x * scale,
    y: pose.point.y + stage.y + local.y * scale,
  };
}

function expectNear(actual: ScreenPoint, expected: ScreenPoint, within: number): void {
  expect(Math.abs(actual.x - expected.x), `x ${actual.x} vs ${expected.x}`).toBeLessThan(within);
  expect(Math.abs(actual.y - expected.y), `y ${actual.y} vs ${expected.y}`).toBeLessThan(within);
}

describe("The Mullet's NPC motions (owner request, 2026-10-01)", () => {
  it('registers every one of its nine NPCs', () => {
    expect(Object.keys(THE_MULLET_MOTIONS).sort()).toEqual([
      'ann-marie-mullet',
      'ashley-mullet',
      'brandon-mullet',
      'dom-mullet',
      'jason-mullet',
      'jon-mullet',
      'jory-mullet',
      'nicole-mullet',
      'tony',
    ]);
    for (const slot of theMullet.npcSlots) {
      expect(getNpcMotion(slot.npcId), slot.npcId).toBe(THE_MULLET_MOTIONS[slot.npcId as NpcId]);
      expect(NPCS[slot.npcId as NpcId].roomId).toBe('the-mullet');
    }
  });

  it('compiles every Mullet NPC motion without throwing, and plays none under reduced motion', () => {
    for (const id of Object.keys(THE_MULLET_MOTIONS) as NpcId[]) {
      expect(() => motionFor(id)).not.toThrow();
      expect(
        createNpcMotion(getNpcMotion(id), slotPoint(id), ORIGIN, { reducedMotion: true }),
      ).toBeNull();
    }
  });

  it("works Jason's hands at the Ms. Pac-Man (the design's two hand animateTransforms) while he jiggles", () => {
    const motion = motionFor('jason-mullet');
    expect(motion.roams).toBe(false);
    const [left, right] = motion.pose().props;
    // At rest in the cycle: the left hand at `10 -40`, the right at `0 -36`.
    expect(offsetOf(left.matrix)).toEqual({ x: 10, y: -40 });
    expect(offsetOf(right.matrix)).toEqual({ x: 0, y: -36 });
    // A third of the right hand's 0.25s press: `0 -40`.
    motion.advance(250 / 3);
    expect(offsetOf(motion.pose().props[1].matrix).y).toBeCloseTo(-40);
    // A third of the 0.5s jiggle: 0.8 Stage px right, 0.5 up.
    motion.advance(250 / 3);
    const jiggle = offsetOf(motion.pose().figure);
    expect(jiggle.x * 0.62).toBeCloseTo(0.8, 1);
    expect(jiggle.y * 0.62).toBeCloseTo(-0.5, 1);
    expect(motion.pose().point).toEqual(slotPoint('jason-mullet'));
  });

  it('hops Nicole and Ann Marie 2.5 Stage px on the couch, Ann Marie 0.3s behind', () => {
    const nicole = motionFor('nicole-mullet');
    const annMarie = motionFor('ann-marie-mullet');
    nicole.advance(160);
    annMarie.advance(160);
    expect(offsetOf(nicole.pose().figure).y * 0.62).toBeCloseTo(-2.5, 1);
    expect(offsetOf(annMarie.pose().figure).y).toBeCloseTo(0);
    annMarie.advance(300);
    expect(offsetOf(annMarie.pose().figure).y * 0.62).toBeCloseTo(-2.5, 1);
  });

  it("runs Dom's lap from his slot, through each corner of the design's path at its share of the length", () => {
    const motion = motionFor('dom-mullet');
    expect(motion.roams).toBe(true);
    // His offset slot is the path's first point, (860, 478.26).
    expect(motion.pose().point.x).toBeCloseTo(860);
    expect(motion.pose().point.y).toBeCloseTo(478.26);
    // The path's second corner, (50, -103): 5.89% of 9.4s in.
    motion.advance(0.0589 * 9_400);
    expect(motion.pose().point.x).toBeCloseTo(880);
    expect(motion.pose().point.y).toBeCloseTo(388.26);
    // Half way round: the same point Jory starts at.
    motion.advance(0.5 * 9_400 - 0.0589 * 9_400);
    expectNear(motion.pose().point, { x: 1172.39, y: 767.64 }, 0.5);
  });

  it("starts Jory half a lap ahead, at the design's own t=0 point, and keeps her slot on the floor", () => {
    const motion = motionFor('jory-mullet');
    expect(slotPoint('jory-mullet')).toEqual({ x: 1150, y: 748 });
    expectNear(motion.pose().point, { x: 1172.39, y: 767.64 }, 0.5);
    // `begin="-4.7s"`: 4.7s later she's at the lap's start, where Dom began.
    motion.advance(4_700);
    expectNear(motion.pose().point, { x: 860, y: 478.26 }, 0.01);
  });

  it('walks Tony round the pool table and shows each cue only while he stands at it', () => {
    const motion = motionFor('tony');
    const rest = slotPoint('tony');
    expectNear(rest, { x: 470, y: 433.9 }, 0.01);
    const visible = () => motion.pose().props.map((cue) => cue.alpha);

    expect(visible()).toEqual([1, 0]);
    // Walking (5s of 12s): no cue.
    motion.advance(5_000);
    expect(motion.pose().point.x).toBeGreaterThan(rest.x);
    expect(visible()).toEqual([0, 0]);
    // At the far end (7s): (210, 133) from his rest, with the other cue.
    motion.advance(2_000);
    expectNear(motion.pose().point, { x: rest.x + 210, y: rest.y + 133 }, 0.01);
    expect(visible()).toEqual([0, 1]);
    // Back home at the end of the cycle.
    motion.advance(5_000);
    expectNear(motion.pose().point, rest, 0.01);
  });

  it("strokes Tony's near cue 12 Stage px back and draws it where the design does", () => {
    const motion = motionFor('tony');
    const [near] = motion.pose().props;
    // The cue's tip, design (505, 496) in his group: figure units of his
    // `<svg x="462.8" y="440.5">` at 0.62.
    const tip = { x: (505 - 462.8) / 0.62 - 115, y: (496 - 440.5) / 0.62 };
    const rest = stagePointOf('tony', motion, multiply(near.matrix, near.children[0].matrix), tip);
    expectNear(rest, { x: 505 - 30, y: 496 - 81 }, 0.2);
    // 40% of the 1.6s stroke: drawn back by (12, 1.4).
    motion.advance(640);
    const [drawn] = motion.pose().props;
    const back = stagePointOf(
      'tony',
      motion,
      multiply(drawn.matrix, drawn.children[0].matrix),
      tip,
    );
    expectNear(back, { x: rest.x - 12, y: rest.y - 1.4 }, 0.05);
  });

  it("keeps Tony's cue on his walk's clock while his dialog has him paused", () => {
    const motion = motionFor('tony');
    motion.advance(2_000);
    motion.pause();
    motion.advance(3_000);
    expect(motion.pose().props[0].alpha).toBe(1);
    motion.resume();
    motion.advance(2_500);
    expect(motion.pose().props[0].alpha).toBe(0);
  });

  it('paces Ashley between her three stops, throwing Clucknelius at Jon, the Penguin and Brandon from each', () => {
    const motion = motionFor('ashley-mullet');
    expectNear(slotPoint('ashley-mullet'), { x: 620, y: 698.26 }, 0.01);
    const layers = THE_MULLET_MOTIONS['ashley-mullet']!.props!;
    expect(layers).toHaveLength(4);
    const chickenCentre = { x: 20, y: 98 };
    // Before the first throw the chicken is in her hand and none is flying.
    expect(motion.pose().props.map((layer) => layer.alpha)).toEqual([1, 0, 0, 0]);

    for (const [throwIndex, landsAtMs, target, stop] of [
      [1, 1_998.8, { x: 850, y: 560 }, { x: 0, y: 0 }],
      [2, 8_599.4, { x: 570, y: 500 }, { x: -140, y: -40 }],
      [3, 13_898.6, { x: 1062, y: 680 }, { x: -60, y: 70 }],
    ] as const) {
      const at = createNpcMotion(
        getNpcMotion('ashley-mullet'),
        slotPoint('ashley-mullet'),
        ORIGIN,
        {
          reducedMotion: false,
        },
      )!;
      at.advance(landsAtMs);
      const pose = at.pose();
      expectNear(pose.point, { x: 620 + stop.x, y: 698.26 + stop.y }, 0.01);
      // The held chicken is gone while one flies.
      expect(pose.props[0].alpha).toBe(0);
      expect(pose.props[throwIndex].alpha).toBe(1);
      const flight = pose.props[throwIndex];
      const landed = stagePointOf(
        'ashley-mullet',
        at,
        multiply(flight.matrix, flight.children[0].matrix),
        chickenCentre,
      );
      // Within her 0.62-vs-0.58 hand offset and her 3 px bob.
      expectNear(landed, target, 6);
    }
  });

  it("flies the ping-pong ball along the design's own path, whatever Jon's sway, and swings both paddles", () => {
    const jon = motionFor('jon-mullet');
    const ballIndex = THE_MULLET_MOTIONS['jon-mullet']!.props!.findIndex((layer) =>
      layer.svg.includes('r="3.5"'),
    );
    const ballCentre = { x: 60 + 30 / 0.62, y: 120 + 14 / 0.62 };
    const ball = () =>
      stagePointOf('jon-mullet', jon, jon.pose().props[ballIndex].matrix, ballCentre);
    expectNear(ball(), { x: 880, y: 612 }, 0.05);
    // Half a 2.4s rally: at Brandon's end, (1030, 676).
    jon.advance(1_200);
    expectNear(ball(), { x: 1030, y: 676 }, 0.05);
    // Jon's paddle is fully swung (35°) as the ball reaches Brandon...
    expect((decomposeAffine(jon.pose().props[0].matrix).rotation * 180) / Math.PI).toBeCloseTo(35);
    // ...and a third of the way into his 4.8s sway (1.6s) he's at `22 -11`.
    jon.advance(400);
    expectNear(offsetOf(jon.pose().stage), { x: 22, y: -11 }, 0.01);
    // Back at Jon's end a rally later, mid-sway.
    jon.advance(800);
    expectNear(ball(), { x: 880, y: 612 }, 0.05);

    // Brandon's swing is half a rally behind (`begin="1.2s"`): fully back at load.
    const brandon = motionFor('brandon-mullet');
    expectNear(slotPoint('brandon-mullet'), { x: 1062, y: 711.6 }, 0.01);
    const swing = decomposeAffine(brandon.pose().props[0].matrix).rotation;
    expect((swing * 180) / Math.PI).toBeCloseTo(-35);
    expect(brandon.roams).toBe(false);
    // His sway `begin="1.2s"`: 2.8s in he's a third of the way through it.
    brandon.advance(2_800);
    expect(offsetOf(brandon.pose().stage).x).toBeCloseTo(-18);
    expect(offsetOf(brandon.pose().stage).y).toBeCloseTo(9);
  });
});
