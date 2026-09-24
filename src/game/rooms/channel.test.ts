import { describe, expect, it } from 'vitest';
import { getRoomChannelKey } from './channel';

describe('getRoomChannelKey', () => {
  it('returns room:<id> for a non-Igloo room', () => {
    expect(getRoomChannelKey('town-center', 'p1')).toBe('room:town-center');
  });

  it('returns a per-player channel for the Igloo, matching roomChannelKey', () => {
    expect(getRoomChannelKey('igloo', 'p1')).toBe('room:igloo:p1');
  });
});
