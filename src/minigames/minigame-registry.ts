import { createBeystadium } from './beystadium/beystadium';
import { createBugSquashMinigame } from './bug-squash/bug-squash';
import { createCoffeeRush } from './coffee-rush/coffee-rush';
import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';
import { createPenaltyKick } from './penalty-kick/penalty-kick';
import { createSnowConeStand } from './snow-cone-stand/snow-cone-stand';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * Every `MinigameId` has its real game: `bug-squash` (#38), `pancake-flip`
 * (#39), `snow-cone-stand` (#49), `coffee-rush` (#50), `beystadium` (#121)
 * and `penalty-kick` (#220, launched by Chrystian Rissoli's NPC dialog and
 * the LATAM Futebol Field's ball hotspot).
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
    'pancake-flip': () => createPancakeFlip(),
    'coffee-rush': () => createCoffeeRush(),
    'snow-cone-stand': () => createSnowConeStand(),
    beystadium: () => createBeystadium(),
    'penalty-kick': () => createPenaltyKick(),
  };
}
