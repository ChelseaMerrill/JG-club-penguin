import { ROOM_IDS, SPAWN_ROOM_ID, type RoomId } from '../../contracts';

/**
 * Gates every hook in this module. `true` in local `npm run dev` and in the
 * Playwright build (`playwright.config.ts` sets `VITE_E2E_HOOKS=true` for its
 * `webServer`); compiled out (`false`) of the Vercel production build.
 */
const HOOKS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';

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

export interface RoomDebugInfo {
  roomId: RoomId;
  scrollX: number;
  scrollY: number;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

/**
 * Publishes `RoomScene`'s current room id and camera scroll to
 * `window.__roomDebug`, only when `HOOKS_ENABLED`, so `e2e/room-framework.spec.ts`
 * can assert the camera never scrolls without reaching into Phaser internals.
 */
export function exposeRoomDebug(info: RoomDebugInfo): void {
  if (!HOOKS_ENABLED) {
    return;
  }
  window.__roomDebug = info;
}
