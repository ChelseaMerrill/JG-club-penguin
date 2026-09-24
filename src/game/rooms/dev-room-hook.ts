import { ROOM_IDS, SPAWN_ROOM_ID, type Facing, type RoomId, type Tile } from '../../contracts';
import type { PenguinAnim } from '../penguin/poses';

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

/** The local Penguin's click-to-move state (#14 D8). */
export interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
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
