import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { HUMAN_NPC_SCALE } from '../../game/npcs/npc-layout';
import { theIcebox } from '../../game/rooms/definitions/the-icebox';
import { npcSlotPoint, screenToTile } from '../../game/rooms/iso';
import type { NpcId } from '../npcs';
import { JETHRO_CAMERA_PROPS } from './team-room-1';
import { THE_ICEBOX_MOTIONS } from './the-icebox';

const ORIGIN = { x: 800, y: 250 };
const REST = { x: 840, y: 310 }; // Millie's own slot point in the design

describe('The Icebox NPC motions (#113)', () => {
  it("registers a motion for every one of this Room's NPCs", () => {
    // Millie, Jason and Darrin left (owner request, 2026-10-02, Track D); the
    // three at the table only bob.
    expect((Object.keys(THE_ICEBOX_MOTIONS) as NpcId[]).sort()).toEqual([
      'dan-bedian',
      'greg-westover',
      'jethro',
      'nicole',
      'paul-carnival',
    ]);
  });

  it('seats the three at the table: they bob in place, with no walk', () => {
    for (const id of ['dan-bedian', 'paul-carnival', 'greg-westover'] as const) {
      expect(THE_ICEBOX_MOTIONS[id]!.path, id).toBeUndefined();
      expect(THE_ICEBOX_MOTIONS[id]!.figure, id).toBeDefined();
    }
  });

  it('compiles every Icebox motion spec without throwing', () => {
    for (const spec of Object.values(THE_ICEBOX_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it("samples Jethro's jetRoam path at its 65% stop, 16.9s into the 26s loop", () => {
    const compiled = compileCssAnimation(THE_ICEBOX_MOTIONS.jethro!.path!);
    const point = transformPoint(sampleCssAnimation(compiled, 16_900), { x: 0, y: 0 });
    // The design's translate(20px, 100px), less its 0% frame (-20px, 65px).
    expect(point.x).toBeCloseTo(40);
    expect(point.y).toBeCloseTo(35);
    expect(transformPoint(sampleCssAnimation(compiled, 0), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("keeps Jethro's whole walk on the Icebox floor, at the design's own points", () => {
    const slot = theIcebox.npcSlots.find((candidate) => candidate.npcId === 'jethro')!;
    const start = npcSlotPoint(slot, theIcebox.grid.origin);
    // The design's 0% point: shadow (590, 525) + translate(-20px, 65px).
    expect(start).toEqual({ x: 570, y: 590 });
    const compiled = compileCssAnimation(THE_ICEBOX_MOTIONS.jethro!.path!);
    for (let ms = 0; ms < 26_000; ms += 250) {
      const offset = transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
      const tile = screenToTile(
        { x: start.x + offset.x, y: start.y + offset.y },
        theIcebox.grid.origin,
      );
      expect(tile.col, `col at ${ms} ms`).toBeGreaterThanOrEqual(0);
      expect(tile.row, `row at ${ms} ms`).toBeGreaterThanOrEqual(0);
      expect(tile.col, `col at ${ms} ms`).toBeLessThan(theIcebox.grid.columns);
      expect(tile.row, `row at ${ms} ms`).toBeLessThan(theIcebox.grid.rows);
    }
  });

  it('takes photos as he walks, with the same camera raise as Team Room 1', () => {
    expect(THE_ICEBOX_MOTIONS.jethro!.props).toBe(JETHRO_CAMERA_PROPS);
    expect(THE_ICEBOX_MOTIONS.jethro!.replaceFigureRestPose).toBe(true);
  });

  it("bobs the design's NPCs 3 Stage px at the shared roam-idle's 50% stop, .55s into the 1.1s loop", () => {
    // The design's `idle` (translateY(-3px)) wraps the figure's scaled `<svg>`
    // from outside, so it moves 3 Stage px; a `figure` track runs inside the
    // 0.62 scaled wrapper instead. The three new at the table bob as their
    // cards do instead.
    for (const spec of [THE_ICEBOX_MOTIONS.nicole, THE_ICEBOX_MOTIONS.jethro]) {
      const compiled = compileCssAnimation(spec!.figure!);
      const point = transformPoint(sampleCssAnimation(compiled, 550), { x: 0, y: 0 });
      expect(point.x).toBeCloseTo(0);
      expect(point.y * HUMAN_NPC_SCALE).toBeCloseTo(-3);
    }
  });
});
