import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { renderCardFigure } from '../../game/npcs/card-figures';
import { teamRoom2 } from '../../game/rooms/definitions/team-room-2';
import { getNpcMotion } from '../npc-motions';
import { TEAM_ROOM_2_MOTIONS } from './team-room-2';

/** The rotation (degrees) of a sampled CSS transform matrix. */
function degrees(matrix: { a: number; b: number }): number {
  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}

describe('Team Room 2 (owner requests, 2026-10-02)', () => {
  it('seats Nick, Frank and Aleksandr at their desks, bobbing, and stands Chris Pence by the back wall', () => {
    expect(teamRoom2.npcSlots.map((slot) => slot.npcId).sort()).toEqual([
      'aleksandr-molchagin',
      'chris-pence',
      'frank-nardone',
      'nick-brown',
    ]);
    expect(Object.keys(TEAM_ROOM_2_MOTIONS).sort()).toEqual([
      'aleksandr-molchagin',
      'chris-pence',
      'frank-nardone',
      'nick-brown',
    ]);
    for (const id of ['nick-brown', 'frank-nardone', 'aleksandr-molchagin'] as const) {
      expect(getNpcMotion(id)?.path, id).toBeUndefined();
      const bob = compileCssAnimation(TEAM_ROOM_2_MOTIONS[id]!.figure!);
      const half = bob.durationMs / 2;
      expect(transformPoint(sampleCssAnimation(bob, half), { x: 0, y: 0 }).y).toBeCloseTo(-3.41);
    }
    expect(teamRoom2.foregrounds?.map((layer) => layer.overNpcId).sort()).toEqual([
      'aleksandr-molchagin',
      'frank-nardone',
      'nick-brown',
    ]);
  });

  it('has no couch any more: the tile only it blocked is walkable again', () => {
    expect(teamRoom2.walkable[5]![2]).toBe(true);
  });

  it('turns Chris from his feet to look round the Room, holding at each side', () => {
    const scan = compileCssAnimation(TEAM_ROOM_2_MOTIONS['chris-pence']!.figure!);
    expect(scan.durationMs).toBe(14_000);
    expect(degrees(sampleCssAnimation(scan, 0))).toBeCloseTo(0);
    expect(degrees(sampleCssAnimation(scan, 0.3 * 14_000))).toBeCloseTo(-9);
    expect(degrees(sampleCssAnimation(scan, 0.54 * 14_000))).toBeCloseTo(0);
    expect(degrees(sampleCssAnimation(scan, 0.78 * 14_000))).toBeCloseTo(9);
    // About his feet: they stay put while he turns.
    const feet = transformPoint(sampleCssAnimation(scan, 0.3 * 14_000), { x: 60, y: 120 });
    expect(feet.x).toBeCloseTo(60);
    expect(feet.y).toBeCloseTo(120);
  });

  it("moves Chris's binoculars, and the hands holding them, on their own as he looks", () => {
    const [glasses] = TEAM_ROOM_2_MOTIONS['chris-pence']!.props!;
    expect(glasses!.svg).toContain('<rect x="43" y="34" width="13" height="15" rx="4"');
    expect(glasses!.svg).toContain('<circle cx="43.5" cy="51.5" r="5.5"');
    const motion = compileCssAnimation(glasses!.motion!);
    expect(transformPoint(sampleCssAnimation(motion, 0.28 * 14_000), { x: 0, y: 0 })).toEqual({
      x: expect.closeTo(-2.5) as number,
      y: expect.closeTo(-1.5) as number,
    });
    expect(transformPoint(sampleCssAnimation(motion, 0.76 * 14_000), { x: 0, y: 0 }).x).toBeCloseTo(
      2.5,
    );
  });

  it("raises Chris's arms on his card, leaving the binoculars to the moving layer", () => {
    const svg = renderCardFigure('chrisPenceArmsRaised', 'x');
    expect(svg).toContain('transform="rotate(-149 30 74)"');
    expect(svg).toContain('transform="rotate(149 90 74)"');
    expect(svg).not.toContain('<rect x="43" y="34" width="13" height="15"');
    expect(svg).not.toContain('<rect x="47" y="78" width="11" height="16"');
  });
});
