import type { MinigameId } from '../contracts/game-events';

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
  /** Ends a Coffee Rush round now, as if the shell's timer reached 0: same
   *  reason as `finishPancakeFlipNow` (a 90s round). A no-op when Coffee
   *  Rush isn't the loaded Minigame. */
  finishCoffeeRushNow(): void;
  /** Ends a Snow Cone Stand round now, as if the shell's timer reached 0:
   *  its 120s round is too long to play out for real in e2e. A no-op when
   *  Snow Cone Stand isn't the loaded Minigame. Additive alongside
   *  `finishNow`/`finishPancakeFlipNow` (issue #49). */
  finishSnowConeStandNow(): void;
  /** Launches another registered Minigame in the same page once the
   *  current shell has closed (#46: finishing two different Minigames in one
   *  page for the Quest e2e). The `finish*` methods above then drive the
   *  newly launched one. */
  launch(minigameId: MinigameId): void;
}
