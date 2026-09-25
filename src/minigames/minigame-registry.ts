import { createBugSquashMinigame } from './bug-squash/bug-squash';
import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is #38's real game and `pancake-flip` is #39's. The remaining
 * two `MinigameId`s (`coffee-rush`, `snow-cone-stand`) have no factory yet,
 * so launching them throws until their tickets add an entry here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
    'pancake-flip': () => createPancakeFlip(),
  };
}
