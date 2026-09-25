import { describe, expect, it } from 'vitest';
import { createSnowballAmmo, SNOWBALL_CAPACITY, SNOWBALL_REFILL_MS } from './snowball-ammo';

describe('createSnowballAmmo (#53 AC2)', () => {
  it('starts full at the given capacity', () => {
    const ammo = createSnowballAmmo();
    expect(ammo.capacity).toBe(SNOWBALL_CAPACITY);
    expect(ammo.count(0)).toBe(SNOWBALL_CAPACITY);
    expect(ammo.nextRefillAt(0)).toBeNull();
  });

  it('after 3 throws the count is 0', () => {
    const ammo = createSnowballAmmo();

    expect(ammo.reserve(0)).toBe(true);
    expect(ammo.reserve(0)).toBe(true);
    expect(ammo.reserve(0)).toBe(true);

    expect(ammo.count(0)).toBe(0);
  });

  it('a reservation with no ammo left does nothing and returns false', () => {
    const ammo = createSnowballAmmo();
    ammo.reserve(0);
    ammo.reserve(0);
    ammo.reserve(0);

    expect(ammo.reserve(100)).toBe(false);
    expect(ammo.count(100)).toBe(0);
  });

  it('refills +1 at exactly 4000ms after the drop below capacity, not at 3999ms', () => {
    const ammo = createSnowballAmmo();
    ammo.reserve(0);
    ammo.reserve(0);
    ammo.reserve(0);

    expect(ammo.count(SNOWBALL_REFILL_MS - 1)).toBe(0);
    expect(ammo.count(SNOWBALL_REFILL_MS)).toBe(1);
  });

  it('is full again at 12000ms (three refill ticks from the first drop)', () => {
    const ammo = createSnowballAmmo();
    ammo.reserve(0);
    ammo.reserve(0);
    ammo.reserve(0);

    expect(ammo.count(3 * SNOWBALL_REFILL_MS - 1)).toBe(2);
    expect(ammo.count(3 * SNOWBALL_REFILL_MS)).toBe(3);
    expect(ammo.nextRefillAt(3 * SNOWBALL_REFILL_MS)).toBeNull();
  });

  it('throwing again during refill keeps the existing cycle (does not push the next tick out)', () => {
    const ammo = createSnowballAmmo();
    ammo.reserve(0);
    ammo.reserve(0);
    ammo.reserve(0);
    // First tick lands at 4000ms, bringing count to 1.
    expect(ammo.count(SNOWBALL_REFILL_MS)).toBe(1);

    // A throw mid-cycle, well after the tick but before the next one.
    expect(ammo.reserve(5000)).toBe(true);
    expect(ammo.count(5000)).toBe(0);

    // The next tick still lands at 8000ms (4000 + 4000), not 5000 + 4000.
    expect(ammo.count(2 * SNOWBALL_REFILL_MS - 1)).toBe(0);
    expect(ammo.count(2 * SNOWBALL_REFILL_MS)).toBe(1);
  });

  it('a reservation while already full starts a fresh cycle at that moment', () => {
    const ammo = createSnowballAmmo();

    expect(ammo.nextRefillAt(1000)).toBeNull();
    ammo.reserve(1000);
    expect(ammo.nextRefillAt(1000)).toBe(1000 + SNOWBALL_REFILL_MS);
  });

  it('refund returns one ammo without disturbing the cycle phase', () => {
    const ammo = createSnowballAmmo();
    ammo.reserve(0);
    expect(ammo.count(0)).toBe(2);
    expect(ammo.nextRefillAt(0)).toBe(SNOWBALL_REFILL_MS);

    ammo.refund(500);

    expect(ammo.count(500)).toBe(3);
    expect(ammo.nextRefillAt(500)).toBeNull();
  });

  it('refund is a no-op once the bucket is already full', () => {
    const ammo = createSnowballAmmo();
    ammo.refund(0);
    expect(ammo.count(0)).toBe(SNOWBALL_CAPACITY);
  });

  it('supports a custom capacity', () => {
    const ammo = createSnowballAmmo(1);
    expect(ammo.count(0)).toBe(1);
    expect(ammo.reserve(0)).toBe(true);
    expect(ammo.reserve(0)).toBe(false);
    expect(ammo.count(SNOWBALL_REFILL_MS)).toBe(1);
  });
});
