import { describe, expect, it } from 'vitest';
import { estimateBubbleSize } from './bubble-geometry';

describe('estimateBubbleSize', () => {
  it("sizes a one-line pill as the Room designs' own baked pills", () => {
    // design/Room 01 Town Center.dc.html: "Look what we won!" is a 153.2 x 30
    // pill (x 898.4-1051.6) and "LET'S GO! Who's shipping today?!" a 267.2 x
    // 30 one (x 616.4-883.6).
    expect(estimateBubbleSize('Look what we won!').width).toBeCloseTo(153.2);
    expect(estimateBubbleSize('Look what we won!').height).toBe(30);
    expect(estimateBubbleSize("LET'S GO! Who's shipping today?!").width).toBeCloseTo(267.2);
  });

  it('caps a long line at 250 px of text plus padding and adds a line of height when it wraps', () => {
    // 36 characters is about 274 px of text, past the 250 px wrap width.
    expect(estimateBubbleSize('Ship it Friday. What could go wrong.')).toEqual({
      width: 274,
      height: 46,
    });
  });
});
