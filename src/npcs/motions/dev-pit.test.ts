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
    // Dom (2026-09-25), Ryan and Sam (2026-09-30) and Steven (2026-10-02)
    // removed (owner requests, Track D): no longer Dev Pit NPCs. Every motion
    // here is authored (see `dev-pit.ts`'s comments), not from the design;
    // Ashley has none (she throws her chicken instead).
    expect((Object.keys(DEV_PIT_MOTIONS) as NpcId[]).sort()).toEqual([
      'alex-kelly',
      'alex-nikolis',
      'ian',
      'jesse-lucier',
    ]);
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

  it("samples Jesse Lucier's authored jesseLap path in its 50%-53% hold at the (4,8) corner", () => {
    const compiled = compileCssAnimation(DEV_PIT_MOTIONS['jesse-lucier']!.path!);
    // 15.45 s into the 30 s loop: 51.5%.
    const point = transformPoint(sampleCssAnimation(compiled, 15_450), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(-450);
    expect(point.y).toBeCloseTo(-75);
  });

  it('bobs the two Alexes at their desks, and nothing else: they sit working', () => {
    for (const id of ['alex-kelly', 'alex-nikolis'] as const) {
      const spec = DEV_PIT_MOTIONS[id]!;
      expect(spec.path, id).toBeUndefined();
      expect(spec.figure, id).toBeDefined();
    }
  });

  it("walks Jesse Lucier only over walkable tiles that aren't another NPC's slot", () => {
    const home = devPit.npcSlots.find((slot) => slot.npcId === 'jesse-lucier')!.tile;
    // His corners, then every tile on the straight legs between them.
    const loop = [home, { col: 10, row: 8 }, { col: 4, row: 8 }, { col: 4, row: 5 }, home];
    const others = devPit.npcSlots.filter((slot) => slot.npcId !== 'jesse-lucier');
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
