import { gameEvents, type MinigameId } from '../../contracts';
import { getNpcDefinition, type NpcDefinition } from '../../npcs/npcs';
import type { OverlayManager } from '../hud/overlay-manager';
// Styles live in the shared `src/style.css`'s `.npc-dialog` block (#36 D4),
// not a co-located stylesheet: `main.ts` already imports `./style.css` once.

/** The id `createNpcDialog` registers with `hud.overlays` (#36 D4). */
export const NPC_DIALOG_OVERLAY_ID = 'npc-dialog';

/** The static id `.npc-dialog__name` renders under, for `aria-labelledby`. */
const NAME_ELEMENT_ID = 'npc-dialog-name';

export interface NpcDialogActions {
  /** Wired to the real `minigameLauncher.launch` in `main.ts` (#37 is on `main`). */
  launchMinigame: (minigameId: MinigameId) => void;
  /** Wired to #40's real Market panel (`main.ts`); still logged to `window.__roomDebug` (#36 round-1). */
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
 * the same time as MENU, the Map, the Creator or a Minigame. Escape, the
 * close button, and a `room:leave` (#36 round-1 review item 7 -- a Room
 * change shouldn't leave a stale NPC's dialog open over the next Room) all
 * close it via the overlay manager, matching every other overlay in this
 * codebase.
 *
 * Emits `npc:talked { npcId }` exactly once per dialog opened: a repeated
 * `npc:arrived` for the NPC the dialog is already showing only re-renders
 * (idempotent -- e.g. clicking an NPC again while already standing on its
 * interaction tile, #14's own already-arrived case), it does not emit again;
 * closing and reopening (even for the same NPC) does.
 *
 * Accessibility (#36 round-1 review item 9): the panel is `role="dialog"`
 * with `aria-modal="true"` and `aria-labelledby` pointing at the name
 * element; opening moves focus to its first button (an action button when
 * there is one, else the close button), and closing restores focus to
 * whatever had it beforehand.
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
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', NAME_ELEMENT_ID);

  const closeButton = actionButton('npc-dialog__close', '✕', handleClose);
  closeButton.setAttribute('aria-label', 'Close');
  const nameEl = el('div', 'npc-dialog__name');
  nameEl.id = NAME_ELEMENT_ID;
  const subtitleEl = el('div', 'npc-dialog__subtitle');
  const titleEl = el('div', 'npc-dialog__title');
  const lineEl = el('div', 'npc-dialog__line');
  const actionsEl = el('div', 'npc-dialog__actions');

  box.append(closeButton, nameEl, subtitleEl, titleEl, lineEl, actionsEl);
  panel.append(box);
  root.append(panel);

  /** The npcId the dialog is currently open for, or `null` while closed. */
  let openNpcId: string | null = null;
  /** Focus to restore once the dialog closes (#36 round-1 review item 9). */
  let previouslyFocused: HTMLElement | null = null;

  function handleClose(): void {
    deps.overlays.close(NPC_DIALOG_OVERLAY_ID);
  }

  function close(): void {
    panel.hidden = true;
    openNpcId = null;
    const restoreTo = previouslyFocused;
    previouslyFocused = null;
    restoreTo?.focus();
  }

  function render(npc: NpcDefinition): void {
    nameEl.textContent = npc.name;

    actionsEl.replaceChildren();
    if (npc.dialog.kind === 'minigame') {
      const { minigameId, actionLabel, declineLabel, triggerLine, subtitle } = npc.dialog;
      // The minigame trigger design shows one "ROOM · ROLE" badge next to the
      // name instead of the plain title line (#36 round-1 review item 4).
      subtitleEl.textContent = subtitle;
      subtitleEl.hidden = false;
      titleEl.hidden = true;
      lineEl.textContent = triggerLine;
      actionsEl.append(
        actionButton('npc-dialog__button npc-dialog__button--primary', actionLabel, () => {
          deps.actions.launchMinigame(minigameId);
          handleClose();
        }),
        actionButton('npc-dialog__button', declineLabel, handleClose),
      );
    } else {
      subtitleEl.hidden = true;
      titleEl.textContent = npc.title ?? '';
      titleEl.hidden = npc.title === null;
      lineEl.textContent = npc.dialogLine;

      if (npc.dialog.kind === 'stall') {
        const { stallId } = npc.dialog;
        actionsEl.append(
          actionButton(
            'npc-dialog__button npc-dialog__button--primary',
            'BROWSE IGLOO GEAR',
            () => {
              deps.actions.openStall(stallId);
              handleClose();
            },
          ),
        );
      }
      // 'line': no extra action buttons; the panel's own close button covers it.
    }
  }

  /** The first action button when there is one, else the close button (#36 round-1 review item 9). */
  function firstFocusable(): HTMLButtonElement {
    return (actionsEl.querySelector('button') as HTMLButtonElement | null) ?? closeButton;
  }

  const unsubscribeArrived = gameEvents.on('npc:arrived', ({ npcId }) => {
    const npc = getNpcDefinition(npcId);
    if (!npc) return;

    render(npc);
    const wasHidden = panel.hidden;
    panel.hidden = false;
    deps.overlays.open(NPC_DIALOG_OVERLAY_ID, close);

    if (wasHidden) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      firstFocusable().focus();
    }

    if (openNpcId === npcId) return;
    openNpcId = npcId;
    gameEvents.emit('npc:talked', { npcId });
  });

  // A Room change shouldn't leave a previous Room's NPC dialog open over the
  // new one (#36 round-1 review item 7).
  const unsubscribeRoomLeave = gameEvents.on('room:leave', () => {
    deps.overlays.close(NPC_DIALOG_OVERLAY_ID);
  });

  return {
    destroy() {
      unsubscribeArrived();
      unsubscribeRoomLeave();
      panel.remove();
    },
  };
}
