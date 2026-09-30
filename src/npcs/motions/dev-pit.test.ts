import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { devPit } from '../../game/rooms/definitions/dev-pit';
import type { NpcId } from '../npcs';
import { DEV_PIT_MOTIONS } from './dev-pit';

const ORIGIN = { x: 800, y: 250 };
const REST = { x: 600, y: 425 }; // Ian's own slot point (1,5)

describe('Dev Pit NPC motions (#113)', () => {
  it('registers a motion for every Dev Pit NPC that moves, and no other', () => {
    // Dom (2026-09-25) and Ryan and Sam (2026-09-30) removed (owner
    // requests, Track D): no longer Dev Pit NPCs. Ian's and Steven's walks
    // are authored (see `dev-pit.ts`'s comments), not from the design.
    expect((Object.keys(DEV_PIT_MOTIONS) as NpcId[]).sort()).toEqual(['ian', 'steven']);
  });

  it('compiles every Dev Pit motion spec without throwing', () => {
    for (const spec of Object.values(DEV_PIT_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("samples Ian's authored ianWalk path at its 22% stop, 3.96s into the 18s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.ian!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 3_960), { x: 0, y: 0 });
    // The (0,5) waypoint, one tile west of his (1,5) slot.
    expect(point.x).toBeCloseTo(-50);
    expect(point.y).toBeCloseTo(-25);
  });

  it("samples Ian's reused idle figure bob at its 50% stop, 1.5s into the 3s loop", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.ian!.figure!);
    const matrix = sampleCssAnimation(compiled, 1_500);
    const point = transformPoint(matrix, { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(-3);
  });

  it("samples Steven's authored stevenWalk path in its 42%-48% hold at the (4,0) waypoint", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS.steven!.path!);
    // 6s after load is 9s into the 20s loop (its delay is -3s): 45%.
    const point = transformPoint(sampleCssAnimation(compiled, 6_000), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(-100);
    expect(point.y).toBeCloseTo(-100);
  });

  it("walks Steven only over walkable tiles that aren't another NPC's slot", () => {
    const home = devPit.npcSlots.find((slot) => slot.npcId === 'steven')!.tile;
    // His waypoints, then every tile on the straight legs between them.
    const loop = [home, { col: 7, row: 0 }, { col: 4, row: 0 }, { col: 4, row: 1 }, home];
    const others = devPit.npcSlots.filter((slot) => slot.npcId !== 'steven');
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
        if (!isHome) expect(devPit.walkable[tile.row]?.[tile.col], JSON.stringify(tile)).toBe(true);
        expect(
          others.some((slot) => slot.tile.col === tile.col && slot.tile.row === tile.row),
          JSON.stringify(tile),
        ).toBe(false);
      }
    }
  });
});
