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
import type { RemotePenguinDebugInfo } from './room-penguin-view';

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

/** One `room:leave`/`room:enter` #15's navigator has emitted, in emission order. */
export interface RoomDebugEventLogEntry {
  type: 'room:leave' | 'room:enter';
  roomId: RoomId;
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
  /** `npcId` per `npc:talked` emission, oldest first (#36). */
  npcTalkedLog?: string[];
  /** `stallId` per `actions.openStall` call, oldest first (#36; #40 is on `main`, so this now accompanies a real Market panel open, not just a logged no-op). */
  openStallLog?: string[];
  /** Door label per `door:reached` emission, oldest first. */
  doorReachedLog?: string[];
  /** Target tile per `local-penguin:move` emission (walk start or re-route), oldest first. */
  localPenguinMoveLog?: Tile[];
  /** The disabled door's label while its "COMING SOON" hint (#15 D3) is shown; `null` otherwise. */
  comingSoonHint?: string | null;
  /**
   * Test-only: #15's navigator's own `changeRoom`, so a test can change Room
   * directly rather than clicking a door or the HUD. Set once, by
   * `registerRoomDebugNavigatorHooks`, and merged onto every later
   * `exposeRoomDebug` snapshot (`RoomScene`'s own per-frame call knows
   * nothing about the navigator and would otherwise overwrite it).
   */
  changeRoom?: (roomId: RoomId) => void;
  /** Test-only: every `room:leave`/`room:enter` #15's navigator has emitted, oldest first. Same merge story as `changeRoom`. */
  roomEventLog?: RoomDebugEventLogEntry[];
  /** Tile per `local-penguin:arrived` emission, oldest first (#43). */
  localPenguinArrivedLog?: Tile[];
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
   * One entry per remote Penguin `RoomPenguinView` currently shows (#43 D6);
   * see `RemotePenguinDebugInfo` for each field's meaning.
   */
  remotePenguins?: RemotePenguinDebugInfo[];
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

// `npc:talked`/`actions.openStall` calls (#36) come from `main.ts`'s NPC
// dialog wiring, entirely outside `RoomScene`, so they can't be fields on the
// `RoomDebugInfo` `RoomScene.publishRoomDebug` builds every frame the way
// `npcArrivedLog` is: that snapshot would simply have no such data to put
// there. Tracked here instead, as module state merged into every
// `exposeRoomDebug` publish below, so a Room restart (a fresh `RoomScene`
// snapshot) never clears a log that in fact spans the whole page session.
const npcTalkedLog: string[] = [];
const openStallLog: string[] = [];

/** Records an `npc:talked` npcId for `window.__roomDebug.npcTalkedLog` (#36); a no-op unless `HOOKS_ENABLED`. */
export function recordNpcTalked(npcId: string): void {
  if (!HOOKS_ENABLED) return;
  npcTalkedLog.push(npcId);
}

/** Records an `actions.openStall` stallId for `window.__roomDebug.openStallLog` (#36); a no-op unless `HOOKS_ENABLED`. */
export function recordOpenStall(stallId: string): void {
  if (!HOOKS_ENABLED) return;
  openStallLog.push(stallId);
}

/** #15's navigator-owned fields, set once by `registerRoomDebugNavigatorHooks` and merged onto every `exposeRoomDebug` snapshot below. */
let navigatorHooks: Pick<RoomDebugInfo, 'changeRoom' | 'roomEventLog'> = {};

/**
 * Test-only: publishes #15's navigator `changeRoom` and its `room:leave`/
 * `room:enter` log onto every future `window.__roomDebug` snapshot. Call
 * once, after the navigator exists (`main.ts`): `RoomScene`'s own per-frame
 * `exposeRoomDebug` call knows nothing about the navigator, so without this
 * merge it would overwrite these fields with `undefined` on every frame.
 */
export function registerRoomDebugNavigatorHooks(
  hooks: Pick<RoomDebugInfo, 'changeRoom' | 'roomEventLog'>,
): void {
  navigatorHooks = hooks;
}

/**
 * Publishes `RoomScene`'s current debug snapshot to `window.__roomDebug`,
 * only when `HOOKS_ENABLED`, so `e2e/room-framework.spec.ts` and
 * `e2e/click-to-move.spec.ts` can assert Room/movement state without
 * reaching into Phaser internals. Each call replaces the whole object,
 * except `npcTalkedLog`/`openStallLog` (#36) and `navigatorHooks` (#15),
 * which always carry forward regardless of what `info` itself sets.
 */
export function exposeRoomDebug(info: RoomDebugInfo): void {
  if (!HOOKS_ENABLED) {
    return;
  }
  window.__roomDebug = { ...info, npcTalkedLog, openStallLog, ...navigatorHooks };
}
