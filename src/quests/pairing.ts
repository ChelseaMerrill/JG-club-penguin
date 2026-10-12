import type { Tile } from '../contracts';

/**
 * The "pair with a JGer" step's detection (#140 decision 3, "pair-with-jger"):
 * while in The Icebox, the local Penguin stays within `PAIRING_DISTANCE_TILES`
 * of another Player's Penguin for `PAIRING_DURATION_MS` continuous
 * milliseconds -- or, solo, next to Paul Carnival for the same stretch. This
 * is client-asserted only: Presence positions are live-only, never recorded,
 * so the server has no way to check "stood near someone for 10 s" itself
 * (20261009000000_quest_pair_flaky_test.sql P4). Pure and fed a tick at a
 * time by the Room's own position updates (`main.ts`'s wiring), so it is
 * unit-testable without any game/DOM/Presence dependency.
 */

/** How close counts as "paired" (#140 decision 3): 1.5 tiles, straight-line distance in tile units. */
export const PAIRING_DISTANCE_TILES = 1.5;

/** Continuous time required before the step is met (#140 decision 3): 10 seconds. */
export const PAIRING_DURATION_MS = 10_000;

/** One other Penguin's position this tick: a real Player, or Paul Carnival alone (the solo fallback). */
export interface PairingCandidate {
  id: string;
  tile: Tile;
}

function tileDistance(a: Tile, b: Tile): number {
  const dCol = a.col - b.col;
  const dRow = a.row - b.row;
  return Math.sqrt(dCol * dCol + dRow * dRow);
}

/** True when `tile` is within `PAIRING_DISTANCE_TILES` of at least one of `candidates`. */
export function isNearAnyCandidate(tile: Tile, candidates: readonly PairingCandidate[]): boolean {
  return candidates.some(
    (candidate) => tileDistance(tile, candidate.tile) <= PAIRING_DISTANCE_TILES,
  );
}

export interface PairingTracker {
  /**
   * One position sample: `localTile` is the signed-in Player's own tile this
   * tick, and `candidates` is every other Penguin to measure distance
   * against (every other Player present in The Icebox, or
   * `[{ id: 'paul-carnival', tile: <Paul's tile> }]` alone when no other
   * Player is in the Room -- the caller decides which list to pass; this
   * module only measures distance and elapsed time). Returns `true` the
   * instant `PAIRING_DURATION_MS` continuous milliseconds near someone have
   * elapsed; keeps returning `false` on every call after that until
   * `reset()` is called (the caller marks the step done and stops ticking,
   * mirroring the other quest controllers' one-shot client-asserted marks).
   */
  tick(localTile: Tile, candidates: readonly PairingCandidate[], nowMs: number): boolean;
  /** Forgets any in-progress streak -- e.g. leaving The Icebox, or losing proximity. */
  reset(): void;
}

/** A fresh tracker, its streak unset. */
export function createPairingTracker(): PairingTracker {
  let streakStartMs: number | null = null;
  let satisfied = false;

  return {
    tick(localTile, candidates, nowMs) {
      if (satisfied) return false;
      if (!isNearAnyCandidate(localTile, candidates)) {
        streakStartMs = null;
        return false;
      }
      if (streakStartMs === null) {
        streakStartMs = nowMs;
      }
      if (nowMs - streakStartMs >= PAIRING_DURATION_MS) {
        satisfied = true;
        return true;
      }
      return false;
    },
    reset() {
      streakStartMs = null;
      satisfied = false;
    },
  };
}
