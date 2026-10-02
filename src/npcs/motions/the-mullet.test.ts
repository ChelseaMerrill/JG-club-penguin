import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  decomposeAffine,
  multiplyAffine as multiply,
  sampleCssAnimation,
  sampleCssOpacity,
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
  it('registers every one of its six NPCs', () => {
    // Ashley, Jory, Dom, Jason, Nicole and Ann Marie left; Abby, Adam and
    // Bryan joined (owner request, 2026-10-02, Track D).
    expect(Object.keys(THE_MULLET_MOTIONS).sort()).toEqual([
      'abby-rivera',
      'adam-wilson-hwang',
      'brandon-mullet',
      'bryan-sambrook',
      'jon-mullet',
      'tony',
    ]);
    expect(theMullet.npcSlots.map((slot) => slot.npcId).sort()).toEqual(
      Object.keys(THE_MULLET_MOTIONS).sort(),
    );
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
  it('keeps Abby at the wall and brushes four stripes on it, one after another', () => {
    const spec = THE_MULLET_MOTIONS['abby-rivera']!;
    expect(spec.path).toBeUndefined();
    const layers = spec.props!;
    expect(layers).toHaveLength(5);
    const alphaAt = (layer: number, ms: number): number => {
      const compiled = compileCssAnimation(layers[layer]!.motion!);
      return sampleCssOpacity(compiled, ms);
    };
    // 8 s loop: stripe k is painted over 5+20k%..20+20k%, then all fade by 97%.
    expect(alphaAt(0, 0)).toBeCloseTo(0);
    expect(alphaAt(0, 1_800)).toBeCloseTo(1);
    expect(alphaAt(3, 1_800)).toBeCloseTo(0);
    expect(alphaAt(3, 7_000)).toBeCloseTo(1);
    expect(alphaAt(3, 7_900)).toBeCloseTo(0);
    // The arm turns about her shoulder to reach the lowest stripe.
    const arm = compileCssAnimation(layers[4]!.motion!);
    expect((decomposeAffine(sampleCssAnimation(arm, 7_100)).rotation * 180) / Math.PI).toBeCloseTo(
      30,
    );
  });

  it("walks Adam and Bryan only over walkable tiles that aren't another NPC's slot", () => {
    const laps: Record<string, { col: number; row: number }[]> = {
      'adam-wilson-hwang': [
        { col: 11, row: 4 },
        { col: 13, row: 4 },
        { col: 13, row: 1 },
      ],
      'bryan-sambrook': [
        { col: 7, row: 8 },
        { col: 12, row: 8 },
        { col: 12, row: 10 },
      ],
    };
    for (const [id, corners] of Object.entries(laps)) {
      const home = theMullet.npcSlots.find((slot) => slot.npcId === id)!.tile;
      const loop = [home, ...corners, home];
      const others = theMullet.npcSlots.filter((slot) => slot.npcId !== id);
      for (let leg = 0; leg < loop.length - 1; leg += 1) {
        const a = loop[leg]!;
        const b = loop[leg + 1]!;
        const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
        for (let step = 0; step <= steps; step += 1) {
          const tile = {
            col: a.col + Math.sign(b.col - a.col) * step,
            row: a.row + Math.sign(b.row - a.row) * step,
          };
          const label = `${id} (${tile.col},${tile.row})`;
          if (tile.col !== home.col || tile.row !== home.row) {
            expect(theMullet.walkable[tile.row]![tile.col], label).toBe(true);
          }
          expect(
            others.some((o) => o.tile.col === tile.col && o.tile.row === tile.row),
            label,
          ).toBe(false);
        }
      }
      // Each corner of the lap is a stop of its path, in tileToScreen deltas.
      const compiled = compileCssAnimation(THE_MULLET_MOTIONS[id as NpcId]!.path!);
      const loopMs = id === 'adam-wilson-hwang' ? 22_000 : 26_000;
      const seen = new Set<string>();
      for (let ms = 0; ms < loopMs; ms += 50) {
        const p = transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
        seen.add(`${Math.round(p.x)},${Math.round(p.y)}`);
      }
      for (const c of corners) {
        const dc = c.col - home.col;
        const dr = c.row - home.row;
        expect(seen, `${id} corner (${c.col},${c.row})`).toContain(
          `${(dc - dr) * 50},${(dc + dr) * 25}`,
        );
      }
    }
  });
});
