import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FACING,
  DEFAULT_LOOK,
  IDLE_EMOTES,
  PENGUIN_NAME_MAX,
  ROOM_IDS,
  SPAWN_ROOM_ID,
  UNNAMED_PENGUIN,
  createEmitter,
  gameEvents,
  isHexColor,
  roomChannelKey,
} from './index';

describe('src/contracts barrel', () => {
  it('re-exports the runtime values Tracks B, C and D depend on', () => {
    expect(ROOM_IDS).toContain('town-center');
    expect(SPAWN_ROOM_ID).toBe('town-center');
    expect(DEFAULT_LOOK.body).toBe('#161719');
    expect(IDLE_EMOTES).toHaveLength(5);
    expect(PENGUIN_NAME_MAX).toBe(16);
    expect(UNNAMED_PENGUIN).toBe('Unnamed Penguin');
    expect(DEFAULT_FACING).toBe('right');
    expect(typeof createEmitter).toBe('function');
    expect(typeof gameEvents.on).toBe('function');
    expect(typeof roomChannelKey).toBe('function');
    expect(isHexColor('#00BDFF')).toBe(true);
  });
});
