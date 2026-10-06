import { gameEvents, type MinigameId } from '../../contracts';
import { dialogLinePool, pickDialogLine } from '../../npcs/dialog-lines';
import { getNpcDefinition, type NpcDefinition } from '../../npcs/npcs';
import {
  QUEST_GIVER_BUTTON_LABEL,
  resolveQuestGiverResponse,
  type QuestGiverResponse,
} from '../../npcs/quest-giver';
import type { QuestStatus } from '../../quests/quest-engine';
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
  /** Starts a Quest from its giver's "Got any work for me?" (#144 D9). */
  startQuest: (questId: string) => void;
  /** Opens the Phishing Quiz from Anthony's TAKE THE QUIZ (#146). */
  startPhishingQuiz?: () => void;
}

/** What a quest giver's button reads about Quests (#144 D9). */
export interface NpcDialogQuests {
  /** The Quest's current status, or `undefined` when it isn't in this build or progress isn't loaded. */
  status: (questId: string) => QuestStatus | undefined;
  /** Whether the Quest has a registered starter (`quest-giver.ts`). */
  canStart: (questId: string) => boolean;
}

export interface NpcDialogDeps {
  overlays: OverlayManager;
  actions: NpcDialogActions;
  /** Omitted (tests, or before Quests are wired): every quest giver answers as if no Quest were connected. */
  quests?: NpcDialogQuests;
  /** Picks each dialog line (#144 D3); `Math.random` by default, injected by tests. */
  random?: () => number;
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
 * An `npc:arrived` while some *other* HUD overlay is already open (MENU, the
 * Map, the Penguin Creator, a Minigame, ...) is ignored outright rather than
 * opening the dialog over it (#36 round-2 review item 2b): clicking an NPC
 * queues a walk, and the Player pressing SNOWBALL/EMOTE/MAP/PENGUIN/MENU
 * before the Penguin arrives shouldn't have the dialog steal focus and close
 * that overlay out from under them on arrival (e.g. losing unsaved Penguin
 * Creator edits). `RoomScene.setAiming(true)` separately drops the pending
 * arrival callback outright for the Snowball case, which isn't a tracked HUD
 * overlay at all (#36 round-2 review item 2a).
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
  lineEl.setAttribute('aria-live', 'polite');
  const actionsEl = el('div', 'npc-dialog__actions');

  box.append(closeButton, nameEl, subtitleEl, titleEl, lineEl, actionsEl);
  panel.append(box);
  root.append(panel);

  /** The npcId the dialog is currently open for, or `null` while closed. */
  let openNpcId: string | null = null;
  /** Focus to restore once the dialog closes (#36 round-1 review item 9). */
  let previouslyFocused: HTMLElement | null = null;
  /**
   * The last line each NPC's dialog showed, so the next open picks a
   * different one (#144 D3). In memory for the page's lifetime only.
   */
  const lastLineByNpc = new Map<string, string>();

  function handleClose(): void {
    deps.overlays.close(NPC_DIALOG_OVERLAY_ID);
  }

  function close(): void {
    panel.hidden = true;
    const closedNpcId = openNpcId;
    openNpcId = null;
    // #113: a roaming NPC paused for this dialog resumes its loop.
    if (closedNpcId !== null) gameEvents.emit('npc:dialog-closed', { npcId: closedNpcId });
    const restoreTo = previouslyFocused;
    previouslyFocused = null;
    restoreTo?.focus();
  }

  /** What this appearance's "Got any work for me?" would answer, or `null` for no button (#144 D6). */
  function questGiverResponse(npc: NpcDefinition): QuestGiverResponse | null {
    const giver = npc.questGiver;
    if (giver === undefined) return null;
    const status = giver.questId === undefined ? undefined : deps.quests?.status(giver.questId);
    return resolveQuestGiverResponse(giver, status, (id) => deps.quests?.canStart(id) ?? false);
  }

  /**
   * Appends "Got any work for me?" after any existing buttons (#144 D7/D8),
   * when this appearance is a quest giver with something to say.
   */
  function appendQuestGiverButton(npc: NpcDefinition): void {
    if (questGiverResponse(npc) === null) return;
    actionsEl.append(
      actionButton('npc-dialog__button npc-dialog__button--quest', QUEST_GIVER_BUTTON_LABEL, () => {
        // Re-resolved on click: progress may have loaded since the dialog opened.
        const response = questGiverResponse(npc);
        if (response === null) return;
        if (response.kind === 'start') {
          deps.actions.startQuest(response.questId);
          handleClose();
          return;
        }
        lineEl.textContent = response.text;
      }),
    );
  }

  /** A fresh line for a line or stall NPC, never the one it showed last (#144 D3). */
  function nextLine(npc: NpcDefinition): string {
    const line = pickDialogLine(dialogLinePool(npc), lastLineByNpc.get(npc.id), deps.random);
    lastLineByNpc.set(npc.id, line);
    return line;
  }

  /** `line` is the text to show for a line or stall NPC; a Minigame NPC shows its trigger line. */
  function render(npc: NpcDefinition, line: string): void {
    nameEl.textContent = npc.name;

    actionsEl.replaceChildren();
    if (npc.dialog.kind === 'minigame') {
      const { minigameId, actionLabel, declineLabel, triggerLine, subtitle, declineLine } =
        npc.dialog;
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
        actionButton('npc-dialog__button', declineLabel, () => {
          // #181: an NPC with its own decline line (Ian's "Cool. Enjoy the
          // red build.") shows it in place of the trigger line instead of
          // closing outright; the dialog's own close button dismisses it.
          if (declineLine !== undefined) {
            lineEl.textContent = declineLine;
            return;
          }
          handleClose();
        }),
      );
    } else if (npc.dialog.kind === 'phishing-quiz') {
      // #146: the same trigger layout; the action opens the quiz. Closed
      // first, so the quiz can take the overlay slot.
      const { actionLabel, declineLabel, triggerLine, subtitle } = npc.dialog;
      subtitleEl.textContent = subtitle;
      subtitleEl.hidden = false;
      titleEl.hidden = true;
      lineEl.textContent = triggerLine;
      actionsEl.append(
        actionButton('npc-dialog__button npc-dialog__button--primary', actionLabel, () => {
          handleClose();
          deps.actions.startPhishingQuiz?.();
        }),
        actionButton('npc-dialog__button', declineLabel, handleClose),
      );
    } else {
      subtitleEl.hidden = true;
      titleEl.textContent = npc.title ?? '';
      titleEl.hidden = npc.title === null;
      lineEl.textContent = line;

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
    appendQuestGiverButton(npc);
  }

  /** The first action button when there is one, else the close button (#36 round-1 review item 9). */
  function firstFocusable(): HTMLButtonElement {
    return (actionsEl.querySelector('button') as HTMLButtonElement | null) ?? closeButton;
  }

  const unsubscribeArrived = gameEvents.on('npc:arrived', ({ npcId }) => {
    const current = deps.overlays.current();
    if (current !== null && current !== NPC_DIALOG_OVERLAY_ID) return;

    const npc = getNpcDefinition(npcId);
    if (!npc) return;
    // The Remote Lounge's JGers open their person card instead
    // (`src/ui/remote-lounge/remote-lounge.ts`).
    if (npc.dialog.kind === 'remote-card') return;

    const wasHidden = panel.hidden;
    // A repeated `npc:arrived` for the dialog already open re-renders with
    // the same line; only a fresh open picks a new one (#144 D3).
    const reopening = !wasHidden && openNpcId === npcId;
    const line = reopening ? (lastLineByNpc.get(npc.id) ?? nextLine(npc)) : nextLine(npc);
    render(npc, line);
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
