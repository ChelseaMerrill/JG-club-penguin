import { describe, expect, it } from 'vitest';
import { townCenter } from './definitions/town-center';
import { feedMeAlpha, sampleTankFish, tankFishSvg } from './tank-fish';

describe("Town Center's tank fish", () => {
  it('is Ghostfish Killa, a purple betta (owner request, 2026-10-02)', () => {
    expect(townCenter.tankFish).toEqual({
      name: 'Ghostfish Killa',
      body: '#7B3FC4',
      fins: '#C9A2F2',
    });
  });

  it("swims the design's own loop round the tank, turning at each end", () => {
    // The design's `swim` stops: 0% (1195, 419.5) facing right, 40% (1232,
    // 432), 50% (1236, 428) facing left, 90% (1178, 406).
    expect(sampleTankFish(0)).toEqual({ point: { x: 1195, y: 419.5 }, facing: 1 });
    const at40 = sampleTankFish(2800);
    expect(at40.point.x).toBeCloseTo(1232);
    expect(at40.point.y).toBeCloseTo(432);
    expect(at40.facing).toBeCloseTo(1);
    const at50 = sampleTankFish(3500);
    expect(at50.point.x).toBeCloseTo(1236);
    expect(at50.facing).toBeCloseTo(-1);
    const at90 = sampleTankFish(6300);
    expect(at90.point.x).toBeCloseTo(1178);
    expect(at90.point.y).toBeCloseTo(406);
    expect(at90.facing).toBeCloseTo(-1);
    // It loops every 7 s.
    expect(sampleTankFish(7000).point.x).toBeCloseTo(1195);
  });

  it('shows "feed me" from 60% to 85% of its 9 s cycle, and hides it otherwise', () => {
    expect(feedMeAlpha(0)).toBe(0);
    expect(feedMeAlpha(4500)).toBe(0); // 50%
    expect(feedMeAlpha(6300)).toBeCloseTo(1); // 70%
    expect(feedMeAlpha(8550)).toBe(0); // 95%
  });

  it("draws the design's betta in the fish's own colours, skewed to the tank glass and turned each way", () => {
    const fish = townCenter.tankFish!;
    const right = tankFishSvg(fish, 1);
    const left = tankFishSvg(fish, -1);
    expect(right).toContain('<g transform="skewY(26.57) scale(1 1)">');
    expect(left).toContain('<g transform="skewY(26.57) scale(-1 1)">');
    expect(right).toContain('<ellipse cx="4" cy="0" rx="12" ry="6.5" fill="#7B3FC4"');
    expect(right).toContain('d="M-2 0 q-12 -16 -30 -10 q6 10 0 20 q18 6 30 -10 z" fill="#C9A2F2"');
    // Not the design's cyan-and-white Gil.
    expect(right).not.toContain('#00BDFF');
  });
});
