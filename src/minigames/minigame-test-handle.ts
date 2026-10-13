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
  /** Ends a Beystadium match now, as it stands (a match not yet won pays as
   *  a loss), as if the shell's timer reached 0. A no-op when Beystadium
   *  isn't the loaded Minigame. */
  finishBeystadiumNow(): void;
  /** Takes Penalty Kick's current shot with a forced outcome, bypassing the
   *  aim sweep and the keeper's RNG entirely (issue #220): e2e drives real
   *  wall-clock time and has no reason to fight a 16 ms-tick sweep to land
   *  an exact outcome. A no-op when Penalty Kick isn't the loaded Minigame. */
  takePenaltyKickShot(outcome: 'goal' | 'golazo' | 'save' | 'wide' | 'over'): void;
  /** Ends a Carnaval Parade round now, as if the shell's timer reached 0 or
   *  all 3 lives were lost. A no-op when Carnaval Parade isn't the loaded
   *  Minigame. */
  finishCarnavalParadeNow(): void;
  /** Matches every remaining pair in Pão de Queijo Memory's current round at
   *  once (issue #218): e2e calls this once per round to clear the whole
   *  game without playing out 24 real flips. A no-op when Pão de Queijo
   *  Memory isn't the loaded Minigame. */
  matchAllPaoDeQueijoPairs(): void;
  /** Launches another registered Minigame in the same page once the
   *  current shell has closed (#46: finishing two different Minigames in one
   *  page for the Quest e2e). The `finish*` methods above then drive the
   *  newly launched one. */
  launch(minigameId: MinigameId): void;
}
