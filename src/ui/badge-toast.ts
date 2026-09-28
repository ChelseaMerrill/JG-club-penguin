import { gameEvents, type BadgeId } from '../contracts';
import { badgeDisplayName } from '../minigames/badge-names';
import { MINIGAME_RULES } from '../persistence/minigame-rules';

/**
 * True for a Badge whose award shows on a Minigame round's done screen:
 * one of `MINIGAME_RULES`' Badges (#27, and any Minigame added later).
 */
export function isDoneScreenBadge(badgeId: BadgeId): boolean {
  return Object.values(MINIGAME_RULES).some((rule) => rule.badgeId === badgeId);
}

export interface WireBadgeToastOptions {
  /** #138's Badge popup; every Badge that isn't a done-screen Badge goes here. */
  popup?: { show(badgeId: BadgeId): void };
}

/**
 * Announces every `badge:earned`, wherever the Player is (#42), by one rule
 * (#138 D13):
 * - a done-screen Badge (a Minigame's) keeps the text toast, alongside its
 *   done screen's own panel;
 * - every other Badge gets the Badge popup, with no toast.
 * Without a popup, every Badge gets the toast. The HUD's toast layer
 * (`hud.ts`) renders the toast. Returns an unsubscribe function.
 */
export function wireBadgeToast(options: WireBadgeToastOptions = {}): () => void {
  return gameEvents.on('badge:earned', ({ badgeId }) => {
    if (options.popup && !isDoneScreenBadge(badgeId)) {
      options.popup.show(badgeId);
      return;
    }
    gameEvents.emit('ui:toast', { message: `Badge unlocked: ${badgeDisplayName(badgeId)}` });
  });
}
