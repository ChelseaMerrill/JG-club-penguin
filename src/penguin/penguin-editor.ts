import { DEFAULT_LOOK, type PenguinLook } from '../contracts';
import type { ProgressSnapshot, ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import type { PenguinCreator } from '../ui/penguin-creator';
import { isNamedLook, validatePenguinName } from './look';

/** The Creator's id in the HUD's `OverlayManager`. */
export const PENGUIN_CREATOR_OVERLAY_ID = 'penguin-creator';

export interface PenguinEditorOptions {
  creator: Pick<PenguinCreator, 'open' | 'close' | 'setSaving' | 'showError'>;
  store: Pick<ProgressStore, 'loadAll' | 'saveLook'>;
  /** The HUD's `OverlayManager` (`hud.overlays`). */
  overlays: Pick<OverlayManager, 'open' | 'close'>;
  /** The Player's current look: loaded on sign-in, or just saved. */
  onLookChanged: (look: PenguinLook) => void;
  /** The Player has a validly named Penguin and may enter the World (show the HUD). */
  onReady: () => void;
  /**
   * A load failure. The Player is held on the non-dismissible Creator
   * (seeded with `DEFAULT_LOOK`) instead of entering the World; `onReady`
   * is not called until a later save succeeds (#75).
   */
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

/** A profile the Player can enter the World with: created, and validly named (#75). */
function isCompleteProfile(snapshot: ProgressSnapshot): boolean {
  return snapshot.profileCreatedAt !== null && isNamedLook(snapshot.look);
}

/**
 * The name gate (#75): the Penguin Creator is the only way into the World.
 * On sign-in it loads saved progress: a Player who has never completed the
 * Creator (`profileCreatedAt` null) or whose saved look isn't validly named
 * gets the non-dismissible Creator and does not enter the World until they
 * save a valid name; anyone else goes straight in and can reopen it from the
 * HUD, as a dismissible overlay the `OverlayManager` can close. A load
 * failure also holds the Player on the non-dismissible Creator (seeded with
 * `DEFAULT_LOOK`) rather than letting them in; submitting from there retries
 * the load first, in case a profile was created (or completed) elsewhere in
 * the meantime, and only falls back to saving the submitted look if that
 * retry still finds nothing usable. Saving goes through
 * `ProgressStore.saveLook`, behind the editor's own name validation as a
 * backstop to the Creator's own disabled-button rule. Signing in as a
 * different Player closes any Creator already open first. A load or save
 * that finishes after the Player signed out (or signed in again) is dropped.
 */
export function createPenguinEditor(options: PenguinEditorOptions): PenguinEditor {
  const { creator, store, overlays, onLookChanged, onReady, onError } = options;
  let signedIn = false;
  let look: PenguinLook | null = null;
  let loadFailed = false;
  let generation = 0;
  // Guards the `loadFailed` retry in `submit()` (review round 1): a second
  // submit while the reload is in flight is a no-op rather than racing a
  // second `store.loadAll()`/save.
  let retryInFlight = false;
  // Tracks whether *this* editor currently has the Creator open, so
  // `playerSignedIn`'s account-switch close (#75 R2-3) is a no-op when there
  // is nothing to close, rather than calling `creator.close()` on every
  // sign-in regardless.
  let creatorOpen = false;

  function openCreator(initialLook: PenguinLook, dismissible: boolean): void {
    creatorOpen = true;
    creator.open(initialLook, { dismissible });
  }

  function closeCreator(): void {
    if (!creatorOpen) return;
    creatorOpen = false;
    overlays.close(PENGUIN_CREATOR_OVERLAY_ID);
    creator.close();
  }

  /**
   * The `OverlayManager`'s own close callback (Escape, or another overlay
   * opening): it has already dropped the overlay, so this only syncs local
   * state and the Creator's own DOM.
   */
  function handleOverlayClosed(): void {
    creatorOpen = false;
    creator.close();
  }

  /** Runs the normal save path: validate has already passed by here. */
  async function saveAndEnter(next: PenguinLook, saveGeneration: number): Promise<void> {
    const firstSave = look === null;
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
    loadFailed = false;
    look = next;
    onLookChanged(next);
    closeCreator();
    if (firstSave) onReady();
  }

  return {
    async playerSignedIn() {
      // R2-3: an account switch closes any Creator already open first.
      closeCreator();
      signedIn = true;
      look = null;
      loadFailed = false;
      retryInFlight = false;
      const loadGeneration = ++generation;
      let snapshot: ProgressSnapshot;
      try {
        snapshot = await store.loadAll();
      } catch (error) {
        if (loadGeneration !== generation) return;
        loadFailed = true;
        const message = `Couldn't load your Penguin: ${messageOf(error)}`;
        onError(message);
        openCreator(DEFAULT_LOOK, false);
        creator.showError(message);
        return;
      }
      if (loadGeneration !== generation) return;
      if (!isCompleteProfile(snapshot)) {
        openCreator(snapshot.look, false);
        return;
      }
      look = snapshot.look;
      onLookChanged(look);
      onReady();
    },
    playerSignedOut() {
      signedIn = false;
      look = null;
      loadFailed = false;
      retryInFlight = false;
      generation += 1;
      closeCreator();
    },
    edit() {
      if (!signedIn || !look) return;
      openCreator(look, true);
      overlays.open(PENGUIN_CREATOR_OVERLAY_ID, handleOverlayClosed);
    },
    cancel() {
      if (look) closeCreator();
    },
    async submit(next) {
      if (!signedIn) return;
      // Belt and braces: the Creator already disables WADDLE IN/Save for an
      // invalid name, but the editor refuses one too (#75).
      const validation = validatePenguinName(next.name);
      if (!validation.ok) return;
      const cleanLook = { ...next, name: validation.name };
      const saveGeneration = generation;

      if (loadFailed) {
        // A second submit while this reload is in flight is a no-op (review
        // round 1): otherwise two quick submits could each race their own
        // reload and save.
        if (retryInFlight) return;
        retryInFlight = true;
        creator.setSaving(true);
        let reloaded: ProgressSnapshot | null;
        try {
          reloaded = await store.loadAll();
        } catch {
          reloaded = null;
        }
        if (saveGeneration !== generation) {
          retryInFlight = false;
          creator.setSaving(false);
          return;
        }
        if (reloaded && isCompleteProfile(reloaded)) {
          retryInFlight = false;
          creator.setSaving(false);
          loadFailed = false;
          look = reloaded.look;
          onLookChanged(look);
          closeCreator();
          onReady();
          return;
        }
        retryInFlight = false;
        // Still nothing usable: fall through and save the submitted look.
      }

      await saveAndEnter(cleanLook, saveGeneration);
    },
  };
}
