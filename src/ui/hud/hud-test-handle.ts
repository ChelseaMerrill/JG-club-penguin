import type { RoomId } from '../../contracts';

/**
 * Test handle `initDevHudHook` (`src/ui/hud/dev-hud-hook.ts`) exposes on
 * `window` for e2e specs. Kept in its own file, separate from
 * `dev-hud-hook.ts`, so `e2e/hud.spec.ts` can import this type without
 * pulling `dev-hud-hook.ts`'s `import.meta.env` reads into the `e2e`
 * TypeScript program (`tsconfig.node.json`), which has no `vite/client`
 * types.
 */
export interface HudTestHandle {
  /** Emits `room:enter` for `roomId` with a throwaway entry tile. */
  emitRoomEnter(roomId: RoomId): void;
  /** Grows by one every time the HUD emits `ui:open-creator`. */
  openCreatorLog: number[];
}
