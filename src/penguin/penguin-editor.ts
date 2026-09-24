import type { PenguinLook } from '../contracts';
import type { ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import type { PenguinCreator } from '../ui/penguin-creator';

/** The Creator's id in the HUD's `OverlayManager`. */
export const PENGUIN_CREATOR_OVERLAY_ID = 'penguin-creator';

export interface PenguinEditorOptions {
  creator: Pick<PenguinCreator, 'open' | 'close' | 'setSaving' | 'showError'>;
  store: Pick<ProgressStore, 'loadAll' | 'saveLook'>;
  /** The HUD's `OverlayManager` (`hud.overlays`). */
  overlays: Pick<OverlayManager, 'open' | 'close'>;
  /** The Player's current look: loaded on sign-in, or just saved. */
  onLookChanged: (look: PenguinLook) => void;
  /** The Player has a Penguin and may enter the World (show the HUD). */
  onReady: () => void;
  /** A load failure; the Player still enters the World with the look they have. */
  onError: (message: string) => void;
}

export interface PenguinEditor {
  playerSignedIn(): Promise<void>;
  playerSignedOut(): void;
  /** The HUD's PENGUIN button (`ui:open-creator`). */
  edit(): void;
  cancel(): void;
  submit(look: PenguinLook): Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * When the Penguin Creator shows and what happens on WADDLE IN (#35). On
 * sign-in it loads saved progress: a Player who has never completed the
 * Creator (`profileCreatedAt` null) gets it before entering the World and
 * can't dismiss it; anyone else goes straight in and can reopen it from the
 * HUD, as an overlay the `OverlayManager` can close. Saving goes through
 * `ProgressStore.saveLook`. A load or save that finishes after the Player
 * signed out (or signed in again) is dropped.
 */
export function createPenguinEditor(options: PenguinEditorOptions): PenguinEditor {
  const { creator, store, overlays, onLookChanged, onReady, onError } = options;
  let signedIn = false;
  let look: PenguinLook | null = null;
  let generation = 0;

  function closeCreator(): void {
    overlays.close(PENGUIN_CREATOR_OVERLAY_ID);
    creator.close();
  }

  return {
    async playerSignedIn() {
      signedIn = true;
      look = null;
      const loadGeneration = ++generation;
      let snapshot;
      try {
        snapshot = await store.loadAll();
      } catch (error) {
        if (loadGeneration !== generation) return;
        onError(`Couldn't load your Penguin: ${messageOf(error)}`);
        onReady();
        return;
      }
      if (loadGeneration !== generation) return;
      if (snapshot.profileCreatedAt === null) {
        creator.open(snapshot.look, { dismissible: false });
        return;
      }
      look = snapshot.look;
      onLookChanged(look);
      onReady();
    },
    playerSignedOut() {
      signedIn = false;
      look = null;
      generation += 1;
      closeCreator();
    },
    edit() {
      if (!signedIn || !look) return;
      creator.open(look, { dismissible: true });
      overlays.open(PENGUIN_CREATOR_OVERLAY_ID, () => creator.close());
    },
    cancel() {
      if (look) closeCreator();
    },
    async submit(next) {
      if (!signedIn) return;
      const firstSave = look === null;
      const saveGeneration = generation;
      creator.setSaving(true);
      try {
        await store.saveLook(next);
      } catch (error) {
        if (saveGeneration !== generation) return;
        creator.setSaving(false);
        creator.showError(`Couldn't save your Penguin: ${messageOf(error)}`);
        return;
      }
      if (saveGeneration !== generation) return;
      creator.setSaving(false);
      look = next;
      onLookChanged(next);
      closeCreator();
      if (firstSave) onReady();
    },
  };
}
