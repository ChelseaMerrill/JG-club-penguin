import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { latamFutebolField } from '../../game/rooms/definitions/latam-futebol-field';
import { npcSlotPoint, screenToTile } from '../../game/rooms/iso';
import type { NpcId } from '../npcs';
import { LATAM_FUTEBOL_FIELD_MOTIONS } from './latam-futebol-field';

const ORIGIN = latamFutebolField.grid.origin;
const REST = { x: 800, y: 500 }; // arbitrary; only used by createNpcMotion's smoke test below

/** Each person's own design `dur`, in ms (`latam-futebol-field.ts`'s own comment). */
const DURATION_MS: Record<string, number> = {
  'thalles-stakonski': 17_000,
  'bruno-amado': 19_000,
  'washington-marino': 22_000,
  'chrystian-rissoli': 20_000,
  'paulo-ponciano': 24_000,
  'gustavo-barska': 21_000,
};

describe('The LATAM Futebol Field NPC motions', () => {
  it("registers a motion for every one of this Room's NPCs", () => {
    expect((Object.keys(LATAM_FUTEBOL_FIELD_MOTIONS) as NpcId[]).sort()).toEqual([
      'bruno-amado',
      'chrystian-rissoli',
      'gustavo-barska',
      'paulo-ponciano',
      'thalles-stakonski',
      'washington-marino',
    ]);
  });

  it('gives every one of them a path (the ping-pong walk) and a figure (the walk bob), never seated', () => {
    for (const spec of Object.values(LATAM_FUTEBOL_FIELD_MOTIONS)) {
      expect(spec.path).toBeDefined();
      expect(spec.figure).toBeDefined();
    }
  });

  it('compiles every motion spec without throwing', () => {
    for (const spec of Object.values(LATAM_FUTEBOL_FIELD_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("repeats every loop exactly, on each person's own design `dur` (a negative `begin` only shifts its phase, never its period)", () => {
    for (const [id, spec] of Object.entries(LATAM_FUTEBOL_FIELD_MOTIONS)) {
      const compiled = compileCssAnimation(spec.path!);
      const duration = DURATION_MS[id]!;
      for (const ms of [0, 1_000, duration / 2]) {
        const here = transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
        const oneLoopLater = transformPoint(sampleCssAnimation(compiled, ms + duration), {
          x: 0,
          y: 0,
        });
        expect(oneLoopLater.x, `${id} at ${ms} ms`).toBeCloseTo(here.x);
        expect(oneLoopLater.y, `${id} at ${ms} ms`).toBeCloseTo(here.y);
      }
    }
  });

  it('returns Thalles (the one walker with no stagger, `begin="0s"`) to his own slot point at the start and end of his loop', () => {
    const compiled = compileCssAnimation(LATAM_FUTEBOL_FIELD_MOTIONS['thalles-stakonski']!.path!);
    expect(transformPoint(sampleCssAnimation(compiled, 0), { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
    });
    const end = transformPoint(sampleCssAnimation(compiled, 16_999), { x: 0, y: 0 });
    expect(end.x).toBeCloseTo(0, 0);
    expect(end.y).toBeCloseTo(0, 0);
  });

  it("keeps every one of them on the pitch's own floor for its whole loop, starting at its own slot", () => {
    for (const [id, spec] of Object.entries(LATAM_FUTEBOL_FIELD_MOTIONS)) {
      const slot = latamFutebolField.npcSlots.find((candidate) => candidate.npcId === id)!;
      const start = npcSlotPoint(slot, ORIGIN);
      const compiled = compileCssAnimation(spec.path!);
      const duration = DURATION_MS[id]!;
      for (let ms = 0; ms < duration; ms += 250) {
        const offset = transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
        const tile = screenToTile({ x: start.x + offset.x, y: start.y + offset.y }, ORIGIN);
        expect(tile.col, `${id} col at ${ms} ms`).toBeGreaterThanOrEqual(0);
        expect(tile.row, `${id} row at ${ms} ms`).toBeGreaterThanOrEqual(0);
        expect(tile.col, `${id} col at ${ms} ms`).toBeLessThan(latamFutebolField.grid.columns);
        expect(tile.row, `${id} row at ${ms} ms`).toBeLessThan(latamFutebolField.grid.rows);
      }
    }
  });

  it("samples Thalles's walk at its 50% stop, the design's own far point", () => {
    const compiled = compileCssAnimation(LATAM_FUTEBOL_FIELD_MOTIONS['thalles-stakonski']!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 8_500), { x: 0, y: 0 });
    // The design's `values="810 405;1115 567.5;810 405"`: 1115-810, 567.5-405.
    expect(point.x).toBeCloseTo(305);
    expect(point.y).toBeCloseTo(162.5);
  });

  it("bobs every one of them 4 Stage px at the design's own .6s walk-bob's 50% stop, at its 0.58 draw scale", () => {
    const LATAM_NPC_SCALE = 0.58;
    for (const spec of Object.values(LATAM_FUTEBOL_FIELD_MOTIONS)) {
      const compiled = compileCssAnimation(spec.figure!);
      const point = transformPoint(sampleCssAnimation(compiled, 300), { x: 0, y: 0 });
      expect(point.x).toBeCloseTo(0);
      expect(point.y * LATAM_NPC_SCALE).toBeCloseTo(-4, 1);
    }
  });
});
