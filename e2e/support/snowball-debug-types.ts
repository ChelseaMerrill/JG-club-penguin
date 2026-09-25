import type { Tile } from '../../src/contracts';

/**
 * Mirrors `src/snowball/dev-snowball-hook.ts`'s `SnowballDebugInfo` (#53),
 * redeclared here for the same reason `room-debug-types.ts` redeclares
 * `RoomDebugInfo`: that module reads `import.meta.env`, which the `e2e`
 * tsconfig doesn't type-check.
 */
export interface SnowHatDebugInfo {
  appliedAt: number;
  until: number;
  rendered: boolean;
}

export interface SnowballThrowLogEntry {
  target: Tile;
  at: number;
}

export interface SnowballDebugInfo {
  mode: boolean;
  ammo: number;
  reticle: Tile | null;
  snowHats: Record<string, SnowHatDebugInfo>;
  throwLog: SnowballThrowLogEntry[];
}

declare global {
  interface Window {
    __snowballDebug?: SnowballDebugInfo;
  }
}
