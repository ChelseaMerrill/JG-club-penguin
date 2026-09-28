import { describe, expect, it } from 'vitest';
import { isNightOwlTime } from './badge-rules';

// The same fixed instants `sql-badges.test.ts` gives `evaluate_session_badges`,
// so the fake and the SQL agree on Night Owl's [02:00, 05:00) Eastern window.
describe('isNightOwlTime', () => {
  it.each([
    ['2026-09-27T06:30:00Z', '02:30 EDT', true],
    ['2026-01-15T07:30:00Z', '02:30 EST', true],
    ['2026-09-27T06:00:00Z', '02:00:00 EDT, the window opens', true],
    ['2026-09-27T08:59:59Z', '04:59:59 EDT', true],
    ['2026-09-27T09:00:00Z', '05:00 EDT, the window has closed', false],
    ['2026-09-27T05:59:00Z', '01:59 EDT', false],
    ['2026-03-08T06:59:00Z', '01:59 EST, just before the DST jump', false],
    ['2026-03-08T07:00:00Z', '03:00 EDT, just after the DST jump', true],
    ['2026-09-27T16:00:00Z', 'midday EDT', false],
  ])('%s (%s) is %s', (instant, _label, expected) => {
    expect(isNightOwlTime(new Date(instant))).toBe(expected);
  });
});
