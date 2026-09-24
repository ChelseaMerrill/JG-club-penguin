/**
 * Test handle `initDevMinigameHook` (`dev-minigame-hook.ts`) exposes on
 * `window` for e2e specs. Kept in its own file, separate from
 * `dev-minigame-hook.ts`, so `e2e/minigame.spec.ts` can import this type
 * without pulling `dev-minigame-hook.ts`'s `import.meta.env` reads into the
 * `e2e` TypeScript program (`tsconfig.node.json`), which has no `vite/client`
 * types — the same split `hud-test-handle.ts` makes for `dev-hud-hook.ts`.
 */
export interface MinigameTestHandle {
  /** Sets the stub Bug Squash game's score directly, bypassing clicks. */
  setStubScore(score: number): void;
  /** Ends the round now, as if the shell's timer reached 0. */
  finishNow(): void;
}
