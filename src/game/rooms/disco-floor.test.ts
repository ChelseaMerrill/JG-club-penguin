import { describe, expect, it } from 'vitest';
import { discoTileColourAt, type DiscoFloorTile } from './disco-floor';

/** A plain 3-segment cycle, easy to hand-check at every stop. */
const TILE: DiscoFloorTile = {
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  colours: ['#000000', '#ffffff', '#ff0000', '#000000'],
  durationMs: 3000,
  beginMs: 0,
};

describe('discoTileColourAt', () => {
  it('lands exactly on each colour stop (0, 1/3, 2/3, and the loop back to the first)', () => {
    expect(discoTileColourAt(TILE, 0)).toBe('#000000');
    expect(discoTileColourAt(TILE, 1000)).toBe('#ffffff');
    expect(discoTileColourAt(TILE, 2000)).toBe('#ff0000');
    expect(discoTileColourAt(TILE, 3000)).toBe('#000000'); // one full loop
  });

  it('blends linearly at a midpoint between two stops', () => {
    // Halfway through the first segment (#000000 -> #ffffff): mid-grey.
    expect(discoTileColourAt(TILE, 500)).toBe('#808080');
    // Halfway through the second segment (#ffffff -> #ff0000): pink.
    expect(discoTileColourAt(TILE, 1500)).toBe('#ff8080');
  });

  it("wraps a negative `begin` the way SMIL's own clock does", () => {
    // begin = -2000ms is the same as having started the clock 2000ms early:
    // at t=0 the tile should already read as if 2000ms had elapsed on a
    // begin=0 clock (2/3 of the way through -- the #ff0000 stop exactly).
    const staggered: DiscoFloorTile = { ...TILE, beginMs: -2000 };
    expect(discoTileColourAt(staggered, 0)).toBe(discoTileColourAt(TILE, 2000));
    expect(discoTileColourAt(staggered, 0)).toBe('#ff0000');

    // A later, still-negative begin keeps wrapping correctly past a full cycle.
    const staggeredFurther: DiscoFloorTile = { ...TILE, beginMs: -3500 };
    expect(discoTileColourAt(staggeredFurther, 0)).toBe(discoTileColourAt(TILE, 500));
  });
});
