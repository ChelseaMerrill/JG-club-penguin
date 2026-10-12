import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { npcLayout } from '../../game/npcs/npc-layout';
import { depthForTile, npcSlotPoint, screenToTile } from '../../game/rooms/iso';
import { NPCS } from '../npcs';
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
    // Casey and Millie left (owner request, 2026-10-02); Sydney stays.
    const designFeet = {
      'sydney-team-room-3': { x: 899, y: 633.5 },
    };
    const slots = Object.fromEntries(teamRoom3.npcSlots.map((slot) => [slot.npcId, slot.tile]));
    expect(Object.keys(slots).sort()).toEqual(Object.keys(designFeet).sort());
    for (const [id, feet] of Object.entries(designFeet)) {
      expect(slots[id], id).toEqual(screenToTile(feet, teamRoom3.grid.origin));
      expect(teamRoom3.walkable[slots[id]!.row]![slots[id]!.col], `${id}'s own tile`).toBe(false);
    }
  });

  it("draws each NPC at the design's own figure box, at its 0.58 scale", () => {
    // Each design figure: `<svg x y width="69.6" height="75.4" viewBox="0 0
    // 120 130">`, whose feet (120,0 of the viewBox's 60,120) sit at x + 60 *
    // 0.58, y + 120 * 0.58 (owner request, 2026-09-30, Track D).
    const figureBoxes = {
      'sydney-team-room-3': { x: 864.2, y: 547.7 },
    };
    for (const [id, box] of Object.entries(figureBoxes)) {
      const slot = teamRoom3.npcSlots.find((candidate) => candidate.npcId === id)!;
      const point = npcSlotPoint(slot, teamRoom3.grid.origin);
      expect(point.x, id).toBeCloseTo(box.x + 60 * 0.58, 1);
      expect(point.y, id).toBeCloseTo(box.y + 120 * 0.58, 1);
      expect(npcLayout(NPCS[id as keyof typeof NPCS]).scale, id).toBe(0.58);
    }
  });

  it('draws the furniture in front of each NPC from its own exported image, just in front of its tile', () => {
    const layers = teamRoom3.foregrounds ?? [];
    expect(layers.map((layer) => layer.overNpcId)).toEqual(['sydney-team-room-3']);
    for (const layer of layers) {
      expect(existsSync(path.join('public', layer.url)), layer.url).toBe(true);
      const slot = teamRoom3.npcSlots.find((candidate) => candidate.npcId === layer.overNpcId);
      expect(slot, layer.overNpcId).toBeDefined();
    }
    // Keys are unique, so each loads its own texture.
    expect(new Set(layers.map((layer) => layer.key)).size).toBe(layers.length);
    // "Just in front": the nearest other tile sorts at least a whole 1 away.
    expect(
      depthForTile({ col: 2, row: 4 }) - depthForTile({ col: 1, row: 4 }),
    ).toBeGreaterThanOrEqual(1);
  });
});
