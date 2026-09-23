/**
 * Returns the DOM overlay layer that sits above the Phaser canvas.
 * UI overlays (login button, chat, dialogs) mount here.
 */
export function getUiLayer(): HTMLElement {
  const el = document.getElementById('ui');
  if (!el) {
    throw new Error('UI layer #ui is missing from index.html');
  }
  return el;
}
