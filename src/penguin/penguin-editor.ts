import type { Player } from '../auth/player';
import type { PenguinCreator } from '../ui/penguin-creator';
import { defaultAppearanceFor, type PenguinAppearance } from './appearance';

export interface PenguinEditorOptions {
  creator: Pick<PenguinCreator, 'open' | 'close' | 'setSaving' | 'showError'>;
  save: (playerId: string, appearance: PenguinAppearance) => Promise<{ error: string | null }>;
  /** Called with the updated Player once a save succeeds. */
  onPlayerChanged: (player: Player) => void;
}

export interface PenguinEditor {
  playerSignedIn(player: Player): void;
  playerSignedOut(): void;
  /** The badge's "Edit Penguin" button. */
  edit(): void;
  cancel(): void;
  submit(appearance: PenguinAppearance): Promise<void>;
}

/**
 * When the Penguin Creator shows and what happens on WADDLE IN. A Player with
 * no saved Penguin gets the creator on sign-in and can't dismiss it; anyone
 * can reopen it later from the badge. A save that finishes after the Player
 * signed out (or another Player signed in) is dropped.
 */
export function createPenguinEditor(options: PenguinEditorOptions): PenguinEditor {
  const { creator, save, onPlayerChanged } = options;
  let player: Player | null = null;
  let generation = 0;

  return {
    playerSignedIn(next) {
      player = next;
      generation += 1;
      if (next.penguin) {
        creator.close();
      } else {
        creator.open(defaultAppearanceFor(next.displayName), { dismissible: false });
      }
    },
    playerSignedOut() {
      player = null;
      generation += 1;
      creator.close();
    },
    edit() {
      if (!player) return;
      creator.open(player.penguin ?? defaultAppearanceFor(player.displayName), {
        dismissible: player.penguin !== null,
      });
    },
    cancel() {
      if (player?.penguin) creator.close();
    },
    async submit(appearance) {
      if (!player) return;
      const target = player;
      const saveGeneration = generation;
      creator.setSaving(true);
      const { error } = await save(target.id, appearance);
      if (saveGeneration !== generation) return;
      creator.setSaving(false);
      if (error) {
        creator.showError(`Couldn't save your Penguin: ${error}`);
        return;
      }
      player = { ...target, penguin: appearance, penguinColor: appearance.body };
      onPlayerChanged(player);
      creator.close();
    },
  };
}
