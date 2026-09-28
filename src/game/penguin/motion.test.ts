import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bodyMotionCycleMs,
  createBodyMotion,
  penguinMotionFor,
  prefersReducedMotion,
  sampleBodyMotion,
  type BodyMotionProxy,
  type BodyMotionTarget,
  type BodyMotionTweenConfig,
  type BodyMotionTweens,
} from './motion';
import { PENGUIN_ANIMS, resolvePenguinFramePose, type PenguinAnim } from './poses';

// Expected values worked out by hand from the design constants
// (`design/Penguin Creator.dc.html` l.17 and l.110), not re-derived with the
// production formula: design px x (120 / 340) x 0.58, facing right.
const WADDLE_EXPECTED = [
  { angle: -5, x: -5.322, y: 0 },
  { angle: 4, x: -2.456, y: -1.228 },
  { angle: 5, x: 5.322, y: 0 },
  { angle: -4, x: 2.456, y: -1.228 },
];
const TOLERANCE = 0.005;

function expectPose(
  actual: { angle: number; x: number; y: number },
  expected: { angle: number; x: number; y: number },
): void {
  expect(Math.abs(actual.angle - expected.angle)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(TOLERANCE);
}

describe('penguinMotionFor', () => {
  it('follows the design waddle: four keyframes with the sideways sway, 600 ms apart', () => {
    const spec = penguinMotionFor('WADDLE');
    expect(spec).not.toBeNull();
    expect(spec!.segmentMs).toBe(600);
    expect(spec!.keyframes).toHaveLength(4);
    spec!.keyframes.forEach((k, i) => expectPose(k, WADDLE_EXPECTED[i]));
  });

  it('tweens DANCE, LAUGH and WALK between their two baked frames with no sideways offset', () => {
    const cases: [PenguinAnim, { angle: number; x: number; y: number }[], number][] = [
      [
        'DANCE',
        [
          { angle: -8, x: 0, y: 0 },
          { angle: 8, x: 0, y: -2.866 },
        ],
        350,
      ],
      [
        'LAUGH',
        [
          { angle: 0, x: 0, y: 0 },
          { angle: -3, x: 0, y: -0.819 },
        ],
        250,
      ],
      [
        'WALK',
        [
          { angle: -3, x: 0, y: 0 },
          { angle: 3, x: 0, y: 0 },
        ],
        300,
      ],
    ];
    for (const [anim, expected, segmentMs] of cases) {
      const spec = penguinMotionFor(anim);
      expect(spec, anim).not.toBeNull();
      expect(spec!.segmentMs, anim).toBe(segmentMs);
      expect(spec!.keyframes, anim).toHaveLength(2);
      spec!.keyframes.forEach((k, i) => expectPose(k, expected[i]));
    }
  });

  it('gives every other anim no body motion', () => {
    const moving = new Set<PenguinAnim>(['WADDLE', 'DANCE', 'LAUGH', 'WALK']);
    for (const anim of PENGUIN_ANIMS) {
      if (moving.has(anim)) continue;
      expect(penguinMotionFor(anim), anim).toBeNull();
    }
  });

  it("uses the design's cycle lengths", () => {
    expect(bodyMotionCycleMs(penguinMotionFor('WADDLE')!)).toBe(2400);
    expect(bodyMotionCycleMs(penguinMotionFor('DANCE')!)).toBe(700);
    expect(bodyMotionCycleMs(penguinMotionFor('LAUGH')!)).toBe(500);
    expect(bodyMotionCycleMs(penguinMotionFor('WALK')!)).toBe(600);
  });

  it("keeps WADDLE's first two keyframes identical to the baked reduced-motion frames", () => {
    const spec = penguinMotionFor('WADDLE')!;
    for (const frame of [0, 1]) {
      const pose = resolvePenguinFramePose({ anim: 'WADDLE', frame });
      expect(spec.keyframes[frame].angle).toBeCloseTo(pose.bodyRotateDeg, 9);
      expect(spec.keyframes[frame].y).toBeCloseTo(pose.bodyTranslateY * 0.58, 9);
    }
  });
});

describe('sampleBodyMotion', () => {
  const waddle = penguinMotionFor('WADDLE')!;

  it('lands on each keyframe at its quarter of the cycle', () => {
    [0, 0.25, 0.5, 0.75].forEach((phase, i) =>
      expectPose(sampleBodyMotion(waddle, phase), WADDLE_EXPECTED[i]),
    );
    expectPose(sampleBodyMotion(waddle, 1), WADDLE_EXPECTED[0]);
  });

  it('eases between keyframes, passing through the midpoint halfway', () => {
    expectPose(sampleBodyMotion(waddle, 0.125), { angle: -0.5, x: -3.889, y: -0.614 });
    expectPose(sampleBodyMotion(waddle, 0.375), { angle: 4.5, x: 1.433, y: -0.614 });
  });

  it('stays inside the design range at every phase', () => {
    for (let i = 0; i < 400; i++) {
      const k = sampleBodyMotion(waddle, i / 400);
      expect(k.angle).toBeGreaterThanOrEqual(-5 - 1e-9);
      expect(k.angle).toBeLessThanOrEqual(5 + 1e-9);
      expect(Math.abs(k.x)).toBeLessThanOrEqual(5.322 + TOLERANCE);
    }
  });

  it('never moves WALK sideways', () => {
    const walk = penguinMotionFor('WALK')!;
    for (let i = 0; i < 100; i++) expect(sampleBodyMotion(walk, i / 100).x).toBe(0);
  });
});

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true when the OS asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when it does not', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('createBodyMotion', () => {
  function setup() {
    const added: { config: BodyMotionTweenConfig; removed: boolean }[] = [];
    const tweens: BodyMotionTweens = {
      add(config) {
        const entry = { config, removed: false };
        added.push(entry);
        return {
          remove() {
            entry.removed = true;
          },
        };
      },
    };
    const sprite: BodyMotionTarget = { angle: 0, x: 0, y: 0 };
    const hat: BodyMotionTarget = { angle: 0, x: 0, y: 0 };
    const proxy: BodyMotionProxy = { phase: 0, blend: 0 };
    const motion = createBodyMotion(tweens, [sprite, hat], proxy);
    const live = () => added.filter((a) => !a.removed);
    const tick = (phase: number, blend: number) => {
      proxy.phase = phase;
      proxy.blend = blend;
      live().forEach((a) => a.config.onUpdate());
    };
    return { added, live, tick, sprite, hat, proxy, motion };
  }

  it('adds exactly one tween, on the proxy: a looping linear phase and a one-off eased lead-in', () => {
    const { added, proxy, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    expect(added).toHaveLength(1);
    const { targets, props } = added[0].config;
    expect(targets).toBe(proxy);
    expect(props.phase).toEqual({ from: 0, to: 1, duration: 2400, repeat: -1, ease: 'Linear' });
    expect(props.blend).toEqual({
      from: 0,
      to: 1,
      duration: 600,
      repeat: 0,
      ease: 'Sine.easeInOut',
    });
  });

  it('applies the same pose to the sprite and the snow hat', () => {
    const { tick, sprite, hat, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    tick(0.5, 1);
    expectPose(sprite, WADDLE_EXPECTED[2]);
    expectPose(hat, WADDLE_EXPECTED[2]);
  });

  it('starts from neutral: blend 0 gives no tilt, sway or lift', () => {
    const { tick, sprite, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    tick(0.25, 0);
    expect(sprite).toEqual({ angle: 0, x: 0, y: 0 });
  });

  it('mirrors the tilt and sway, not the lift, when flipped, without a new tween', () => {
    const { added, tick, sprite, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    motion.setFlipped(true);
    tick(0.25, 1);
    expectPose(sprite, { angle: -4, x: 2.456, y: -1.228 });
    expect(added).toHaveLength(1);
  });

  it('replaces the running tween on a second start, so there are never two', () => {
    const { added, live, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    motion.start(penguinMotionFor('WALK'));
    expect(added).toHaveLength(2);
    expect(added[0].removed).toBe(true);
    expect(live()).toHaveLength(1);
  });

  it('stop removes the tween and returns both targets to neutral', () => {
    const { live, tick, sprite, hat, motion } = setup();
    motion.start(penguinMotionFor('DANCE'));
    tick(0.5, 1);
    motion.stop();
    expect(live()).toHaveLength(0);
    expect(sprite).toEqual({ angle: 0, x: 0, y: 0 });
    expect(hat).toEqual({ angle: 0, x: 0, y: 0 });
  });

  it('stop(false) removes the tween but leaves the targets alone (after a destroy)', () => {
    const { live, tick, sprite, motion } = setup();
    motion.start(penguinMotionFor('DANCE'));
    tick(0.5, 1);
    const before = { ...sprite };
    motion.stop(false);
    expect(live()).toHaveLength(0);
    expect(sprite).toEqual(before);
  });

  it('adds nothing for an anim with no body motion', () => {
    const { added, sprite, motion } = setup();
    motion.start(penguinMotionFor('WAVE'));
    expect(added).toHaveLength(0);
    expect(sprite).toEqual({ angle: 0, x: 0, y: 0 });
  });

  it('blends from a non-neutral pose into the next anim instead of snapping (walk start)', () => {
    const { tick, sprite, hat, motion } = setup();
    // Mid-WADDLE, as measured at a walk start: tilted, swayed and lifted.
    const from = { angle: 4.56, x: 5.18, y: -0.4 };
    Object.assign(sprite, from);
    Object.assign(hat, from);
    motion.start(penguinMotionFor('WALK'));
    // `start` itself leaves the pose where it was.
    expect(sprite).toEqual(from);
    tick(0.25, 0);
    expectPose(sprite, from);
    expectPose(hat, from);
    // WALK at phase 0.25 is the eased midpoint of -3 and 3: 0 deg, no sway or lift.
    tick(0.25, 0.5);
    expectPose(sprite, { angle: 2.28, x: 2.59, y: -0.2 });
    tick(0.5, 1);
    expectPose(sprite, { angle: 3, x: 0, y: 0 });
    expect(sprite.x).toBe(0);
    expectPose(hat, { angle: 3, x: 0, y: 0 });
  });

  it('blends from the pose a previous motion left, when mirrored', () => {
    const { tick, sprite, motion } = setup();
    motion.start(penguinMotionFor('WALK'));
    motion.setFlipped(true);
    tick(0, 1);
    expectPose(sprite, { angle: 3, x: 0, y: 0 });
    // Arrival: WALK -> WADDLE starts from the WALK pose, not from 0.
    motion.start(penguinMotionFor('WADDLE'));
    tick(0, 0);
    expectPose(sprite, { angle: 3, x: 0, y: 0 });
    tick(0, 1);
    expectPose(sprite, { angle: 5, x: 5.322, y: 0 });
  });

  it('eases a non-neutral pose back to neutral for an anim with no body motion', () => {
    const { added, live, tick, sprite, motion } = setup();
    Object.assign(sprite, { angle: -2.48, x: 1, y: -0.5 });
    motion.start(penguinMotionFor('WAVE'));
    expect(added).toHaveLength(1);
    expect(added[0].config.props.phase).toBeUndefined();
    expect(added[0].config.props.blend).toMatchObject({ from: 0, to: 1, repeat: 0 });
    tick(0, 0);
    expectPose(sprite, { angle: -2.48, x: 1, y: -0.5 });
    tick(0, 0.5);
    expectPose(sprite, { angle: -1.24, x: 0.5, y: -0.25 });
    tick(0, 1);
    expect(sprite).toEqual({ angle: 0, x: 0, y: 0 });
    added[0].config.onComplete?.();
    added[0].removed = true;
    expect(live()).toHaveLength(0);
    expect(sprite).toEqual({ angle: 0, x: 0, y: 0 });
  });

  it('mirrors a running motion as soon as the facing flips, not a frame later', () => {
    const { tick, sprite, motion } = setup();
    motion.start(penguinMotionFor('WADDLE'));
    tick(0.25, 1);
    expectPose(sprite, WADDLE_EXPECTED[1]);
    motion.setFlipped(true);
    expectPose(sprite, { angle: -4, x: 2.456, y: -1.228 });
    // No change of sign, no re-apply.
    sprite.angle = 99;
    motion.setFlipped(true);
    expect(sprite.angle).toBe(99);
  });

  it('flipping mid-blend mirrors the pose being blended from too', () => {
    const { tick, sprite, motion } = setup();
    Object.assign(sprite, { angle: 4, x: 2, y: -1 });
    motion.start(penguinMotionFor('WALK'));
    tick(0.25, 0);
    motion.setFlipped(true);
    expectPose(sprite, { angle: -4, x: -2, y: -1 });
  });
});
