import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';
import { createStubMinigame } from './stub-minigame';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * `bug-squash` is the stub until #38 lands; `pancake-flip` is #39's real
 * game. The remaining two `MinigameId`s (`coffee-rush`, `snow-cone-stand`)
 * have no factory yet, so launching them throws until their tickets add an
 * entry here.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createStubMinigame(),
    'pancake-flip': () => createPancakeFlip(),
  };
}
