import { Textures, type Scene } from 'phaser';
import {
  ROOM_IDS,
  SPAWN_ROOM_ID,
  type Facing,
  type HexColor,
  type PenguinLook,
  type RoomId,
  type Tile,
} from '../../contracts';
import type { RegisteredPlayer } from '../movement/registered-player';
import type { PenguinAnim } from '../penguin';

/**
 * Gates every hook in this module. `true` in local `npm run dev` and in the
 * Playwright build (`playwright.config.ts` sets `VITE_E2E_HOOKS=true` for its
 * `webServer`); compiled out (`false`) of the Vercel production build.
 *
 * Exported so `RoomScene` (#14) can skip building its own per-frame debug
 * snapshot when hooks are disabled, rather than paying that cost only to
 * have `exposeRoomDebug` discard it.
 */
export const HOOKS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';

function isRoomId(value: string): value is RoomId {
  return (ROOM_IDS as readonly string[]).includes(value);
}

/**
 * Reads `?room=<RoomId>` from `location.search`, honoured only when
 * `HOOKS_ENABLED`. Falls back to `SPAWN_ROOM_ID` when the hook is disabled,
 * the param is missing, or it isn't a known `RoomId`.
 */
export function resolveRoomIdFromLocation(location: Pick<Location, 'search'>): RoomId {
  if (!HOOKS_ENABLED) {
    return SPAWN_ROOM_ID;
  }
  const requested = new URLSearchParams(location.search).get('room');
  return requested && isRoomId(requested) ? requested : SPAWN_ROOM_ID;
}

/**
 * Counts every currently-registered `Textures.Events.ADD_KEY` listener
 * across all keys (#14 D8, #31 follow-up: catches a leftover listener after
 * a Room restart). Lives here rather than in `RoomScene.ts` (#14 review fix
 * 7) since, like the rest of this module, it exists only to feed the debug
 * hook below.
 */
export function countActiveTextureListeners(scene: Scene): number {
  const prefix = Textures.Events.ADD_KEY;
  return scene.textures
    .eventNames()
    .filter((name): name is string => typeof name === 'string' && name.startsWith(prefix))
    .reduce((total, name) => total + scene.textures.listenerCount(name), 0);
}

/** The local Penguin's click-to-move state (#14 D8). */
export interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
  /** The sprite's Phaser `flipX` (true exactly when `facing === 'left'`); review fix 8. */
  flipX: boolean;
  /** `PenguinLook.name` as of this snapshot; review fix 1 (a sign-in look change, without a Room restart). */
  lookName: string;
  /** `PenguinLook.body`, same reasoning as `lookName`. */
  lookBody: HexColor;
  /** `PenguinState.playerId`; review fix 4. */
  playerId: string;
}

export interface RoomDebugInfo {
  roomId: RoomId;
  scrollX: number;
  scrollY: number;
  /** Absent until `RoomScene` has spawned the local Penguin. */
  localPenguin?: LocalPenguinDebugInfo;
  /** Active `Textures.Events.ADD_KEY` listener count (#14 D8, #31 follow-up: catches a leftover listener after a Room restart). */
  textureListenerCount?: number;
  /** `npcId` per `npc:arrived` emission, oldest first. */
  npcArrivedLog?: string[];
  /** Door label per `door:reached` emission, oldest first. */
  doorReachedLog?: string[];
  /** Target tile per `local-penguin:move` emission (walk start or re-route), oldest first. */
  localPenguinMoveLog?: Tile[];
  /** Restarts the Scene (`this.scene.restart()`), for the cleanup e2e test. */
  restartRoom?: () => void;
  /**
   * Increments once per completed `create()`, including the very first boot
   * (review fix 8): lets a restart test wait for an actual restart to have
   * happened, rather than racing a poll that could pass on stale,
   * pre-restart state.
   */
  restartCount?: number;
  /**
   * Count of the local and debug Penguin `Container`s currently in the
   * Scene's display list (review fix 8's Room-restart leak check); excludes
   * remote Penguins.
   */
  penguinCount?: number;
  /** Count of remote Penguin `Container`s (#28's `RoomPenguinView`) in the Scene's display list. */
  remotePenguinCount?: number;
  /**
   * One entry per remote Penguin `RoomPenguinView` currently shows (#43 D6):
   * its shown tile, whether it's mid-walk, `placedTile` (the tile it was
   * first placed at since the last Room `attach()`, e.g. from Presence on a
   * late join, distinct from `tile` so a test can tell them apart), and
   * `walkStartedAt` (`Date.now()` when its current or last walk started,
   * absent if it has never walked; #43 fix F4 — an e2e latency measurement
   * reads this directly instead of paying a round trip and poll interval as
   * measurement noise).
   */
  remotePenguins?: Array<{
    playerId: string;
    tile: Tile;
    moving: boolean;
    placedTile: Tile;
    walkStartedAt?: number;
  }>;
  /**
   * Test-only: sets `registry.player`, exercising the real sign-in
   * look/id-update path end to end (review fixes 1 and 4) rather than
   * reaching into `RoomScene` internals.
   */
  setRegisteredPlayer?: (player: RegisteredPlayer) => void;
  /**
   * Test-only: spawns an extra, static Penguin at `tile` with `look`, for
   * the WAVE/DANCE evidence screenshot (review fix 8). It's never cleaned up
   * automatically, so only a dedicated, single-purpose e2e test should call
   * it.
   */
  spawnDebugPenguin?: (tile: Tile, look: PenguinLook) => void;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

/**
 * Publishes `RoomScene`'s current debug snapshot to `window.__roomDebug`,
 * only when `HOOKS_ENABLED`, so `e2e/room-framework.spec.ts` and
 * `e2e/click-to-move.spec.ts` can assert Room/movement state without
 * reaching into Phaser internals. Each call replaces the whole object.
 */
export function exposeRoomDebug(info: RoomDebugInfo): void {
  if (!HOOKS_ENABLED) {
    return;
  }
  window.__roomDebug = info;
}
