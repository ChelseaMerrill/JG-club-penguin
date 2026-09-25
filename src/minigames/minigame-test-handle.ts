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
  /** Ends a Pancake Flip round now, as if the shell's timer reached 0: its
   *  90s round is too long to play out for real (or to simulate
   *  minute-by-minute with a faked clock) in e2e. A no-op when Pancake Flip
   *  isn't the loaded Minigame. Additive alongside `finishNow`, which stays
   *  `bug-squash`-only. */
  finishPancakeFlipNow(): void;
}
