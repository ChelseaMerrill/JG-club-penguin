import { describe, expect, it } from 'vitest';
import { PENGUIN_TEXT_PATHS } from './text-paths';

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

  it('every entry starts with an SVG path moveto command', () => {
    for (const entry of Object.values(PENGUIN_TEXT_PATHS)) {
      expect(entry.d.startsWith('M')).toBe(true);
    }
  });
});
