import { createBeystadium } from './beystadium/beystadium';
import { createBugSquashMinigame } from './bug-squash/bug-squash';
import { createCarnavalParade } from './carnaval-parade/carnaval-parade';
import { createCoffeeRush } from './coffee-rush/coffee-rush';
import type { MinigameRegistry } from './minigame';
import { createPancakeFlip } from './pancake-flip/pancake-flip';
import { createSnowConeStand } from './snow-cone-stand/snow-cone-stand';

/**
 * The one registry `src/main.ts` wires into `createMinigameLauncher`.
 * Every `MinigameId` has its real game: `bug-squash` (#38), `pancake-flip`
 * (#39), `snow-cone-stand` (#49), `coffee-rush` (#50), `beystadium` and
 * `carnaval-parade` (#219). Carnaval Parade is launched by Hector Grecco's
 * own NPC dialog and the LATAM Disco Hall's `disco-turntable` Room hotspot
 * (`main.ts`); Beystadium has no NPC launching it yet: #51 (Team Room 4 and
 * Michael) wires Michael's LET IT RIP button to
 * `minigameLauncher.launch('beystadium')`.
 */
export function createDefaultMinigameRegistry(): MinigameRegistry {
  return {
    'bug-squash': () => createBugSquashMinigame(),
    'pancake-flip': () => createPancakeFlip(),
    'coffee-rush': () => createCoffeeRush(),
    'snow-cone-stand': () => createSnowConeStand(),
    beystadium: () => createBeystadium(),
    'carnaval-parade': () => createCarnavalParade(),
  };
}
