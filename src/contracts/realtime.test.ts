import { describe, expect, it } from 'vitest';
import { roomChannelKey } from './realtime';

describe('roomChannelKey', () => {
  it('returns room:<id> for a non-Igloo room', () => {
    expect(roomChannelKey('town-center', 'p1')).toBe('room:town-center');
  });

  it('returns a per-player channel for the Igloo', () => {
    expect(roomChannelKey('igloo', 'p1')).toBe('room:igloo:p1');
  });
});
