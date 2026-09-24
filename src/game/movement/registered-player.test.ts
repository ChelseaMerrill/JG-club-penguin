import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type PenguinLook } from '../../contracts';
import {
  LOCAL_PLAYER_ID,
  resolveRegisteredLook,
  resolveRegisteredPlayerId,
} from './registered-player';

describe('resolveRegisteredLook', () => {
  it('falls back to DEFAULT_LOOK when no player is registered', () => {
    expect(resolveRegisteredLook(undefined)).toEqual(DEFAULT_LOOK);
  });

  it('returns the registered player look otherwise', () => {
    const look: PenguinLook = { ...DEFAULT_LOOK, body: '#00BDFF', name: 'Milli' };

    expect(resolveRegisteredLook({ id: 'p1', look })).toEqual(look);
  });
});

describe('resolveRegisteredPlayerId', () => {
  it('falls back to LOCAL_PLAYER_ID when no player is registered', () => {
    expect(resolveRegisteredPlayerId(undefined)).toBe(LOCAL_PLAYER_ID);
  });

  it('falls back to LOCAL_PLAYER_ID when the registered player has no id', () => {
    expect(resolveRegisteredPlayerId({ look: DEFAULT_LOOK })).toBe(LOCAL_PLAYER_ID);
  });

  it('returns the registered player id otherwise', () => {
    expect(resolveRegisteredPlayerId({ id: 'p1', look: DEFAULT_LOOK })).toBe('p1');
  });
});
