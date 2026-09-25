import { createBugSquashMinigame } from './bug-squash/bug-squash';
import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';
import { createSnowConeStand } from './snow-cone-stand/snow-cone-stand';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is #38's real game, `pancake-flip` is #39's, and
 * `snow-cone-stand` is #49's. Only `coffee-rush`'s `MinigameId` has no
 * factory yet, so launching it throws until its ticket adds an entry here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
    'pancake-flip': () => createPancakeFlip(),
    'snow-cone-stand': () => createSnowConeStand(),
  };
}
