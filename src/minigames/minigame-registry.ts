import { createBugSquashMinigame } from './bug-squash/bug-squash';
import type { MinigameRegistry } from './minigame';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is #38's real game; the other three `MinigameId`s
 * (`pancake-flip`, `coffee-rush`, `snow-cone-stand`) have no factory yet, so
 * launching them throws until their tickets add an entry here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
  };
}
