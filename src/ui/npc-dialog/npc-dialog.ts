import { gameEvents, type MinigameId } from '../../contracts';
import { getNpcDefinition, type NpcDefinition } from '../../npcs/npcs';
import type { OverlayManager } from '../hud/overlay-manager';
// Styles live in the shared `src/style.css`'s `.npc-dialog` block (#36 D4),
// not a co-located stylesheet: `main.ts` already imports `./style.css` once.

/** The id `createNpcDialog` registers with `hud.overlays` (#36 D4). */
export const NPC_DIALOG_OVERLAY_ID = 'npc-dialog';

export interface NpcDialogActions {
  /** Wired to the real `minigameLauncher.launch` in `main.ts` (#37 is on `main`). */
  launchMinigame: (minigameId: MinigameId) => void;
  /** A logged no-op in `main.ts` until #40 (the Igloo Gear stall) lands. */
  openStall: (stallId: string) => void;
}

export interface NpcDialogDeps {
  overlays: OverlayManager;
  actions: NpcDialogActions;
}

export interface NpcDialog {
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function actionButton(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Mounts the NPC dialog panel (#36 D4) into `root` (the `#ui` layer). It
 * opens on `gameEvents`' `npc:arrived { npcId }` (fired by #14's `RoomScene`
 * once the local Penguin reaches an NPC's interaction tile) and registers
 * with `deps.overlays` under `NPC_DIALOG_OVERLAY_ID`, so it's never open at
 * the same time as MENU, the Map, the Creator or a Minigame. Escape and the
 * close button both close it via the overlay manager, matching every other
 * overlay in this codebase.
 *
 * Emits `npc:talked { npcId }` exactly once per dialog *opened*: a repeated
 * `npc:arrived` for the NPC the dialog is already showing only re-renders
 * (idempotent -- e.g. clicking an NPC again while already standing on its
 * interaction tile, #14's own already-arrived case), it does not emit again;
 * closing and reopening (even for the same NPC) does.
 *
 * Unknown to `NPCS` (`getNpcDefinition` returns `undefined`) is ignored
 * rather than showing an empty panel: this should never happen once #36
 * covers every Room slot id, but a slot referencing a mistyped/removed NPC
 * id is safer silent than crashing the dialog.
 */
export function createNpcDialog(root: HTMLElement, deps: NpcDialogDeps): NpcDialog {
  const panel = el('div', 'npc-dialog');
  panel.hidden = true;

  const box = el('div', 'npc-dialog__panel');
  const closeButton = actionButton('npc-dialog__close', '✕', handleClose);
  closeButton.setAttribute('aria-label', 'Close');
  const nameEl = el('div', 'npc-dialog__name');
  const titleEl = el('div', 'npc-dialog__title');
  const lineEl = el('div', 'npc-dialog__line');
  const actionsEl = el('div', 'npc-dialog__actions');

  box.append(closeButton, nameEl, titleEl, lineEl, actionsEl);
  panel.append(box);
  root.append(panel);

  /** The npcId the dialog is currently open for, or `null` while closed. */
  let openNpcId: string | null = null;

  function handleClose(): void {
    deps.overlays.close(NPC_DIALOG_OVERLAY_ID);
  }

  function close(): void {
    panel.hidden = true;
    openNpcId = null;
  }

  function render(npc: NpcDefinition): void {
    nameEl.textContent = npc.name;
    titleEl.textContent = npc.title ?? '';
    titleEl.hidden = npc.title === null;
    lineEl.textContent = npc.idleLine;

    actionsEl.replaceChildren();
    if (npc.dialog.kind === 'minigame') {
      const { minigameId, actionLabel, declineLabel } = npc.dialog;
      actionsEl.append(
        actionButton('npc-dialog__button npc-dialog__button--primary', actionLabel, () => {
          deps.actions.launchMinigame(minigameId);
          handleClose();
        }),
        actionButton('npc-dialog__button', declineLabel, handleClose),
      );
    } else if (npc.dialog.kind === 'stall') {
      const { stallId } = npc.dialog;
      actionsEl.append(
        actionButton('npc-dialog__button npc-dialog__button--primary', 'BROWSE IGLOO GEAR', () => {
          deps.actions.openStall(stallId);
          handleClose();
        }),
      );
    }
    // 'line': no extra action buttons; the panel's own close button covers it.
  }

  const unsubscribeArrived = gameEvents.on('npc:arrived', ({ npcId }) => {
    const npc = getNpcDefinition(npcId);
    if (!npc) return;

    render(npc);
    panel.hidden = false;
    deps.overlays.open(NPC_DIALOG_OVERLAY_ID, close);

    if (openNpcId === npcId) return;
    openNpcId = npcId;
    gameEvents.emit('npc:talked', { npcId });
  });

  return {
    destroy() {
      unsubscribeArrived();
      panel.remove();
    },
  };
}
