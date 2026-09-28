import { describe, expect, it } from 'vitest';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { bubbleSchedule } from './bubble-schedule';

function firstShowSeconds(id: NpcId, text: string): number[] {
  return NPCS[id].idleLines
    .filter((line) => line.text === text)
    .map((line) => bubbleSchedule(line).firstShowMs / 1000);
}

describe('bubbleSchedule', () => {
  it('opens a line at the start of its visible window, `delayS` seconds already elapsed at load', () => {
    // The shared `@keyframes say` window (7%-26%) on a 20 s line with no delay.
    expect(bubbleSchedule({ text: 'x', periodS: 20, delayS: 0 })).toEqual({
      firstShowMs: 1400,
      visibleMs: 3800,
      periodMs: 20000,
    });
    // 2 s already elapsed: 1.4 s - 2 s wraps round to the next cycle.
    expect(bubbleSchedule({ text: 'x', periodS: 20, delayS: -2 }).firstShowMs).toBeCloseTo(19400);
  });

  it("uses a line's own keyframe window when it has one", () => {
    expect(bubbleSchedule({ text: 'x', periodS: 9, delayS: 0, window: [0.63, 0.88] })).toEqual({
      firstShowMs: 5670,
      visibleMs: 2250,
      periodMs: 9000,
    });
  });

  // Town Center's own keyframes (`sayDarrin`, `saySyd`, `sayJon`) and
  // when the design renderer first shows each line (the #113 audit's
  // bubble comparison).
  it("shows Town Center's lines when the design does", () => {
    expect(firstShowSeconds('darrin', "LET'S GO! Who's shipping today?!")).toEqual([0.99]);
    expect(firstShowSeconds('darrin', 'YOU. ARE. CRUSHING IT.')).toEqual([6.05]);
    expect(firstShowSeconds('sydney', 'Look what we won!')[0]).toBeCloseTo(5.04);
    expect(firstShowSeconds('sydney', 'Serve. Grind. Grow. Inspire.')[0]).toBeCloseTo(14.4);
    const jon = firstShowSeconds('jon', 'Wanna see a magic trick?');
    expect(jon).toHaveLength(2);
    expect(jon[0]).toBeCloseTo(2.66);
    expect(jon[1]).toBeCloseTo(8.54);
    expect(firstShowSeconds('jory', 'COUCH. IS. LAVA.')[0]).toBeCloseTo(5.67);
  });

  // Every other Room keeps the timing it already had: the design
  // renderer's first-show times from the #113 audit's bubble comparison.
  it("keeps every other Room's lines on the design's own schedule", () => {
    expect(firstShowSeconds('ian', 'Who broke CI? Be honest.')[0]).toBeCloseTo(0.54);
    expect(firstShowSeconds('ryan', 'LGTM. One nit.')[0]).toBeCloseTo(19.4);
    expect(firstShowSeconds('ashley', 'Catch!')[0]).toBeCloseTo(5.48);
    expect(firstShowSeconds('tom', 'Coffee run?')[0]).toBeCloseTo(11.12);
    expect(firstShowSeconds('chelsea', 'Flip it NOW.')[0]).toBeCloseTo(0.91);
    expect(firstShowSeconds('kevin', 'They bite. Gently.')[0]).toBeCloseTo(4.91);
    expect(firstShowSeconds('ann-marie', 'Cyan cap? 120 tokens.')[0]).toBeCloseTo(0.84);
    expect(firstShowSeconds('ann-marie', 'Try it on!')[0]).toBeCloseTo(6.84);
    expect(firstShowSeconds('anthony', 'Reel talk: check the sender.')[0]).toBeCloseTo(9.96);
    expect(firstShowSeconds('jethro', 'Say hackathon!')[0]).toBeCloseTo(6.47);
    expect(firstShowSeconds('darrin-icebox', 'Who is demoing first?')[0]).toBeCloseTo(5.05);
  });
});
