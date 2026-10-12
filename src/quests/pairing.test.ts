import { describe, expect, it } from 'vitest';
import {
  createPairingTracker,
  isNearAnyCandidate,
  PAIRING_DISTANCE_TILES,
  PAIRING_DURATION_MS,
  type PairingCandidate,
} from './pairing';

describe('isNearAnyCandidate', () => {
  it('is true exactly at the 1.5-tile boundary, false just past it', () => {
    const candidates: PairingCandidate[] = [{ id: 'paul-carnival', tile: { col: 0, row: 0 } }];

    expect(isNearAnyCandidate({ col: PAIRING_DISTANCE_TILES, row: 0 }, candidates)).toBe(true);
    expect(isNearAnyCandidate({ col: PAIRING_DISTANCE_TILES + 0.01, row: 0 }, candidates)).toBe(
      false,
    );
  });

  it('is true when near any one of several candidates, false near none', () => {
    const candidates: PairingCandidate[] = [
      { id: 'a', tile: { col: 10, row: 10 } },
      { id: 'b', tile: { col: 1, row: 1 } },
    ];

    expect(isNearAnyCandidate({ col: 1, row: 1.4 }, candidates)).toBe(true);
    expect(isNearAnyCandidate({ col: 5, row: 5 }, candidates)).toBe(false);
  });

  it('is false with no candidates at all', () => {
    expect(isNearAnyCandidate({ col: 0, row: 0 }, [])).toBe(false);
  });
});

describe('createPairingTracker', () => {
  const paul: PairingCandidate = { id: 'paul-carnival', tile: { col: 4, row: 2 } };
  const nearPaul = { col: 4, row: 3 };
  const farFromPaul = { col: 20, row: 20 };

  it('returns false before 10 continuous seconds near someone have elapsed', () => {
    const tracker = createPairingTracker();

    expect(tracker.tick(nearPaul, [paul], 0)).toBe(false);
    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS - 1)).toBe(false);
  });

  it('returns true the instant 10 continuous seconds near someone elapse', () => {
    const tracker = createPairingTracker();

    tracker.tick(nearPaul, [paul], 1_000);
    expect(tracker.tick(nearPaul, [paul], 1_000 + PAIRING_DURATION_MS)).toBe(true);
  });

  it('keeps returning false on every call after the one that returned true', () => {
    const tracker = createPairingTracker();

    tracker.tick(nearPaul, [paul], 0);
    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS)).toBe(true);
    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS + 5_000)).toBe(false);
  });

  it('resets the streak on the instant proximity is lost, needing a fresh 10 s', () => {
    const tracker = createPairingTracker();

    tracker.tick(nearPaul, [paul], 0);
    tracker.tick(nearPaul, [paul], 5_000);
    // Steps away for one tick, breaking the streak.
    expect(tracker.tick(farFromPaul, [paul], 6_000)).toBe(false);
    // Back near: the streak restarts from this tick, not from the original 0.
    const restartMs = 7_000;
    expect(tracker.tick(nearPaul, [paul], restartMs)).toBe(false);
    expect(tracker.tick(nearPaul, [paul], restartMs + PAIRING_DURATION_MS - 1)).toBe(false);
    expect(tracker.tick(nearPaul, [paul], restartMs + PAIRING_DURATION_MS)).toBe(true);
  });

  it('reset() forgets an in-progress streak and a prior success, starting over', () => {
    const tracker = createPairingTracker();

    tracker.tick(nearPaul, [paul], 0);
    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS)).toBe(true);

    tracker.reset();

    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS + 1)).toBe(false);
    expect(tracker.tick(nearPaul, [paul], PAIRING_DURATION_MS + 1 + PAIRING_DURATION_MS)).toBe(
      true,
    );
  });

  it('works against a real Player candidate exactly like the solo Paul fallback', () => {
    const tracker = createPairingTracker();
    const otherPlayer: PairingCandidate = { id: 'other-player-id', tile: { col: 0, row: 0 } };

    tracker.tick({ col: 1, row: 0 }, [otherPlayer], 0);
    expect(tracker.tick({ col: 1, row: 0 }, [otherPlayer], PAIRING_DURATION_MS)).toBe(true);
  });
});
