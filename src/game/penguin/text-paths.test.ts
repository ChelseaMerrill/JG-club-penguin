import { describe, expect, it } from 'vitest';
import { PENGUIN_ANIMS, PENGUIN_FRAMES, resolvePenguinFramePose } from './poses';
import {
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_VIEWBOX_HEIGHT,
  PENGUIN_VIEWBOX_WIDTH,
} from './render-svg';
import { PENGUIN_TEXT_PATHS } from './text-paths';

/** Every x/y coordinate in a path's data (control points included, so a safe over-estimate of its extent). */
function pathExtent(d: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// The design's own fills for these three strings (`design/Penguin
// Creator.dc.html` L47 "JG", L62 "WAR WEEK", L64 "HA HA"), independent of
// however `scripts/penguin-text-to-paths.ts` happens to compute `d` (#62
// D2/acceptance criteria).
const HAHA_FILL = '#00BDFF';
const JG_LOGO_FILL = '#00BDFF';
const WAR_WEEK_FILL = '#161719';

/**
 * `render-svg.ts`'s own body-rotation pivot (its private `BODY_ROTATE_ORIGIN`):
 * 50%/100% of the 120x130 design viewBox, i.e. its horizontal centre and
 * bottom edge (#31 review fix 2). Reproduced here rather than imported,
 * since it's a `render-svg.ts` implementation detail, not part of its
 * public surface.
 */
const BODY_ROTATE_ORIGIN = { x: PENGUIN_VIEWBOX_WIDTH / 2, y: PENGUIN_VIEWBOX_HEIGHT };

/**
 * Applies `render-svg.ts`'s own body transform --
 * `rotate(bodyRotateDeg, BODY_ROTATE_ORIGIN) translate(0, bodyTranslateY)`
 * -- to one point, composed in the same order SVG applies a `transform`
 * list (the rightmost transform, `translate`, applies first; `rotate` about
 * the pivot applies after) (#62 review fix 4).
 */
function applyBodyTransform(
  point: { x: number; y: number },
  bodyRotateDeg: number,
  bodyTranslateY: number,
): { x: number; y: number } {
  const translatedY = point.y + bodyTranslateY;
  const rad = (bodyRotateDeg * Math.PI) / 180;
  const dx = point.x - BODY_ROTATE_ORIGIN.x;
  const dy = translatedY - BODY_ROTATE_ORIGIN.y;
  return {
    x: BODY_ROTATE_ORIGIN.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: BODY_ROTATE_ORIGIN.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

describe('PENGUIN_TEXT_PATHS', () => {
  it('has a non-empty path and the design fill for "HA HA"', () => {
    expect(PENGUIN_TEXT_PATHS.haha.d.length).toBeGreaterThan(0);
    expect(PENGUIN_TEXT_PATHS.haha.fill).toBe(HAHA_FILL);
  });

  it('has a non-empty path and the design fill for "JG"', () => {
    expect(PENGUIN_TEXT_PATHS.jgLogo.d.length).toBeGreaterThan(0);
    expect(PENGUIN_TEXT_PATHS.jgLogo.fill).toBe(JG_LOGO_FILL);
  });

  it('has a non-empty path and the design fill for "WAR WEEK"', () => {
    expect(PENGUIN_TEXT_PATHS.warWeek.d.length).toBeGreaterThan(0);
    expect(PENGUIN_TEXT_PATHS.warWeek.fill).toBe(WAR_WEEK_FILL);
  });

  it('every entry stays inside the frame bounds at every pose it can actually render in, including the worst-case body rotate/translate (#62 review fix 4)', () => {
    // Unlike a fixed margin, this transforms each entry's own extent
    // corners by every pose `render-svg.ts` can actually apply to it and
    // asserts the *rotated* corners still land inside the padded frame box,
    // rather than assuming a fixed clearance covers the worst tilt. "HA HA"
    // only ever renders on a `showHaha` frame (LAUGH); the JG LOGO/WAR WEEK
    // BAND text rides along with whichever anim/frame is playing regardless
    // (a hat or pattern is independent of the current emote), so every pose
    // applies to those two.
    const minX = -PENGUIN_FRAME_PADDING_X;
    const minY = -PENGUIN_FRAME_PADDING_Y;
    const maxX = PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING_X;
    const maxY = PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING_Y;

    const allPoses = PENGUIN_ANIMS.flatMap((anim) =>
      Array.from({ length: PENGUIN_FRAMES[anim] }, (_, frame) =>
        resolvePenguinFramePose({ anim, frame }),
      ),
    );

    for (const [key, entry] of Object.entries(PENGUIN_TEXT_PATHS)) {
      const applicablePoses = key === 'haha' ? allPoses.filter((pose) => pose.showHaha) : allPoses;
      expect(applicablePoses.length).toBeGreaterThan(0);

      const extent = pathExtent(entry.d);
      const corners = [
        { x: extent.minX, y: extent.minY },
        { x: extent.maxX, y: extent.minY },
        { x: extent.minX, y: extent.maxY },
        { x: extent.maxX, y: extent.maxY },
      ];

      for (const pose of applicablePoses) {
        for (const corner of corners) {
          const transformed = applyBodyTransform(corner, pose.bodyRotateDeg, pose.bodyTranslateY);
          expect(transformed.x).toBeGreaterThanOrEqual(minX);
          expect(transformed.x).toBeLessThanOrEqual(maxX);
          expect(transformed.y).toBeGreaterThanOrEqual(minY);
          expect(transformed.y).toBeLessThanOrEqual(maxY);
        }
      }
    }
  });

  it('every entry starts with an SVG path moveto command', () => {
    for (const entry of Object.values(PENGUIN_TEXT_PATHS)) {
      expect(entry.d.startsWith('M')).toBe(true);
    }
  });
});
