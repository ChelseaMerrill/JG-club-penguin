/** Whether a Minigame overlay is currently mounted. `createMinigameShell`
 *  sets this on mount and clears it on teardown (finish or quit). */
let open = false;

/**
 * True while a Minigame overlay is open. Producer: `minigame-shell.ts`.
 * Consumer: #14's movement code, so a click during a Minigame never moves
 * the Penguin (the overlay already blocks the click from reaching the
 * canvas; this is the non-DOM check for code that isn't itself a click
 * handler).
 */
export function isMinigameOpen(): boolean {
  return open;
}

/** Internal: `minigame-shell.ts` only. */
export function setMinigameOpen(value: boolean): void {
  open = value;
}
