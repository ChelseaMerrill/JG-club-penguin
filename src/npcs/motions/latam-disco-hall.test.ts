import { describe, expect, it } from 'vitest';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../../game/npcs/css-keyframes';
import { createNpcMotion } from '../../game/npcs/npc-motion';
import type { NpcId } from '../npcs';
import { LATAM_DISCO_HALL_MOTIONS } from './latam-disco-hall';

const ORIGIN = { x: 800, y: 250 };
const REST = { x: 780, y: 410 }; // Lucas Varani's own slot point in the design

describe('LATAM Disco Hall NPC motions', () => {
  it('registers a dance motion for all six dancers, in place (no walk)', () => {
    expect((Object.keys(LATAM_DISCO_HALL_MOTIONS) as NpcId[]).sort()).toEqual([
      'fernando-garagnani',
      'fernando-possebon',
      'hector-grecco',
      'jose-acosta',
      'lucas-varani',
      'ricardo-cordeiro',
    ]);
    for (const [id, spec] of Object.entries(LATAM_DISCO_HALL_MOTIONS)) {
      expect(spec!.path, id).toBeUndefined();
      expect(spec!.stage, id).toBeUndefined();
      expect(spec!.figure, id).toBeDefined();
    }
  });

  it('compiles every dance motion spec without throwing', () => {
    for (const spec of Object.values(LATAM_DISCO_HALL_MOTIONS)) {
      expect(() => createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false })).not.toThrow();
    }
  });

  it(
    "samples Lucas Varani's dance at its four stops (the design's bounce+sway, " +
      'collapsed into one cycle)',
    () => {
      const compiled = compileCssAnimation(LATAM_DISCO_HALL_MOTIONS['lucas-varani']!.figure!);
      // The feet (the `transformOrigin`, 60,122): rotation pivots exactly on
      // this point, so sampling it isolates the bounce's translateY alone.
      const FEET = { x: 60, y: 122 };
      const bounce = (ms: number) => transformPoint(sampleCssAnimation(compiled, ms), FEET).y - 122;
      expect(bounce(0)).toBeCloseTo(0, 5);
      // The design's translate(0,-10) Stage px, at the design's own 0.58
      // figure scale: -10 / 0.58.
      expect(bounce(250)).toBeCloseTo(-17.241379, 5);
      expect(bounce(500)).toBeCloseTo(0, 5);
      expect(bounce(750)).toBeCloseTo(-17.241379, 5);

      // The sway, read one figure-unit right of the feet (rotation degrees
      // aren't scaled by 0.58); at 0ms/500ms the bounce is 0, so this isolates
      // the rotation alone.
      const sway = (ms: number) => {
        const p = transformPoint(sampleCssAnimation(compiled, ms), { x: 61, y: 122 });
        return { x: p.x - 60, y: p.y - 122 };
      };
      const deg = (radians: number) => (radians * 180) / Math.PI;
      expect(deg(Math.atan2(sway(0).y, sway(0).x))).toBeCloseTo(-7, 3);
      expect(deg(Math.atan2(sway(500).y, sway(500).x))).toBeCloseTo(7, 3);
    },
  );

  it("keeps each dancer's own SMIL dur/begin (rotate's dur, already-elapsed begin)", () => {
    expect(LATAM_DISCO_HALL_MOTIONS['lucas-varani']!.figure!.animation).toBe(
      'danceLucas 1.00s linear infinite',
    );
    expect(LATAM_DISCO_HALL_MOTIONS['hector-grecco']!.figure!.animation).toBe(
      'danceHector 1.32s linear -0.46s infinite',
    );
    expect(LATAM_DISCO_HALL_MOTIONS['jose-acosta']!.figure!.animation).toBe(
      'danceJose 1.16s linear -0.23s infinite',
    );
    expect(LATAM_DISCO_HALL_MOTIONS['fernando-possebon']!.figure!.animation).toBe(
      'dancePossebon 1.00s linear -0.69s infinite',
    );
    expect(LATAM_DISCO_HALL_MOTIONS['fernando-garagnani']!.figure!.animation).toBe(
      'danceGaragnani 1.32s linear -1.15s infinite',
    );
    expect(LATAM_DISCO_HALL_MOTIONS['ricardo-cordeiro']!.figure!.animation).toBe(
      'danceRicardo 1.16s linear -0.92s infinite',
    );
  });
});
