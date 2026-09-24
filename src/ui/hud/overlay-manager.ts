/**
 * Tracks which single HUD overlay is open at a time (MENU now; the Map and
 * the Penguin Creator register their own overlays once #33/#35 land).
 * Opening a new overlay closes whichever one is already open first, and
 * Escape closes whichever one is currently open. One `createOverlayManager()`
 * per `createHud()` instance; `destroy()` removes its own `keydown` listener.
 */
export interface OverlayManager {
  /** Opens `id`, closing any other open overlay first. Re-opening the
   *  already-open `id` is a no-op: it does not close and reopen itself. */
  open(id: string, onClose: () => void): void;
  /** Closes `id` if it's the one currently open. A no-op otherwise. */
  close(id: string): void;
  /** The id of the currently open overlay, or `null` when none is open. */
  current(): string | null;
  /** Removes the `window` `keydown` listener this manager installed. */
  destroy(): void;
}

export function createOverlayManager(): OverlayManager {
  let openOverlay: { id: string; onClose: () => void } | null = null;

  function closeCurrent(): void {
    if (!openOverlay) return;
    const { onClose } = openOverlay;
    openOverlay = null;
    onClose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeCurrent();
  }

  window.addEventListener('keydown', handleKeydown);

  return {
    open(id, onClose) {
      if (openOverlay?.id === id) return;
      closeCurrent();
      openOverlay = { id, onClose };
    },
    close(id) {
      if (openOverlay?.id === id) closeCurrent();
    },
    current() {
      return openOverlay?.id ?? null;
    },
    destroy() {
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
