import type { PenguinLook } from '../contracts';
import type { ProgressSnapshot, ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import type { PenguinCreator } from '../ui/penguin-creator';
import type { PenguinLoadError } from '../ui/penguin-load-error';
import { isNamedLook, validatePenguinName } from './look';

/** The Creator's id in the HUD's `OverlayManager`. */
export const PENGUIN_CREATOR_OVERLAY_ID = 'penguin-creator';

export interface PenguinEditorOptions {
  creator: Pick<PenguinCreator, 'open' | 'close' | 'setSaving' | 'showError'>;
  store: Pick<ProgressStore, 'loadAll' | 'saveLook'>;
  /** The HUD's `OverlayManager` (`hud.overlays`). */
  overlays: Pick<OverlayManager, 'open' | 'close'>;
  /**
   * The retryable "Couldn't load your Penguin" state (#164), shown in place
   * of the Creator when the sign-in load fails. Required, so every
   * construction site wires it.
   */
  loadError: Pick<PenguinLoadError, 'show' | 'hide' | 'setRetrying'>;
  /** The Player's current look: loaded on sign-in, or just saved. */
  onLookChanged: (look: PenguinLook) => void;
  /** The Player has a validly named Penguin and may enter the World (show the HUD). */
  onReady: () => void;
  /**
   * A load failure. The Player is held on the load-error state (#164)
   * instead of entering the World; `onReady` is not called until a later
   * load (TRY AGAIN) succeeds.
   */
  onError: (message: string) => void;
}

export interface PenguinEditor {
  playerSignedIn(): Promise<void>;
  playerSignedOut(): void;
  /** TRY AGAIN on the load-error state: reloads, and only a success moves on. */
  retry(): Promise<void>;
  /** The HUD's PENGUIN button (`ui:open-creator`). */
  edit(): void;
  cancel(): void;
  submit(look: PenguinLook): Promise<void>;
}

type LoadState = 'idle' | 'loading' | 'failed' | 'loaded';

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
 * HUD, as a dismissible overlay the `OverlayManager` can close.
 *
 * A load failure never opens the Creator (#164): the Player is held on the
 * retryable load-error state, and `retry()` (TRY AGAIN) reloads. Only a
 * load that succeeds decides what comes next, and `submit()` refuses to
 * save unless the current sign-in's load succeeded, so a failed load can
 * never lead to a new look being saved over an existing profile. Saving goes
 * through `ProgressStore.saveLook`, behind the editor's own name validation
 * as a backstop to the Creator's own disabled-button rule. Signing in as a
 * different Player closes any Creator or load-error state already open
 * first. A load, retry or save that finishes after the Player signed out (or
 * signed in again) is dropped.
 */
export function createPenguinEditor(options: PenguinEditorOptions): PenguinEditor {
  const { creator, store, overlays, loadError, onLookChanged, onReady, onError } = options;
  let signedIn = false;
  let look: PenguinLook | null = null;
  let loadState: LoadState = 'idle';
  let generation = 0;
  // The generation a TRY AGAIN retry is in flight for (#164 RT W1), or null.
  // Generation-scoped so a stale retry (one started before a sign-out or an
  // account switch) can never clear, or be mistaken for, the next sign-in's.
  let retryGeneration: number | null = null;
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

  /** A successful load in the current generation: the only way on (#164). */
  function applyLoaded(snapshot: ProgressSnapshot): void {
    loadState = 'loaded';
    if (!isCompleteProfile(snapshot)) {
      openCreator(snapshot.look, false);
      return;
    }
    look = snapshot.look;
    onLookChanged(look);
    onReady();
  }

  /** A failed load in the current generation: hold on the load-error state, never the Creator. */
  function applyFailed(error: unknown): void {
    loadState = 'failed';
    const detail = messageOf(error);
    onError(`Couldn't load your Penguin: ${detail}`);
    loadError.show(detail);
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
    look = next;
    onLookChanged(next);
    closeCreator();
    if (firstSave) onReady();
  }

  return {
    async playerSignedIn() {
      // R2-3: an account switch closes any Creator (or #164 load-error
      // state) already open first, before the next Player's load.
      closeCreator();
      loadError.setRetrying(false);
      loadError.hide();
      signedIn = true;
      look = null;
      loadState = 'loading';
      retryGeneration = null;
      const loadGeneration = ++generation;
      let snapshot: ProgressSnapshot;
      try {
        snapshot = await store.loadAll();
      } catch (error) {
        if (loadGeneration !== generation) return;
        applyFailed(error);
        return;
      }
      if (loadGeneration !== generation) return;
      applyLoaded(snapshot);
    },
    playerSignedOut() {
      signedIn = false;
      look = null;
      loadState = 'idle';
      retryGeneration = null;
      generation += 1;
      loadError.setRetrying(false);
      loadError.hide();
      closeCreator();
    },
    async retry() {
      if (!signedIn || loadState !== 'failed' || retryGeneration === generation) return;
      const myGeneration = generation;
      retryGeneration = myGeneration;
      loadError.setRetrying(true);
      let snapshot: ProgressSnapshot;
      try {
        snapshot = await store.loadAll();
      } catch (error) {
        // A stale retry (a sign-out or account switch meanwhile) touches
        // nothing, not even `retryGeneration` or the retrying UI (#164 RT W1).
        if (myGeneration !== generation) return;
        retryGeneration = null;
        loadError.setRetrying(false);
        applyFailed(error);
        return;
      }
      if (myGeneration !== generation) return;
      retryGeneration = null;
      loadError.setRetrying(false);
      loadError.hide();
      applyLoaded(snapshot);
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
      // #164: only after the current sign-in's load succeeded. A load that is
      // still in flight, or failed, can never lead to a save.
      if (!signedIn || loadState !== 'loaded') return;
      // Belt and braces: the Creator already disables WADDLE IN/Save for an
      // invalid name, but the editor refuses one too (#75).
      const validation = validatePenguinName(next.name);
      if (!validation.ok) return;
      await saveAndEnter({ ...next, name: validation.name }, generation);
    },
  };
}
