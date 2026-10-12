// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SPAWN_ROOM_ID } from '../../contracts';
import { HOOKS_ENABLED, resolveRoomIdFromLocation } from './dev-room-hook';

describe('resolveRoomIdFromLocation', () => {
  it('runs with the test hooks on', () => {
    expect(HOOKS_ENABLED).toBe(true);
  });

  it('falls back to the spawn Room, the Lobby (#169), with no ?room=', () => {
    expect(SPAWN_ROOM_ID).toBe('lobby');
    expect(resolveRoomIdFromLocation({ search: '' })).toBe('lobby');
    expect(resolveRoomIdFromLocation({ search: '?asPlayer' })).toBe('lobby');
  });

  it('falls back to the Lobby for an unknown ?room=', () => {
    expect(resolveRoomIdFromLocation({ search: '?room=nowhere' })).toBe('lobby');
  });

  it('honours a known ?room=', () => {
    expect(resolveRoomIdFromLocation({ search: '?asPlayer&room=town-center' })).toBe('town-center');
    expect(resolveRoomIdFromLocation({ search: '?room=lobby' })).toBe('lobby');
  });
});
