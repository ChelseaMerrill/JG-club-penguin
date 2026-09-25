import { describe, expect, it } from 'vitest';
import {
  arcPoint,
  clampTileToGrid,
  generateThrowId,
  HIT_ELLIPSE_RX,
  HIT_ELLIPSE_RY,
  pickHit,
  ThrowMemory,
  type HitCandidate,
} from './snowball-rules';

describe('arcPoint', () => {
  it('starts at from and ends at to', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };

    expect(arcPoint(from, to, 0)).toEqual(from);
    expect(arcPoint(from, to, 1)).toEqual(to);
  });

  it('rises above the straight line at the midpoint, by max(80, 0.35*distance)', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    // distance 100 -> lift max(80, 35) = 80; control y = -80; midpoint (t=0.5)
    // of a quadratic Bezier is exactly the average of the three points' components.
    const mid = arcPoint(from, to, 0.5);

    expect(mid.x).toBeCloseTo(50);
    // y = 0.25*from.y + 0.5*control.y + 0.25*to.y = 0.5 * -80 = -40
    expect(mid.y).toBeCloseTo(-40);
  });

  it('uses 0.35*distance once that exceeds the 80px floor', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1000, y: 0 };
    // distance 1000 -> lift = 350; control y = -350
    const mid = arcPoint(from, to, 0.5);

    expect(mid.y).toBeCloseTo(-175);
  });
});

describe('pickHit', () => {
  const landing = { x: 100, y: 100 };

  it('picks the candidate whose point lies inside the hit ellipse', () => {
    const candidates: HitCandidate[] = [
      { playerId: 'far', point: { x: 500, y: 500 } },
      { playerId: 'close', point: { x: 110, y: 105 } },
    ];

    expect(pickHit(landing, candidates)).toBe('close');
  });

  it('returns null when no candidate is inside the ellipse', () => {
    const candidates: HitCandidate[] = [{ playerId: 'far', point: { x: 500, y: 500 } }];

    expect(pickHit(landing, candidates)).toBeNull();
  });

  it('returns null with no candidates (#53 O3: no shown remote Penguins)', () => {
    expect(pickHit(landing, [])).toBeNull();
  });

  it('picks the nearest by normalised ellipse distance when several are inside', () => {
    const candidates: HitCandidate[] = [
      { playerId: 'nearer', point: { x: landing.x + 10, y: landing.y } },
      { playerId: 'farther', point: { x: landing.x + 40, y: landing.y } },
    ];

    expect(pickHit(landing, candidates)).toBe('nearer');
  });

  it('treats a point exactly on the ellipse boundary as inside', () => {
    const onBoundary: HitCandidate[] = [
      { playerId: 'edge', point: { x: landing.x + HIT_ELLIPSE_RX, y: landing.y } },
    ];

    expect(pickHit(landing, onBoundary)).toBe('edge');
  });

  it('rejects a point just outside the ellipse boundary', () => {
    const outside: HitCandidate[] = [
      { playerId: 'edge', point: { x: landing.x + HIT_ELLIPSE_RX + 1, y: landing.y } },
    ];

    expect(pickHit(landing, outside)).toBeNull();
  });

  it('uses the ry half-extent on the vertical axis', () => {
    const inside: HitCandidate[] = [
      { playerId: 'v', point: { x: landing.x, y: landing.y + HIT_ELLIPSE_RY } },
    ];
    const outside: HitCandidate[] = [
      { playerId: 'v', point: { x: landing.x, y: landing.y + HIT_ELLIPSE_RY + 1 } },
    ];

    expect(pickHit(landing, inside)).toBe('v');
    expect(pickHit(landing, outside)).toBeNull();
  });
});

describe('generateThrowId', () => {
  it('matches the wire contract shape [A-Za-z0-9]{1,16}', () => {
    const id = generateThrowId();

    expect(id).toMatch(/^[A-Za-z0-9]{1,16}$/);
  });

  it('is deterministic given an injected random source', () => {
    const first = generateThrowId(() => 0);
    const second = generateThrowId(() => 0);

    expect(first).toBe(second);
    expect(first).toBe('AAAAAAAAAAAA');
  });
});

describe('ThrowMemory', () => {
  it('consumes a remembered, unused throwId from the same sender', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    expect(memory.consume('sender', 't1', 100)).toBe(true);
  });

  it('rejects an unknown throwId', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    expect(memory.consume('sender', 'unknown', 100)).toBe(false);
  });

  it('rejects a throwId reused after it was already consumed (one hit per throw)', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    expect(memory.consume('sender', 't1', 100)).toBe(true);
    expect(memory.consume('sender', 't1', 200)).toBe(false);
  });

  it('rejects a throwId from the wrong sender', () => {
    const memory = new ThrowMemory();
    memory.remember('sender-a', 't1', 0);

    expect(memory.consume('sender-b', 't1', 100)).toBe(false);
  });

  it('rejects a throwId once its 3s expiry has passed', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    expect(memory.consume('sender', 't1', 3000)).toBe(false);
  });

  it('accepts a throwId just under the 3s expiry', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    expect(memory.consume('sender', 't1', 2999)).toBe(true);
  });

  it('keeps only the last 8 remembered throws per sender', () => {
    const memory = new ThrowMemory();
    for (let i = 0; i < 9; i++) memory.remember('sender', `t${i}`, 0);

    // The oldest (t0) was evicted; the newest (t8) is still available.
    expect(memory.consume('sender', 't0', 0)).toBe(false);
    expect(memory.consume('sender', 't8', 0)).toBe(true);
  });

  it('clear() forgets every remembered throw', () => {
    const memory = new ThrowMemory();
    memory.remember('sender', 't1', 0);

    memory.clear();

    expect(memory.consume('sender', 't1', 0)).toBe(false);
  });
});

describe('clampTileToGrid', () => {
  const grid = { columns: 12, rows: 10 };

  it('leaves an in-grid tile unchanged', () => {
    expect(clampTileToGrid({ col: 5, row: 4 }, grid)).toEqual({ col: 5, row: 4 });
  });

  it('clamps a negative coordinate to 0', () => {
    expect(clampTileToGrid({ col: -3, row: -1 }, grid)).toEqual({ col: 0, row: 0 });
  });

  it('clamps a coordinate past the grid to the last in-grid tile', () => {
    expect(clampTileToGrid({ col: 50, row: 50 }, grid)).toEqual({ col: 11, row: 9 });
  });

  it('never exceeds the wire contract max of 255 even for a huge grid', () => {
    const hugeGrid = { columns: 1000, rows: 1000 };

    expect(clampTileToGrid({ col: 9999, row: 9999 }, hugeGrid)).toEqual({ col: 255, row: 255 });
  });
});
