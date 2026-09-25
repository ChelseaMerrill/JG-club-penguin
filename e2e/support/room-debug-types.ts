import type { Facing, HexColor, PenguinLook, RoomId, Tile } from '../../src/contracts';
import type { RegisteredPlayer } from '../../src/game/movement/registered-player';
import type { PenguinAnim } from '../../src/game/penguin/poses';

/**
 * Mirrors `src/game/rooms/dev-room-hook.ts`'s `RoomDebugInfo`, redeclared
 * here rather than imported: that module reads `import.meta.env`, which the
 * `e2e` tsconfig doesn't type-check (no `vite/client` types).
 * `RegisteredPlayer`/`PenguinLook`/`Tile`/etc. are themselves plain, Phaser-
 * and `import.meta.env`-free types, so those are imported directly.
 *
 * Every e2e spec that reads `window.__roomDebug` imports these types (and
 * this file's `declare global`) from here instead of redeclaring its own
 * copy: TypeScript's global `Window` augmentation requires every
 * declaration of `__roomDebug` in this program to resolve to the same type,
 * so one shared definition is the only one that ever needs to be kept in
 * sync with the real `RoomDebugInfo` (#15 review round 1).
 */
export interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
  flipX: boolean;
  lookName: string;
  lookBody: HexColor;
  playerId: string;
}

/** One remote Penguin's movement state (#43). */
export interface RemotePenguinDebugInfo {
  playerId: string;
  tile: Tile;
  moving: boolean;
  placedTile: Tile;
  walkStartedAt?: number;
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
  localPenguin?: LocalPenguinDebugInfo;
  textureListenerCount?: number;
  npcArrivedLog?: string[];
  doorReachedLog?: string[];
  localPenguinMoveLog?: Tile[];
  localPenguinArrivedLog?: Tile[];
  restartRoom?: () => void;
  restartCount?: number;
  penguinCount?: number;
  remotePenguinCount?: number;
  remotePenguins?: RemotePenguinDebugInfo[];
  setRegisteredPlayer?: (player: RegisteredPlayer) => void;
  spawnDebugPenguin?: (tile: Tile, look: PenguinLook) => void;
  comingSoonHint?: string | null;
  changeRoom?: (roomId: RoomId) => void;
  roomEventLog?: RoomDebugEventLogEntry[];
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}
