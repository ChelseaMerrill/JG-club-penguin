import { describe, expect, it } from 'vitest';
import { hasRoomDefinition } from './registry';

describe('hasRoomDefinition', () => {
  it('is true for a built Room and false for one with no RoomDefinition yet', () => {
    expect(hasRoomDefinition('dev-pit')).toBe(true);
    expect(hasRoomDefinition('the-melt')).toBe(false);
  });
});
