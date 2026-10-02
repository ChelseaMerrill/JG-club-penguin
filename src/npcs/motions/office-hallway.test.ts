import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { officeHallway } from '../../game/rooms/definitions/office-hallway';
import { NPCS, type NpcId } from '../npcs';
import { OFFICE_HALLWAY_MOTIONS } from './office-hallway';

const ORIGIN = officeHallway.grid.origin;
const REST = { x: 0, y: 0 };

describe("The Hallway's NPC motions (owner request, 2026-10-02)", () => {
  it('registers a motion for Emily only, a Hallway NPC', () => {
    expect(Object.keys(OFFICE_HALLWAY_MOTIONS)).toEqual(['emily']);
    for (const id of Object.keys(OFFICE_HALLWAY_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('office-hallway');
    }
  });

  it('compiles every Hallway motion spec without throwing', () => {
    for (const spec of Object.values(OFFICE_HALLWAY_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("holds Emily's emilyLap at its (10,1) corner, 52.5% of the 32s loop", () => {
    const compiled = compileCssAnimation(OFFICE_HALLWAY_MOTIONS.emily!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 16_800), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(400);
    expect(point.y).toBeCloseTo(100);
  });

  it("walks Emily only over walkable tiles that aren't another NPC's slot", () => {
    const home = officeHallway.npcSlots.find((slot) => slot.npcId === 'emily')!.tile;
    const loop = [
      home,
      { col: 4, row: 1 },
      { col: 10, row: 1 },
      { col: 10, row: 2 },
      { col: 4, row: 2 },
      home,
    ];
    const others = officeHallway.npcSlots.filter((slot) => slot.npcId !== 'emily');
    for (let leg = 0; leg < loop.length - 1; leg += 1) {
      const a = loop[leg]!;
      const b = loop[leg + 1]!;
      const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
      for (let step = 0; step <= steps; step += 1) {
        const tile = {
          col: a.col + Math.sign(b.col - a.col) * step,
          row: a.row + Math.sign(b.row - a.row) * step,
        };
        const isHome = tile.col === home.col && tile.row === home.row;
        if (!isHome) {
          expect(officeHallway.walkable[tile.row]![tile.col], `(${tile.col},${tile.row})`).toBe(
            true,
          );
        }
        expect(others.some((s) => s.tile.col === tile.col && s.tile.row === tile.row)).toBe(false);
      }
    }
  });
});
