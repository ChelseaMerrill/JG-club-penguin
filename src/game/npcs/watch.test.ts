import { describe, expect, it } from 'vitest';
import { NPCS } from '../../npcs/npcs';
import { getNpcMotion } from '../../npcs/npc-motions';
import { easeLean, WATCH_MAX_LEAN, watchTargetLean } from './watch';

describe('an NPC watching the Player', () => {
  it('leans toward the Penguin, further the further across the Room it is, up to 10 degrees', () => {
    expect(watchTargetLean(500, 500)).toBe(0);
    expect(watchTargetLean(500, 700)).toBeCloseTo(WATCH_MAX_LEAN / 2);
    expect(watchTargetLean(500, 300)).toBeCloseTo(-WATCH_MAX_LEAN / 2);
    expect(watchTargetLean(500, 2000)).toBeCloseTo(WATCH_MAX_LEAN);
    expect(watchTargetLean(500, -2000)).toBeCloseTo(-WATCH_MAX_LEAN);
  });

  it('eases into a new lean without overshooting', () => {
    const halfway = easeLean(0, 0.1, 125); // a quarter... 4/s * 0.125 s = half
    expect(halfway).toBeCloseTo(0.05);
    expect(easeLean(0, 0.1, 10_000)).toBe(0.1);
    expect(easeLean(0.1, 0.1, 16)).toBe(0.1);
  });

  it("is Team Room 2's Chris Pence, who has no designed motion to fight it", () => {
    const watchers = Object.values(NPCS).filter((npc) => npc.watchesPlayer);
    expect(watchers.map((npc) => npc.id)).toEqual(['chris-pence']);
    expect(getNpcMotion('chris-pence')).toBeUndefined();
  });
});
