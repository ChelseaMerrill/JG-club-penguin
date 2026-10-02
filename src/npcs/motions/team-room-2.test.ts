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

describe('Team Room 2 (owner request, 2026-10-02)', () => {
  it('seats Nick Brown and Frank Nardone at their desks, bobbing, and stands Chris Pence in the corner', () => {
    expect(teamRoom2.npcSlots.map((slot) => slot.npcId).sort()).toEqual([
      'chris-pence',
      'frank-nardone',
      'nick-brown',
    ]);
    expect(Object.keys(TEAM_ROOM_2_MOTIONS).sort()).toEqual(['frank-nardone', 'nick-brown']);
    for (const id of ['nick-brown', 'frank-nardone'] as const) {
      expect(getNpcMotion(id)?.path, id).toBeUndefined();
      const bob = compileCssAnimation(TEAM_ROOM_2_MOTIONS[id]!.figure!);
      const half = bob.durationMs / 2;
      expect(transformPoint(sampleCssAnimation(bob, half), { x: 0, y: 0 }).y).toBeCloseTo(-3.41);
    }
    expect(teamRoom2.foregrounds?.map((layer) => layer.overNpcId).sort()).toEqual([
      'frank-nardone',
      'nick-brown',
    ]);
  });

  it("raises Chris's binoculars to his eyes instead of hanging them on his chest", () => {
    const svg = renderCardFigure('chrisPenceBinoculars', 'x');
    expect(svg).toContain('<rect x="43" y="34" width="13" height="15" rx="4" fill="#2a2d31"');
    expect(svg).not.toContain('<rect x="47" y="78" width="11" height="16"');
    expect(svg).toContain('transform="rotate(-149 30 74)"');
  });
});
