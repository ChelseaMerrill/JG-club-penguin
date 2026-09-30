import { describe, expect, it } from 'vitest';
import { screenToTile } from '../../game/rooms/iso';
import { teamRoom3 } from '../../game/rooms/definitions/team-room-3';
import { getNpcMotion } from '../npc-motions';
import { TEAM_ROOM_3_MOTIONS } from './team-room-3';

describe('Team Room 3 NPC motions', () => {
  it('registers no motion: the design animates none of its NPCs', () => {
    // `design/Team Room 3.dc.html`'s only animations are `rats` (Casey's
    // speech bubble), `blink` (the HALLWAY nav pill) and an unused `bob`.
    expect(Object.keys(TEAM_ROOM_3_MOTIONS)).toEqual([]);
    for (const id of ['millie-team-room-3', 'casey-team-room-3', 'sydney-team-room-3']) {
      expect(getNpcMotion(id), id).toBeUndefined();
    }
  });

  it("stands each NPC on the tile under the design's own drawing of them", () => {
    // Stage points from the design: Millie's and Sydney's shadow ellipses
    // (615,503) and (899,633.5); Casey, seated on the couch, has no shadow of
    // her own, so her figure's feet: x 807.2 + 69.6 / 2, y 325.2 + 75.4.
    const designFeet = {
      'millie-team-room-3': { x: 615, y: 503 },
      'casey-team-room-3': { x: 842, y: 400.6 },
      'sydney-team-room-3': { x: 899, y: 633.5 },
    };
    const slots = Object.fromEntries(teamRoom3.npcSlots.map((slot) => [slot.npcId, slot.tile]));
    expect(Object.keys(slots).sort()).toEqual(Object.keys(designFeet).sort());
    for (const [id, feet] of Object.entries(designFeet)) {
      expect(slots[id], id).toEqual(screenToTile(feet, teamRoom3.grid.origin));
      expect(teamRoom3.walkable[slots[id]!.row]![slots[id]!.col], `${id}'s own tile`).toBe(false);
    }
  });
});
