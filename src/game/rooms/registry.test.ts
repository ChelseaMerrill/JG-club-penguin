import { describe, expect, it } from 'vitest';
import { ROOM_IDS, type RoomId } from '../../contracts';
import { hasRoomDefinition } from './registry';

describe('hasRoomDefinition', () => {
  it('is true for every RoomId', () => {
    for (const id of ROOM_IDS) {
      expect(hasRoomDefinition(id)).toBe(true);
    }
  });

  it('is false for an id with no RoomDefinition', () => {
    expect(hasRoomDefinition('not-a-real-room' as RoomId)).toBe(false);
  });
});
