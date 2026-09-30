import type { RoomId, Tile } from '../contracts';
import { doorApproachTile, npcInteractionTile } from '../game/movement/targets';
import {
  compileCssAnimation,
  sampleCssAnimation,
  transformPoint,
} from '../game/npcs/css-keyframes';
import { screenToTile, TILE_HEIGHT, TILE_WIDTH, tileToScreen } from '../game/rooms/iso';
import type { RoomDefinition, RoomDoor } from '../game/rooms/room-definition';
import { getNpcMotion, type NpcMotionSpec } from '../npcs/npc-motions';
import type { NpcId } from '../npcs/npcs';
import { GUARD_NPC_ID, type GuardWindow, type PhishingState } from './phishing-client';

/**
 * Where Anthony stands in the Room being shown (#146), for
 * `RoomScene.setGuard`. `doorLabel` names the door he guards (he stands on
 * its approach tile); `null` puts him next to the Player instead (the
 * Security Training lockout). `blocking` shuts that door for this Player:
 * using it starts his challenge instead of the Room change.
 */
export interface RoomGuard {
  roomId: RoomId;
  npcId: NpcId;
  doorLabel: string | null;
  blocking: boolean;
}

/**
 * Anthony's placement for `roomId`, from the server's guard window and the
 * Player's quiz state: at his scheduled door, shut until this window is
 * passed; while locked out, also next to the Player in any other Room.
 */
export function planGuard(
  roomId: RoomId,
  window: GuardWindow | null,
  state: PhishingState,
): RoomGuard | null {
  if (window && window.roomId === roomId) {
    return {
      roomId,
      npcId: GUARD_NPC_ID,
      doorLabel: window.doorLabel,
      blocking: !state.passedGuardWindow,
    };
  }
  if (state.locked) {
    return { roomId, npcId: GUARD_NPC_ID, doorLabel: null, blocking: false };
  }
  return null;
}

/** Whether using `door` should start Anthony's challenge instead of leaving the Room. */
export function isGuardedDoor(guard: RoomGuard | null, door: RoomDoor): boolean {
  return guard !== null && guard.blocking && guard.doorLabel === door.label;
}

/**
 * The Tile Anthony stands on: the guarded door's approach tile (the tile a
 * Penguin walks to in order to use it), or, when he isn't at a door, the
 * walkable tile nearest `playerTile` that is clear of the Room's NPCs.
 * `null` for a door `room` doesn't have.
 */
export function guardTile(
  room: RoomDefinition,
  guard: Pick<RoomGuard, 'doorLabel'>,
  playerTile: Tile,
): Tile | null {
  if (guard.doorLabel !== null) {
    const door = room.doors.find((candidate) => candidate.label === guard.doorLabel);
    return door ? doorApproachTile(room.walkable, door, room.grid.origin) : null;
  }
  // Clear of the Room's own NPCs where there's room (not on or next to one,
  // so he and his click zone don't overlap theirs), else just not on one.
  // Where there's room he's also off every tile a roaming NPC walks over:
  // one passing in front of him would otherwise take the clicks meant for
  // him (Phaser hit-tests only the topmost zone).
  const npcTiles = room.npcSlots.map((slot) => slot.tile);
  const pathTiles = npcOccupiedTiles(room);
  const on = (tiles: Tile[], tile: Tile) =>
    tiles.some((npc) => npc.col === tile.col && npc.row === tile.row);
  const without = (blocked: (tile: Tile) => boolean) =>
    room.walkable.map((row, rowIndex) =>
      row.map((cell, col) => cell && !blocked({ col, row: rowIndex })),
    );
  for (const blocked of [
    (tile: Tile) => npcTiles.some((npc) => isNextTo(npc, tile)) || on(pathTiles, tile),
    (tile: Tile) => on(pathTiles, tile),
    (tile: Tile) => npcTiles.some((npc) => isNextTo(npc, tile)),
    (tile: Tile) => on(npcTiles, tile),
  ]) {
    const tile = npcInteractionTile(without(blocked), { npcId: GUARD_NPC_ID, tile: playerTile });
    if (tile.col !== playerTile.col || tile.row !== playerTile.row) return tile;
  }
  return npcInteractionTile(room.walkable, { npcId: GUARD_NPC_ID, tile: playerTile });
}

/** How finely `npcOccupiedTiles` samples each path loop: well under a tile per step. */
const PATH_SAMPLES = 200;

/**
 * Every Tile a Room NPC stands on or walks over: its slot tile, plus each
 * tile its designed `path` (`npc-motions.ts`) crosses during one loop.
 */
export function npcOccupiedTiles(room: RoomDefinition): Tile[] {
  const seen = new Map<string, Tile>();
  const add = (tile: Tile): void => {
    seen.set(`${tile.col},${tile.row}`, tile);
  };
  for (const slot of room.npcSlots) {
    add(slot.tile);
    const path = getNpcMotion(slot.npcId)?.path;
    if (!path) continue;
    const compiled = compileCssAnimation(path);
    const rest = tileToScreen(slot.tile, room.grid.origin);
    for (let step = 0; step < PATH_SAMPLES; step += 1) {
      const matrix = sampleCssAnimation(compiled, (compiled.durationMs * step) / PATH_SAMPLES);
      const offset = transformPoint(matrix, { x: 0, y: 0 });
      add(screenToTile({ x: rest.x + offset.x, y: rest.y + offset.y }, room.grid.origin));
    }
  }
  return [...seen.values()];
}

/**
 * How long one pacing loop takes: out to one side, back, out to the other,
 * back.
 */
export const GUARD_PACE_PERIOD_S = 10;

/**
 * Anthony pacing at the door he guards (owner request, 2026-09-30, Track D):
 * from his post `tile` out one tile to one side and back, then out to the
 * other side and back, over walkable tiles no Room NPC stands on or walks
 * over (`npcOccupiedTiles`).
 * The two sides are opposite each other where they can be (across the door
 * first, then along it), so he stays in front of it. `undefined` when no
 * tile next to him is free (he then stands still, as before). His post
 * doesn't move: the door stays guarded and his dialog still opens from it.
 *
 * The `translate()`s are `tileToScreen` deltas (Stage pixels) from his post,
 * the same units every NPC's `path` uses (`motions/types.ts`).
 */
export function guardPaceMotion(room: RoomDefinition, tile: Tile): NpcMotionSpec | undefined {
  const occupied = npcOccupiedTiles(room);
  const free = (dc: number, dr: number): boolean => {
    const col = tile.col + dc;
    const row = tile.row + dr;
    if (room.walkable[row]?.[col] !== true) return false;
    return !occupied.some((npc) => npc.col === col && npc.row === row);
  };
  const axes: [number, number][][] = [
    [
      [-1, 0],
      [1, 0],
    ],
    [
      [0, -1],
      [0, 1],
    ],
  ];
  const opposite = axes.find((pair) => pair.every(([dc, dr]) => free(dc, dr)));
  const sides = opposite ?? axes.flat().filter(([dc, dr]) => free(dc, dr));
  const [first, second] = sides;
  if (!first) return undefined;
  const offset = ([dc, dr]: [number, number]): string =>
    `translate(${((dc - dr) * TILE_WIDTH) / 2}px,${((dc + dr) * TILE_HEIGHT) / 2}px)`;
  const home = 'translate(0,0)';
  return {
    path: {
      keyframes: `@keyframes guardPace { 0%,10% { transform: ${home};} 25%,35% { transform: ${offset(first)};} 50%,60% { transform: ${home};} 75%,85% { transform: ${second ? offset(second) : home};} 100% { transform: ${home};} }`,
      animation: `guardPace ${GUARD_PACE_PERIOD_S}s ease-in-out infinite`,
    },
    // The design's generic `idle` bob, as every authored walk uses.
    figure: {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out infinite',
    },
  };
}

/** Whether two Tiles touch (the same tile or one of its eight neighbours). */
export function isNextTo(a: Tile, b: Tile): boolean {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}

/**
 * "Bumping into" Anthony: finishing a walk next to him after having been
 * away from him. Walking away and coming back bumps him again.
 */
export interface BumpTracker {
  /** Starts over, e.g. when he's placed; `near` is whether the Player is next to him now. */
  reset(near: boolean): void;
  /** A walk ended; `near` is whether it ended next to him. True for a bump. */
  arrived(near: boolean): boolean;
}

export function createBumpTracker(): BumpTracker {
  let wasNear = false;
  return {
    reset(near) {
      wasNear = near;
    },
    arrived(near) {
      const bumped = near && !wasNear;
      wasNear = near;
      return bumped;
    },
  };
}
