import { describe, expect, it, vi } from 'vitest';
import { getRoomDefinition } from './registry';
import { saySpawnLine, type SpawnLineDeps } from './spawn-line';

function deps(
  overrides: Partial<SpawnLineDeps> = {},
): SpawnLineDeps & { say: ReturnType<typeof vi.fn> } {
  const say = vi.fn(() => true);
  return {
    spawnRoomId: 'lobby',
    isCurrent: () => true,
    currentRoomId: () => 'lobby',
    lineFor: (roomId) => getRoomDefinition(roomId).spawnLine,
    say,
    ...overrides,
  } as SpawnLineDeps & { say: ReturnType<typeof vi.fn> };
}

describe('saySpawnLine (#169)', () => {
  it('says the Lobby\'s "stairs or elevator?" once on a spawn there', () => {
    const d = deps();

    expect(saySpawnLine(d)).toBe(true);
    expect(d.say).toHaveBeenCalledTimes(1);
    expect(d.say).toHaveBeenCalledWith('stairs or elevator?');
  });

  it('says nothing for a stale sign-in generation (a sign-out or newer sign-in first)', () => {
    const d = deps({ isCurrent: () => false });

    expect(saySpawnLine(d)).toBe(false);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('says nothing once the Player has already left the spawn Room', () => {
    const d = deps({ currentRoomId: () => 'stairwell-0' });

    expect(saySpawnLine(d)).toBe(false);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('says nothing for a spawn into a Room with no spawn line (`?asPlayer&room=town-center`)', () => {
    const d = deps({ spawnRoomId: 'town-center', currentRoomId: () => 'town-center' });

    expect(saySpawnLine(d)).toBe(false);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('reports a bubble that was not shown (no local Penguin yet)', () => {
    expect(saySpawnLine(deps({ say: vi.fn(() => false) }))).toBe(false);
  });
});
