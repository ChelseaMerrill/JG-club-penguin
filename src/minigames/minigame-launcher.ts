import { gameEvents, SPAWN_ROOM_ID, type RoomId } from '../contracts';
import type { MinigameId } from '../contracts/game-events';
import type { ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import type { RoomTitle } from '../ui/hud/room-titles';
import { createMinigameShell } from './minigame-shell';
import type { Minigame, MinigameRegistry } from './minigame';

export interface MinigameLauncherDeps {
  /** The `#ui` layer (`getUiLayer()`). */
  layer: HTMLElement;
  store: ProgressStore;
  /** The HUD's `OverlayManager` (`hud.overlays`). */
  overlays: OverlayManager;
  resolveRoomTitle: (roomId: RoomId) => RoomTitle;
  registry: MinigameRegistry;
}

export interface LaunchedMinigame {
  /** The `Minigame` instance this launch created. Exposed only for #37's
   *  own debug launcher (`dev-minigame-hook.ts`) to drive test-only hooks
   *  on the stub game; #36's NPC dialog calls `launch` and ignores this. */
  minigame: Minigame;
}

export interface MinigameLauncher {
  /** Launches `minigameId`'s shell (how-to-play -> play -> done) into
   *  `deps.layer`, registered with `deps.overlays` so only one overlay is
   *  open at a time. Throws if `minigameId` has no registered factory. */
  launch(minigameId: MinigameId): LaunchedMinigame;
}

/**
 * Builds the one launcher #36's NPC dialog (Minigame Interactions) and
 * #37's own debug hook (`?minigame=<id>`) both call to start a round.
 * Tracks `room:enter` itself so the shell's "QUIT TO <ROOM>" always reads
 * the Room the Player is actually in, the same way the HUD tracks it for
 * its own title (`hud.ts`).
 *
 * Producer: #37. Consumer: #36.
 */
export function createMinigameLauncher(deps: MinigameLauncherDeps): MinigameLauncher {
  let currentRoomId: RoomId = SPAWN_ROOM_ID;
  gameEvents.on('room:enter', ({ roomId }) => {
    currentRoomId = roomId;
  });

  function launch(minigameId: MinigameId): LaunchedMinigame {
    const factory = deps.registry[minigameId];
    if (!factory) {
      throw new Error(`No Minigame registered for "${minigameId}"`);
    }
    const minigame = factory();

    createMinigameShell({
      layer: deps.layer,
      overlays: deps.overlays,
      store: deps.store,
      roomTitle: deps.resolveRoomTitle(currentRoomId).title,
      game: minigame,
    });

    return { minigame };
  }

  return { launch };
}
