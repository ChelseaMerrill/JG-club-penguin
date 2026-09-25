// Test-only (#70 D10): seeds `createInMemoryProgressStore` with rivals for
// `e2e/minigame-leaderboard.spec.ts` to drive against, without ever shipping
// a test name into a production build. `main.ts` spreads this straight into
// the dev/e2e fallback store's options
// (`createInMemoryProgressStore({ emitter: gameEvents, ...devLeaderboardSeed() })`).

import type { LeaderboardRival } from '../persistence/in-memory-progress-store';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts/penguin';

/** `TEST PENGUIN A`..`TEST PENGUIN L`: 12 rivals, one per letter. */
const RIVAL_LETTERS = 'ABCDEFGHIJKL';

/** The Player this dev/e2e session plays as while the seed is active. */
export const E2E_PENGUIN_NAME = 'E2E PENGUIN';

function isSeedRequested(): boolean {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;
  return new URLSearchParams(window.location.search).get('leaderboard') === 'seed';
}

/**
 * With `?leaderboard=seed` (and only in a dev server or the Playwright
 * preview server, exactly like `dev-minigame-hook.ts`'s own env check),
 * returns 12 Bug Squash rivals (`TEST PENGUIN A`..`L`, bests 1500 down to
 * 400 in steps of 100 -- comfortably under `LEADERBOARD_SCORE_CEILINGS`'s
 * bug-squash ceiling of 60,000) and a completed look named `E2E PENGUIN` for
 * the session's own Player. Otherwise returns `{}`, so `main.ts`'s
 * `...devLeaderboardSeed()` spread is a no-op and Vite strips this
 * function's body from a production build (the same pattern
 * `dev-minigame-hook.ts` documents).
 */
export function devLeaderboardSeed(): {
  completedLook?: PenguinLook;
  leaderboardRivals?: readonly LeaderboardRival[];
} {
  if (!isSeedRequested()) return {};

  const leaderboardRivals: LeaderboardRival[] = RIVAL_LETTERS.split('').map((letter, index) => ({
    penguinName: `TEST PENGUIN ${letter}`,
    minigameId: 'bug-squash',
    bestScore: 1500 - index * 100,
    // Distinct, increasing "reached at" times: irrelevant to these scores
    // (none tie), but deterministic rather than left to definition order.
    reachedAtMs: index,
  }));

  return {
    completedLook: { ...DEFAULT_LOOK, name: E2E_PENGUIN_NAME },
    leaderboardRivals,
  };
}
