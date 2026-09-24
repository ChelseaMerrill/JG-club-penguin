import { describe, expect, it } from 'vitest';
import { DEFAULT_PENGUIN_LOOK } from '../contracts/penguin';
import type { Player } from '../auth/player';
import { lookFromPlayer } from './look';

function player(overrides: Partial<Player> = {}): Player {
  return { id: 'p1', displayName: 'Ada Lovelace', penguinColor: '#123456', ...overrides };
}

describe('lookFromPlayer', () => {
  it('uses the Player display name and penguin color, keeping every other DEFAULT_PENGUIN_LOOK field', () => {
    const look = lookFromPlayer(player());

    expect(look).toEqual({ ...DEFAULT_PENGUIN_LOOK, name: 'Ada Lovelace', body: '#123456' });
  });

  it('truncates a display name over 40 characters', () => {
    const longName = 'x'.repeat(50);

    const look = lookFromPlayer(player({ displayName: longName }));

    expect(look.name).toBe('x'.repeat(40));
  });
});
