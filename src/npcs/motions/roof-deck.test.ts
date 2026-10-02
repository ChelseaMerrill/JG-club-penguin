import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  sampleCssOpacity,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import { roofDeck } from '../../game/rooms/definitions/roof-deck';
import { NPCS, type NpcId } from '../npcs';
import { BICH_ROUTE, BICH_WATERING_OFFSET, EVA_ROUTE, ROOF_DECK_MOTIONS, walk } from './roof-deck';

const ORIGIN = roofDeck.grid.origin;
const REST = { x: 0, y: 0 };

type Tile = { col: number; row: number };
const same = (a: Tile, b: Tile): boolean => a.col === b.col && a.row === b.row;
const isPlant = (tile: Tile): boolean => (roofDeck.plants ?? []).some((p) => same(p, tile));

/** Every tile on the straight legs between `route`'s tiles, looping back to its first. */
function tilesWalked(route: readonly Tile[]): Tile[] {
  const loop = [...route, route[0]!];
  const tiles: Tile[] = [];
  for (let leg = 0; leg < loop.length - 1; leg += 1) {
    const a = loop[leg]!;
    const b = loop[leg + 1]!;
    const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    for (let step = 0; step <= steps; step += 1) {
      tiles.push({
        col: Math.round(a.col + ((b.col - a.col) * step) / Math.max(steps, 1)),
        row: Math.round(a.row + ((b.row - a.row) * step) / Math.max(steps, 1)),
      });
    }
  }
  return tiles;
}

function slotOf(id: NpcId): Tile {
  return roofDeck.npcSlots.find((slot) => slot.npcId === id)!.tile;
}

describe("The Market's NPC motions (owner request, 2026-10-02)", () => {
  it('registers Bich and Eva, both Market NPCs, and no one else', () => {
    expect(Object.keys(ROOF_DECK_MOTIONS).sort()).toEqual(['bich-dudla', 'eva-trimboli']);
    for (const id of Object.keys(ROOF_DECK_MOTIONS) as NpcId[]) {
      expect(NPCS[id].roomId).toBe('roof-deck');
    }
  });

  it('compiles every Market motion spec without throwing', () => {
    for (const spec of Object.values(ROOF_DECK_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it('starts each walk at its slot', () => {
    expect(BICH_ROUTE[0]).toEqual(slotOf('bich-dudla'));
    expect(EVA_ROUTE[0]).toEqual(slotOf('eva-trimboli'));
  });

  it('walks Bich and Eva only over walkable tiles off everyone else’s slot', () => {
    for (const [id, route] of [
      ['bich-dudla', BICH_ROUTE.filter((tile) => !tile.plant)],
      ['eva-trimboli', EVA_ROUTE],
    ] as const) {
      const home = slotOf(id);
      const others = roofDeck.npcSlots.filter((slot) => slot.npcId !== id);
      for (const tile of tilesWalked(route)) {
        const where = `${id} (${tile.col},${tile.row})`;
        if (!same(tile, home)) expect(roofDeck.walkable[tile.row]![tile.col], where).toBe(true);
        expect(isPlant(tile), where).toBe(false);
        expect(
          others.some((s) => same(s.tile, tile)),
          where,
        ).toBe(false);
      }
    }
  });

  it('stops Bich beside four of the plants, reached from a walkable neighbour', () => {
    const stops = BICH_ROUTE.filter((tile) => tile.plant);
    expect(stops).toHaveLength(4);
    for (const plant of stops) {
      expect(isPlant(plant)).toBe(true);
      // She stands at its right: between the tile one column on and the one a row back.
      const neighbours = [
        { col: plant.col + 1, row: plant.row },
        { col: plant.col, row: plant.row - 1 },
      ];
      expect(
        neighbours.some((n) => roofDeck.walkable[n.row]?.[n.col]),
        `(${plant.col},${plant.row})`,
      ).toBe(true);
    }
    expect(BICH_WATERING_OFFSET.x).toBeGreaterThan(0);
  });

  it('times a walk by leg length and holds at each stop', () => {
    const w = walk(
      't',
      [
        { x: 0, y: 0 },
        { x: 100, y: 0, holdS: 2 },
      ],
      50,
    );
    // 2 s out, 2 s there, 2 s back.
    expect(w.periodS).toBeCloseTo(6);
    expect(w.holds).toHaveLength(1);
    expect(w.holds[0]![0]).toBeCloseTo(100 / 3);
    expect(w.holds[0]![1]).toBeCloseTo(200 / 3);
    const compiled = compileCssAnimation(w.path);
    const at = (ms: number) => transformPoint(sampleCssAnimation(compiled, ms), { x: 0, y: 0 });
    expect(at(3_000).x).toBeCloseTo(100);
    expect(at(0).x).toBeCloseTo(0);
  });

  it('pours only while Bich stands at a plant: the can tips and the water shows', () => {
    const spec = ROOF_DECK_MOTIONS['bich-dudla']!;
    const path = compileCssAnimation(spec.path!);
    const can = compileCssAnimation(spec.props![0]!.motion!);
    const water = compileCssAnimation(spec.props![1]!.motion!);
    const where = (ms: number) => transformPoint(sampleCssAnimation(path, ms), { x: 0, y: 0 });
    let pouring = 0;
    for (let ms = 0; ms < path.durationMs; ms += 100) {
      const m = sampleCssAnimation(can, ms);
      const tipped = Math.abs(Math.atan2(m.b, m.a)) > 0.3;
      const wet = sampleCssOpacity(water, ms) > 0.5;
      if (wet) {
        pouring += 1;
        expect(tipped, `tipped at ${ms}ms`).toBe(true);
        // Standing still: no move over the next tenth of a second.
        const a = where(ms);
        const b = where(ms + 100);
        expect(Math.hypot(b.x - a.x, b.y - a.y), `still at ${ms}ms`).toBeLessThan(0.5);
      }
    }
    // Four plants, a few seconds each.
    expect(pouring * 100).toBeGreaterThan(4 * 2_500);
  });
});
