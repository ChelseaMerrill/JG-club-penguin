import { describe, expect, it } from 'vitest';
import {
  CHICKEN_HIT_HEIGHT,
  pickChickenTarget,
  planChickenToss,
  renderChickenSvg,
  sampleChickenToss,
} from './chicken-toss';

const HAND = { x: 460, y: 445 };
const FEET = { x: 900, y: 500 };

describe("Ashley's chicken toss", () => {
  it('lands the throw on the Penguin, then bounces twice on past them, squeaking at each landing', () => {
    const plan = planChickenToss(HAND, FEET);
    expect(plan.hops).toHaveLength(3);
    expect(plan.hops[0]!.from).toEqual(HAND);
    expect(plan.hops[0]!.to).toEqual({ x: FEET.x, y: FEET.y - CHICKEN_HIT_HEIGHT });
    // Each bounce carries on in the throw's direction (to the right here).
    expect(plan.hops[1]!.to.x).toBeGreaterThan(FEET.x);
    expect(plan.hops[2]!.to.x).toBeGreaterThan(plan.hops[1]!.to.x);
    expect(plan.landingsMs).toHaveLength(3);
    expect(plan.landingsMs[2]).toBe(plan.flightMs);
    expect(plan.totalMs).toBeGreaterThan(plan.flightMs);
  });

  it('flies an arc above the straight line, and tumbles clockwise to the right, anticlockwise to the left', () => {
    const plan = planChickenToss(HAND, FEET);
    const mid = sampleChickenToss(plan, plan.hops[0]!.durationMs / 2)!;
    const hit = plan.hops[0]!.to;
    expect(mid.point.y).toBeLessThan((HAND.y + hit.y) / 2 - 100);
    expect(mid.rotation).toBeGreaterThan(0);
    const left = planChickenToss(HAND, { x: 100, y: 600 });
    expect(sampleChickenToss(left, 100)!.rotation).toBeLessThan(0);
  });

  it('rests where it last landed, fades, then is gone', () => {
    const plan = planChickenToss(HAND, FEET);
    const last = plan.hops[plan.hops.length - 1]!.to;
    expect(sampleChickenToss(plan, plan.flightMs + 10)).toMatchObject({ point: last, alpha: 1 });
    expect(sampleChickenToss(plan, plan.totalMs - 1)!.alpha).toBeLessThan(0.05);
    expect(sampleChickenToss(plan, plan.totalMs)).toBeNull();
  });

  it('throws at anyone in the Room, but not the same Penguin twice running while someone else is there', () => {
    const you = { id: 'local', feet: FEET };
    const them = { id: 'p2', feet: { x: 700, y: 600 } };
    expect(pickChickenTarget([], null)).toBeNull();
    expect(pickChickenTarget([you], 'local')).toBe(you);
    expect(pickChickenTarget([you, them], 'local', () => 0)).toBe(them);
    expect(pickChickenTarget([you, them], null, () => 0.99)).toBe(them);
    expect(pickChickenTarget([you, them], null, () => 0)).toBe(you);
  });

  it("draws the design's chicken verbatim", () => {
    const svg = renderChickenSvg();
    expect(svg).toContain(
      '<ellipse cx="0" cy="0" rx="12" ry="8" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/>',
    );
    expect(svg).toContain('<path d="M8 -12 q2 -6 6 -2 q2 -6 6 -1" fill="#D63C3C"/>');
  });
});
