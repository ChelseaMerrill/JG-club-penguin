import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  decomposeAffine,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { npcScale } from '../../game/npcs/npc-layout';
import { getNpcMotion } from '../npc-motions';
import { NPCS } from '../npcs';
import { TEAM_ROOM_1_MOTIONS } from './team-room-1';
import { TEAM_ROOM_2_MOTIONS } from './team-room-2';

describe('Team Room 2 NPC motions (#149)', () => {
  it("registers Ian's bob only, reachable through the registry", () => {
    expect(Object.keys(TEAM_ROOM_2_MOTIONS)).toEqual(['ian-team-room-2']);
    expect(getNpcMotion('ian-team-room-2')).toBe(TEAM_ROOM_2_MOTIONS['ian-team-room-2']);
    // Dev Pit's Ian keeps his own motion.
    expect(getNpcMotion('ian')).not.toBe(TEAM_ROOM_2_MOTIONS['ian-team-room-2']);
  });

  it("bobs Ian as Team Room 1's Jethro does: 2.4s, delayed -0.6s, 6 Stage px up and 2deg tilted at its top", () => {
    const spec = TEAM_ROOM_2_MOTIONS['ian-team-room-2']!;
    expect(spec.figure).toEqual(TEAM_ROOM_1_MOTIONS['jethro-team-room-1']!.figure);
    expect(spec.figure!.animation).toBe('bob 2.4s ease-in-out -0.6s infinite');
    expect(spec.path).toBeUndefined();
    // The -0.6s delay puts the 50% peak at 0.6 s.
    const matrix = sampleCssAnimation(compileCssAnimation(spec.figure!), 600);
    expect((decomposeAffine(matrix).rotation * 180) / Math.PI).toBeCloseTo(2);
    const feet = transformPoint(matrix, { x: 60, y: 130 });
    expect(feet.x).toBeCloseTo(60);
    // He draws at the Room design's 70/120, so that is 6 Stage px.
    expect(npcScale(NPCS['ian-team-room-2'])).toBeCloseTo(70 / 120, 10);
    expect((feet.y - 130) * npcScale(NPCS['ian-team-room-2'])).toBeCloseTo(-6, 1);
  });
});
