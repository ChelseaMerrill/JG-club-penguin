/** Derives a Penguin's initial look from its owning Player. */
import { DEFAULT_PENGUIN_LOOK } from '../contracts/penguin';
import type { PenguinLook } from '../contracts/penguin';
import type { Player } from '../auth/player';

const MAX_NAME_LENGTH = 40;

export function lookFromPlayer(player: Player): PenguinLook {
  return {
    ...DEFAULT_PENGUIN_LOOK,
    name: player.displayName.slice(0, MAX_NAME_LENGTH),
    body: player.penguinColor,
  };
}
