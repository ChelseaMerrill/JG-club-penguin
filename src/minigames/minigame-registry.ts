import type { MinigameRegistry } from './minigame';
import { createStubMinigame } from './stub-minigame';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is the stub until #38 lands; the other three `MinigameId`s
 * (`pancake-flip`, `coffee-rush`, `snow-cone-stand`) have no factory yet, so
 * launching them throws until their tickets add an entry here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createStubMinigame(),
  };
}
