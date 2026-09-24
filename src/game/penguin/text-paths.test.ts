import { describe, expect, it } from 'vitest';
import { PENGUIN_FRAME_PADDING, PENGUIN_VIEWBOX_HEIGHT, PENGUIN_VIEWBOX_WIDTH } from './render-svg';
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

  it('every entry fits inside the padded frame box, so no text is clipped', () => {
    // The LAUGH tilt rotates HA HA a few degrees; keep a margin for it.
    const margin = 8;
    for (const entry of Object.values(PENGUIN_TEXT_PATHS)) {
      const { minX, maxX, minY, maxY } = pathExtent(entry.d);
      expect(minX).toBeGreaterThanOrEqual(-PENGUIN_FRAME_PADDING + margin);
      expect(maxX).toBeLessThanOrEqual(PENGUIN_VIEWBOX_WIDTH + PENGUIN_FRAME_PADDING - margin);
      expect(minY).toBeGreaterThanOrEqual(-PENGUIN_FRAME_PADDING + margin);
      expect(maxY).toBeLessThanOrEqual(PENGUIN_VIEWBOX_HEIGHT + PENGUIN_FRAME_PADDING - margin);
    }
  });

  it('every entry starts with an SVG path moveto command', () => {
    for (const entry of Object.values(PENGUIN_TEXT_PATHS)) {
      expect(entry.d.startsWith('M')).toBe(true);
    }
  });
});
