import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  decomposeAffine,
  sampleCssAnimation,
  sampleCssOpacity,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { HUMAN_NPC_SCALE } from '../../game/npcs/npc-layout';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { tileToScreen } from '../../game/rooms/iso';
import { teamRoom1 } from '../../game/rooms/definitions/team-room-1';
import { getNpcMotion } from '../npc-motions';
import type { NpcId } from '../npcs';
import { TEAM_ROOM_1_MOTIONS } from './team-room-1';

const ORIGIN = teamRoom1.grid.origin;
const DOM_REST = tileToScreen({ col: 4, row: 0 }, ORIGIN);

/** Where `domrun` puts the design's `<div>` top-left at `elapsedMs`, in the design's own absolute Stage px. */
function domDesignPosition(elapsedMs: number) {
  const compiled = compileCssAnimation(TEAM_ROOM_1_MOTIONS['dom-team-room-1']!.path!);
  const offset = transformPoint(sampleCssAnimation(compiled, elapsedMs), { x: 0, y: 0 });
  // Rebased on the design's 0% frame, translate(955px, 372px).
  return { x: 955 + offset.x, y: 372 + offset.y };
}

describe('Team Room 1 NPC motions (owner request, 2026-09-30)', () => {
  it("registers a motion for both of this Room's NPCs, reachable through the registry", () => {
    expect((Object.keys(TEAM_ROOM_1_MOTIONS) as NpcId[]).sort()).toEqual([
      'dom-team-room-1',
      'jethro-team-room-1',
    ]);
    expect(getNpcMotion('dom-team-room-1')).toBe(TEAM_ROOM_1_MOTIONS['dom-team-room-1']);
    expect(getNpcMotion('jethro-team-room-1')).toBe(TEAM_ROOM_1_MOTIONS['jethro-team-room-1']);
  });

  it('compiles every Team Room 1 motion spec without throwing', () => {
    for (const spec of Object.values(TEAM_ROOM_1_MOTIONS)) {
      expect(() => createNpcMotion(spec, DOM_REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("runs Dom's domrun lap through the design's own Stage positions, 6 s a lap", () => {
    // The design's stops, verbatim: 11.45% (995, 502), 31.84% (915, 683),
    // 60.07% (625, 517), 86.30% (805, 337).
    const at = (percent: number) => domDesignPosition((percent / 100) * 6_000);
    expect(at(11.45).x).toBeCloseTo(995);
    expect(at(11.45).y).toBeCloseTo(502);
    expect(at(31.84).x).toBeCloseTo(915);
    expect(at(31.84).y).toBeCloseTo(683);
    expect(at(60.07).x).toBeCloseTo(625);
    expect(at(60.07).y).toBeCloseTo(517);
    expect(at(86.3).x).toBeCloseTo(805);
    expect(at(86.3).y).toBeCloseTo(337);
    expect(domDesignPosition(6_000)).toEqual({ x: 955, y: 372 });
  });

  it('moves Dom off his slot point along the lap, and home again each 6 s', () => {
    const motion = createNpcMotion(TEAM_ROOM_1_MOTIONS['dom-team-room-1'], DOM_REST, ORIGIN, {
      reducedMotion: false,
    })!;
    expect(motion.roams).toBe(true);
    // Linear, half-way from 0% to 11.45%: (20, 65) off his slot.
    motion.advance(343.5);
    expect(motion.pose().point.x).toBeCloseTo(DOM_REST.x + 20);
    expect(motion.pose().point.y).toBeCloseTo(DOM_REST.y + 65);
    motion.advance(6_000 - 343.5);
    expect(motion.pose().point.x).toBeCloseTo(DOM_REST.x);
    expect(motion.pose().point.y).toBeCloseTo(DOM_REST.y);
  });

  it('bobs both figures 6 Stage px up at the top of their `bob`, tilted 2deg, pivoting on the feet', () => {
    // Dom's .35s bob peaks at 50%; Jethro's 2.4s one, delayed -0.6s, at 0.6 s.
    const cases: [NpcId, number][] = [
      ['dom-team-room-1', 175],
      ['jethro-team-room-1', 600],
    ];
    for (const [id, peakMs] of cases) {
      const matrix = sampleCssAnimation(
        compileCssAnimation(TEAM_ROOM_1_MOTIONS[id]!.figure!),
        peakMs,
      );
      expect((decomposeAffine(matrix).rotation * 180) / Math.PI, id).toBeCloseTo(2);
      // The feet-centre (60, 130) only lifts: straight up, 6 Stage px.
      const feet = transformPoint(matrix, { x: 60, y: 130 });
      expect(feet.x, id).toBeCloseTo(60);
      expect((feet.y - 130) * HUMAN_NPC_SCALE, id).toBeCloseTo(-6, 1);
    }
  });

  it("raises Jethro's camera to his eye and fades the lowered one out, every 4 s", () => {
    const [jdown, jup] = TEAM_ROOM_1_MOTIONS['jethro-team-room-1']!.props!;
    const down = compileCssAnimation(jdown.motion!);
    const up = compileCssAnimation(jup.motion!);
    // 0.5 s (12.5%): lowered camera shown, raised one hidden and down-right.
    expect(sampleCssOpacity(down, 500)).toBeCloseTo(1);
    expect(sampleCssOpacity(up, 500)).toBeCloseTo(0);
    expect(transformPoint(sampleCssAnimation(up, 500), { x: 0, y: 0 })).toEqual({ x: 20, y: 40 });
    // 2 s (50%): the reverse, the raised camera at rest at his eye.
    expect(sampleCssOpacity(down, 2_000)).toBeCloseTo(0);
    expect(sampleCssOpacity(up, 2_000)).toBeCloseTo(1);
    const atEye = transformPoint(sampleCssAnimation(up, 2_000), { x: 0, y: 0 });
    expect(atEye.x).toBeCloseTo(0);
    expect(atEye.y).toBeCloseTo(0);
  });

  it("fires Jethro's flash once, at 48% of the camera loop, while the camera is up", () => {
    const flash = compileCssAnimation(
      TEAM_ROOM_1_MOTIONS['jethro-team-room-1']!.props![1].children![0].motion!,
    );
    expect(sampleCssOpacity(flash, 1_000)).toBeCloseTo(0);
    expect(sampleCssOpacity(flash, 1_920)).toBeCloseTo(0.95);
    expect(sampleCssOpacity(flash, 2_400)).toBeCloseTo(0);
  });
});
