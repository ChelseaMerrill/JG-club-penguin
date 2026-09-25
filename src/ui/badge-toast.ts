import { gameEvents } from '../contracts';
import { badgeDisplayName } from '../minigames/badge-names';

/**
 * Bridges `badge:earned` to `ui:toast` (#42): "Toast on badge:earned
 * wherever the Player is" — the HUD's own toast layer (`hud.ts`) is what
 * actually renders it, so this shows regardless of which Room the Player is
 * in or which overlay (if any) is open. Returns an unsubscribe function.
 */
export function wireBadgeToast(): () => void {
  return gameEvents.on('badge:earned', ({ badgeId }) => {
    gameEvents.emit('ui:toast', { message: `Badge unlocked: ${badgeDisplayName(badgeId)}` });
  });
}
