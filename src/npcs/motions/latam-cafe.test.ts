import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { latamCafe } from '../../game/rooms/definitions/latam-cafe';
import { npcSlotPoint, screenToTile } from '../../game/rooms/iso';
import type { NpcId } from '../npcs';
import { LATAM_CAFE_MOTIONS } from './latam-cafe';

const STILL_IDS = [
  'alexandre-nunes',
  'ygor-azevedo',
  'fernanda-gioiosa',
  'jean-rodrigues',
  'sander-nonaka',
] as const;

const WALKING_IDS = ['joao-vitor-amorim', 'vinicius-martins'] as const;

describe('The LATAM Café NPC motions (owner request, 2026-10-09)', () => {
  it("registers a motion for every one of this Room's NPCs", () => {
    expect((Object.keys(LATAM_CAFE_MOTIONS) as NpcId[]).sort()).toEqual(
      [...STILL_IDS, ...WALKING_IDS].sort(),
    );
  });

  it('bobs the five who stand still, with no walk', () => {
    for (const id of STILL_IDS) {
      expect(LATAM_CAFE_MOTIONS[id]!.path, id).toBeUndefined();
      expect(LATAM_CAFE_MOTIONS[id]!.figure, id).toBeDefined();
    }
  });

  it('walks Joao Vitor Amorim and Vinicius Martins, each with its own figure bob', () => {
    for (const id of WALKING_IDS) {
      expect(LATAM_CAFE_MOTIONS[id]!.path, id).toBeDefined();
      expect(LATAM_CAFE_MOTIONS[id]!.figure, id).toBeDefined();
    }
  });

  it('compiles every motion spec without throwing', () => {
    for (const [id, motion] of Object.entries(LATAM_CAFE_MOTIONS)) {
      if (motion.path) expect(() => compileCssAnimation(motion.path!), id).not.toThrow();
      if (motion.figure) expect(() => compileCssAnimation(motion.figure!), id).not.toThrow();
    }
  });

  it.each(WALKING_IDS)(
    "keeps %s's whole walk on the Room's floor, starting and ending at its own slot",
    (id) => {
      const slot = latamCafe.npcSlots.find((candidate) => candidate.npcId === id)!;
      const start = npcSlotPoint(slot, latamCafe.grid.origin);
      const compiled = compileCssAnimation(LATAM_CAFE_MOTIONS[id]!.path!);
      expect(transformPoint(sampleCssAnimation(compiled, 0), { x: 0, y: 0 })).toEqual({
        x: 0,
        y: 0,
      });
      // The design's round trip is a straight line (A;B;A), so 18s (the
      // longer of the two) covers both with headroom.
      for (let ms = 0; ms < 18_000; ms += 250) {
        const offset = transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
        const tile = screenToTile(
          { x: start.x + offset.x, y: start.y + offset.y },
          latamCafe.grid.origin,
        );
        expect(tile.col, `col at ${ms} ms`).toBeGreaterThanOrEqual(0);
        expect(tile.row, `row at ${ms} ms`).toBeGreaterThanOrEqual(0);
        expect(tile.col, `col at ${ms} ms`).toBeLessThan(latamCafe.grid.columns);
        expect(tile.row, `row at ${ms} ms`).toBeLessThan(latamCafe.grid.rows);
      }
    },
  );
});
