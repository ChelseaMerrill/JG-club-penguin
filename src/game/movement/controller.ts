import {
  DEFAULT_FACING,
  type Facing,
  type PenguinState,
  type RoomId,
  type Tile,
} from '../../contracts';
import { findPath, type WalkableGrid } from './pathfinding';

/**
 * The screen-facing direction for a single 4-way step from `from` to `to`
 * (#14 D3): left when the step moves the screen x backward (row increases
 * or col decreases, per `iso.ts`'s "increasing col moves right ... row moves
 * left"), right otherwise. Pure tile-space math — no `iso.ts` import needed,
 * since a step's screen-x direction is fully determined by its `col - row`
 * delta.
 */
export function facingForStep(from: Tile, to: Tile): Facing {
  const delta = to.col - to.row - (from.col - from.row);
  return delta < 0 ? 'left' : 'right';
}

export interface LocalPenguinControllerInit {
  playerId: string;
  roomId: RoomId;
  tile: Tile;
  facing?: Facing;
}

/**
 * Holds one local Penguin's `PenguinState` (#14 D4) and the walk mechanics
 * `RoomScene` drives it with, decoupled from Phaser so it's unit-testable
 * without a Scene. `RoomScene` owns the per-tile tweening and animation
 * calls; this controller only tracks where the walker is, where it's headed,
 * and which way it's facing.
 */
export interface LocalPenguinController {
  /** Mutated in place by `moveTo`/`setFacing`/`arriveAtNextTile`/`stop`. */
  readonly state: PenguinState;

  /**
   * Finds a path from `state.tile` to `target` and adopts it as the active
   * path, setting `state.target`. Returns the path (start tile first), or
   * `null` when `target` is unreachable, in which case `state` and any
   * previous active path are left untouched (the click is ignored).
   */
  moveTo(target: Tile): Tile[] | null;

  /** True while there's a next tile left to walk to. */
  isMoving(): boolean;

  /** The next tile in the active path, or `null` when not moving. */
  nextTile(): Tile | null;

  /** Sets `state.facing` directly (RoomScene calls this as each step starts). */
  setFacing(facing: Facing): void;

  /**
   * Marks arrival at `nextTile()`: advances `state.tile` to it and drops it
   * from the active path. Clears `state.target` once the path is exhausted.
   * Returns the new `state.tile`. A no-op (returns `state.tile` unchanged)
   * when nothing is moving.
   */
  arriveAtNextTile(): Tile;

  /** Cancels the active path in place; `state.tile` stays the last-reached tile. */
  stop(): void;
}

export function createLocalPenguinController(
  walkable: WalkableGrid,
  init: LocalPenguinControllerInit,
): LocalPenguinController {
  const state: PenguinState = {
    playerId: init.playerId,
    roomId: init.roomId,
    tile: init.tile,
    facing: init.facing ?? DEFAULT_FACING,
  };

  // The remaining path, current tile first; length <= 1 means "not moving".
  let activePath: Tile[] = [];

  function moveTo(target: Tile): Tile[] | null {
    const found = findPath(walkable, state.tile, target);
    if (!found) return null;
    activePath = found;
    state.target = target;
    return found;
  }

  function isMoving(): boolean {
    return activePath.length > 1;
  }

  function nextTile(): Tile | null {
    return activePath.length > 1 ? activePath[1] : null;
  }

  function setFacing(facing: Facing): void {
    state.facing = facing;
  }

  function arriveAtNextTile(): Tile {
    const next = nextTile();
    if (!next) return state.tile;
    state.tile = next;
    activePath = activePath.slice(1);
    if (activePath.length <= 1) {
      activePath = [];
      state.target = undefined;
    }
    return state.tile;
  }

  function stop(): void {
    activePath = [];
    state.target = undefined;
  }

  return { state, moveTo, isMoving, nextTile, setFacing, arriveAtNextTile, stop };
}
