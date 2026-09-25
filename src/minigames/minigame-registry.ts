import { createBugSquashMinigame } from './bug-squash/bug-squash';
import { createCoffeeRush } from './coffee-rush/coffee-rush';
import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is #38's real game, `pancake-flip` is #39's, and
 * `coffee-rush` is #50's. The remaining `MinigameId` (`snow-cone-stand`) has
 * no factory yet, so launching it throws until its ticket adds an entry
 * here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
    'pancake-flip': () => createPancakeFlip(),
    'coffee-rush': () => createCoffeeRush(),
  };
}
