// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../../contracts';
import { createOverlayManager, type OverlayManager } from '../hud/overlay-manager';
import { dialogLinePool } from '../../npcs/dialog-lines';
import { NPCS } from '../../npcs/npcs';
import type { QuestStatus } from '../../quests/quest-engine';
import {
  createNpcDialog,
  NPC_DIALOG_OVERLAY_ID,
  type NpcDialog,
  type NpcDialogQuests,
} from './npc-dialog';

let dialog: NpcDialog | undefined;
let overlays: OverlayManager | undefined;

/**
 * `random` defaults to always 0, so a fresh dialog shows the first line of
 * its pool: #36's single `dialogLine` (`dialogLines[0]`), usually the
 * character sheet's quote, otherwise the `humans.js` `line`.
 */
function setup(options: { random?: () => number; quests?: NpcDialogQuests } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  overlays = createOverlayManager();
  const launchMinigame = vi.fn();
  const openStall = vi.fn();
  const startQuest = vi.fn();
  dialog = createNpcDialog(root, {
    overlays,
    actions: { launchMinigame, openStall, startQuest },
    quests: options.quests,
    random: options.random ?? (() => 0),
  });
  return { root, launchMinigame, openStall, startQuest };
}

function lineText(root: HTMLElement): string | null | undefined {
  return root.querySelector('.npc-dialog__line')?.textContent;
}

function questButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector('.npc-dialog__button--quest');
}

function panel(root: HTMLElement): HTMLElement {
  return root.querySelector('.npc-dialog') as HTMLElement;
}

function box(root: HTMLElement): HTMLElement {
  return root.querySelector('.npc-dialog__panel') as HTMLElement;
}

afterEach(() => {
  dialog?.destroy();
  overlays?.destroy();
  dialog = undefined;
  overlays = undefined;
  document.body.innerHTML = '';
});

describe('createNpcDialog', () => {
  it('is hidden until an npc:arrived event names a known NPC', () => {
    const { root } = setup();
    expect(panel(root).hidden).toBe(true);
  });

  it('opens on npc:arrived, showing the name, title and dialog line for a plain-line NPC', () => {
    const { root } = setup();

    gameEvents.emit('npc:arrived', { npcId: 'steven' });

    expect(panel(root).hidden).toBe(false);
    expect(overlays!.current()).toBe(NPC_DIALOG_OVERLAY_ID);
    expect(root.querySelector('.npc-dialog__name')?.textContent).toBe('Steven Zgaljic');
    expect(root.querySelector('.npc-dialog__title')?.textContent).toBe('CTO');
    expect((root.querySelector('.npc-dialog__title') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('.npc-dialog__line')?.textContent).toBe(
      'Architecture question. Ready?',
    );
    expect((root.querySelector('.npc-dialog__subtitle') as HTMLElement).hidden).toBe(true);
  });

  it("shows Ian's trigger design quote and DEV PIT · VP OF ENGINEERING subtitle instead of the plain title", () => {
    const { root } = setup();

    gameEvents.emit('npc:arrived', { npcId: 'ian' });

    expect(root.querySelector('.npc-dialog__name')?.textContent).toBe('Ian Ballard');
    expect((root.querySelector('.npc-dialog__title') as HTMLElement).hidden).toBe(true);
    const subtitleEl = root.querySelector('.npc-dialog__subtitle') as HTMLElement;
    expect(subtitleEl.hidden).toBe(false);
    expect(subtitleEl.textContent).toBe('DEV PIT · VP OF ENGINEERING');
    expect(root.querySelector('.npc-dialog__line')?.textContent).toBe(
      "CI is red. Something's crawling through the test suite and I've got a 2 o'clock. Grab the hammer, squash what you find. 500 points and I'll put you on the Exterminator wall.",
    );
  });

  it('shows no title element content when the NPC has none', () => {
    const { root } = setup();

    // Chelsea Merrill's title is null ("TITLE TBD" on design/Characters.dc.html's footnote).
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    // jon has a title, so switch to one that doesn't:
    gameEvents.emit('npc:arrived', { npcId: 'ashley' });

    const titleEl = root.querySelector('.npc-dialog__title') as HTMLElement;
    expect(titleEl.hidden).toBe(true);
  });

  it('emits npc:talked exactly once per dialog opened: open, close, reopen = two emits, no emit on re-render', () => {
    const { root } = setup();
    const talked = vi.fn();
    const unsubscribe = gameEvents.on('npc:talked', talked);

    gameEvents.emit('npc:arrived', { npcId: 'darrin' });
    expect(talked).toHaveBeenCalledTimes(1);
    expect(talked).toHaveBeenCalledWith({ npcId: 'darrin' });

    // Re-render while already open for the same NPC (e.g. a duplicate
    // arrival) must not emit a second time.
    gameEvents.emit('npc:arrived', { npcId: 'darrin' });
    expect(talked).toHaveBeenCalledTimes(1);

    overlays!.close(NPC_DIALOG_OVERLAY_ID);
    expect(panel(root).hidden).toBe(true);

    gameEvents.emit('npc:arrived', { npcId: 'darrin' });
    expect(talked).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("Ian's buttons: GRAB THE HAMMER launches bug-squash and closes; NOT MY TICKET shows his decline line and keeps the dialog open (#181)", () => {
    const { root, launchMinigame } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'ian' });

    const grabButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'GRAB THE HAMMER',
    ) as HTMLButtonElement;
    expect(grabButton).toBeDefined();
    grabButton.click();

    expect(launchMinigame).toHaveBeenCalledWith('bug-squash');
    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBeNull();

    gameEvents.emit('npc:arrived', { npcId: 'ian' });
    const declineButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'NOT MY TICKET',
    ) as HTMLButtonElement;
    declineButton.click();

    expect(lineText(root)).toBe('Cool. Enjoy the red build.');
    expect(panel(root).hidden).toBe(false);
    expect(overlays!.current()).toBe(NPC_DIALOG_OVERLAY_ID);

    (root.querySelector('.npc-dialog__close') as HTMLButtonElement).click();
    expect(panel(root).hidden).toBe(true);
  });

  it("Chelsea's buttons: GRAB THE SPATULA launches pancake-flip; I BURN TOAST just closes", () => {
    const { root, launchMinigame } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'chelsea' });

    expect(root.querySelector('.npc-dialog__subtitle')?.textContent).toBe(
      'THE MELT · PANCAKE FLIP',
    );

    const grabButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'GRAB THE SPATULA',
    ) as HTMLButtonElement;
    grabButton.click();

    expect(launchMinigame).toHaveBeenCalledWith('pancake-flip');
    expect(panel(root).hidden).toBe(true);
  });

  it("Michael's buttons: LET IT RIP launches beystadium; BACK AWAY SLOWLY just closes (#121)", () => {
    const { root, launchMinigame } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'michael' });

    expect(root.querySelector('.npc-dialog__subtitle')?.textContent).toBe(
      'THE POD · IT ASSOCIATE · BEYSTADIUM CHAMP',
    );
    const buttonNamed = (label: string) =>
      Array.from(root.querySelectorAll('button')).find(
        (button) => button.textContent === label,
      ) as HTMLButtonElement;

    buttonNamed('BACK AWAY SLOWLY').click();
    expect(panel(root).hidden).toBe(true);
    expect(launchMinigame).not.toHaveBeenCalled();

    gameEvents.emit('npc:arrived', { npcId: 'michael' });
    buttonNamed('LET IT RIP').click();

    expect(launchMinigame).toHaveBeenCalledWith('beystadium');
    expect(panel(root).hidden).toBe(true);
  });

  it('Anthony, the door guard: his rule, TAKE THE QUIZ opens the quiz, WALK AROUND HIM closes (#146)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    overlays = createOverlayManager();
    const startPhishingQuiz = vi.fn();
    dialog = createNpcDialog(root, {
      overlays,
      actions: {
        launchMinigame: vi.fn(),
        openStall: vi.fn(),
        startQuest: vi.fn(),
        startPhishingQuiz,
      },
    });
    const buttonNamed = (label: string) =>
      Array.from(root.querySelectorAll('button')).find(
        (button) => button.textContent === label,
      ) as HTMLButtonElement;

    gameEvents.emit('npc:arrived', { npcId: 'anthony' });
    expect(root.querySelector('.npc-dialog__name')?.textContent).toBe('Anthony Conway');
    expect(root.querySelector('.npc-dialog__subtitle')?.textContent).toBe(
      'DOOR BOSS · PHISHING QUIZ',
    );
    expect(lineText(root)).toBe(
      'Whoa there. You bumped into me, so you know the rule: one security question before you pass.',
    );

    buttonNamed('WALK AROUND HIM').click();
    expect(panel(root).hidden).toBe(true);
    expect(startPhishingQuiz).not.toHaveBeenCalled();

    gameEvents.emit('npc:arrived', { npcId: 'anthony' });
    buttonNamed('TAKE THE QUIZ').click();
    expect(panel(root).hidden).toBe(true);
    expect(overlays.current()).toBeNull();
    expect(startPhishingQuiz).toHaveBeenCalledTimes(1);
  });

  it('Casey calls openStall("igloo-gear") and closes', () => {
    const { root, openStall } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'casey' });

    const stallButton = root.querySelector('.npc-dialog__actions button') as HTMLButtonElement;
    stallButton.click();

    expect(openStall).toHaveBeenCalledWith('igloo-gear');
    expect(panel(root).hidden).toBe(true);
  });

  it('every other NPC shows its dialog line and a close button, with no extra action buttons', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'steven' });

    expect(root.querySelector('.npc-dialog__line')?.textContent).toBe(
      'Architecture question. Ready?',
    );
    expect(root.querySelectorAll('.npc-dialog__actions button')).toHaveLength(0);

    const closeButton = root.querySelector('.npc-dialog__close') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    closeButton.click();
    expect(panel(root).hidden).toBe(true);
  });

  it('emits npc:dialog-closed with the NPC once its dialog closes, however it closes (#113)', () => {
    const { root } = setup();
    const closed = vi.fn();
    const unsubscribe = gameEvents.on('npc:dialog-closed', closed);

    gameEvents.emit('npc:arrived', { npcId: 'brandon' });
    expect(closed).not.toHaveBeenCalled();

    (root.querySelector('.npc-dialog__close') as HTMLButtonElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith({ npcId: 'brandon' });

    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    gameEvents.emit('room:leave', { roomId: 'roof-deck' });
    expect(closed).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenLastCalledWith({ npcId: 'jon' });

    unsubscribe();
  });

  it('Escape closes the dialog', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    expect(panel(root).hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBeNull();
  });

  it('closes on room:leave (a Room change never leaves a stale NPC dialog open)', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    expect(panel(root).hidden).toBe(false);

    gameEvents.emit('room:leave', { roomId: 'town-center' });

    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBeNull();
  });

  it('stops listening for room:leave once destroyed', () => {
    setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    dialog!.destroy();

    // Should not throw, and shouldn't touch the now-removed panel either.
    expect(() => gameEvents.emit('room:leave', { roomId: 'town-center' })).not.toThrow();
  });

  it('ignores npc:arrived while another HUD overlay is already open, instead of stealing focus and closing it (#36 round-2 review item 2b)', () => {
    const { root } = setup();
    const onClose = vi.fn();
    overlays!.open('penguin-creator', onClose);

    gameEvents.emit('npc:arrived', { npcId: 'jon' });

    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBe('penguin-creator');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still opens on npc:arrived once that other overlay has closed', () => {
    const { root } = setup();
    const onClose = vi.fn();
    overlays!.open('penguin-creator', onClose);
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    expect(panel(root).hidden).toBe(true);

    overlays!.close('penguin-creator');
    gameEvents.emit('npc:arrived', { npcId: 'jon' });

    expect(panel(root).hidden).toBe(false);
    expect(overlays!.current()).toBe(NPC_DIALOG_OVERLAY_ID);
  });

  it('registers as one overlay at a time with the HUD overlay manager', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    expect(overlays!.current()).toBe(NPC_DIALOG_OVERLAY_ID);

    const onClose = vi.fn();
    overlays!.open('menu', onClose);

    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBe('menu');
  });

  it('the panel is an accessible dialog labelled by the name element', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });

    const panelEl = box(root);
    expect(panelEl.getAttribute('role')).toBe('dialog');
    expect(panelEl.getAttribute('aria-modal')).toBe('true');
    const nameEl = root.querySelector('.npc-dialog__name') as HTMLElement;
    expect(nameEl.id).toBeTruthy();
    expect(panelEl.getAttribute('aria-labelledby')).toBe(nameEl.id);
    expect(root.querySelector('.npc-dialog__line')?.getAttribute('aria-live')).toBe('polite');
  });

  it('moves focus to the first action button on open, and restores prior focus on close', () => {
    const { root } = setup();
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    gameEvents.emit('npc:arrived', { npcId: 'ian' });

    const grabButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'GRAB THE HAMMER',
    );
    expect(document.activeElement).toBe(grabButton);

    overlays!.close(NPC_DIALOG_OVERLAY_ID);
    expect(document.activeElement).toBe(outsideButton);
  });

  it('moves focus to the close button when the NPC has no action buttons', () => {
    const { root } = setup();
    // Jon has "Got any work for me?" since #144, so Steven stands in.
    gameEvents.emit('npc:arrived', { npcId: 'steven' });

    const closeButton = root.querySelector('.npc-dialog__close');
    expect(document.activeElement).toBe(closeButton);
  });
});

describe('createNpcDialog rotating lines (#144)', () => {
  it('shows a different line each time an NPC with two or more lines is opened', () => {
    // Real randomness: the no-repeat rule must hold whatever the pick.
    const { root } = setup({ random: Math.random });
    const pool = dialogLinePool(NPCS.ashley);
    let previous: string | null | undefined;
    for (let i = 0; i < 30; i += 1) {
      gameEvents.emit('npc:arrived', { npcId: 'ashley' });
      const shown = lineText(root);
      expect(pool).toContain(shown);
      expect(shown).not.toBe(previous);
      previous = shown;
      overlays!.close(NPC_DIALOG_OVERLAY_ID);
    }
  });

  it('keeps the same line when npc:arrived repeats for the dialog already open', () => {
    const { root } = setup({ random: Math.random });
    gameEvents.emit('npc:arrived', { npcId: 'ashley' });
    const first = lineText(root);
    for (let i = 0; i < 10; i += 1) {
      gameEvents.emit('npc:arrived', { npcId: 'ashley' });
      expect(lineText(root)).toBe(first);
    }
  });

  it("keeps a Minigame NPC's verbatim trigger line on every open (Q15)", () => {
    const { root } = setup({ random: Math.random });
    const ian = NPCS.ian.dialog;
    if (ian.kind !== 'minigame') throw new Error('expected Ian to launch a Minigame');
    for (let i = 0; i < 5; i += 1) {
      gameEvents.emit('npc:arrived', { npcId: 'ian' });
      expect(lineText(root)).toBe(ian.triggerLine);
      overlays!.close(NPC_DIALOG_OVERLAY_ID);
    }
  });
});

describe('createNpcDialog quest givers (#144)', () => {
  function mainQuestStatus(overrides: Partial<QuestStatus>): QuestStatus {
    return {
      quest: {
        kind: 'steps',
        id: 'main',
        title: 'Get started at JG',
        location: 'ANYWHERE',
        steps: [],
        rewardTokens: 150,
      },
      progress: 0,
      target: 5,
      done: false,
      steps: [],
      nextHint: null,
      ...overrides,
    };
  }

  /** Points Jon at the main Quest for one test only. */
  function withJonQuest(run: () => void): void {
    const original = NPCS.jon.questGiver;
    NPCS.jon.questGiver = { ...original, questId: 'main' };
    try {
      run();
    } finally {
      NPCS.jon.questGiver = original;
    }
  }

  it('shows "Got any work for me?" for Jon, after his line, and not for Steven', () => {
    const { root } = setup();
    // The Mullet's Jon: his quest-giver appearance since he left Town Center.
    gameEvents.emit('npc:arrived', { npcId: 'jon-mullet' });
    const button = questButton(root);
    expect(button?.textContent).toBe('Got any work for me?');
    expect(lineText(root)).toBe('Welcome to JG. Sunglasses stay on.');
    // A line NPC had no action buttons, so focus now lands on the new one.
    expect(document.activeElement).toBe(button);
    overlays!.close(NPC_DIALOG_OVERLAY_ID);

    gameEvents.emit('npc:arrived', { npcId: 'steven' });
    expect(questButton(root)).toBeNull();
  });

  it("answers Jon's click with his nothing-right-now line and keeps the dialog open", () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon-mullet' });
    questButton(root)!.click();
    expect(lineText(root)).toBe('Just enjoy the tour. Sunglasses stay on.');
    expect(panel(root).hidden).toBe(false);
  });

  it('shows no button for a quest giver still waiting on BA copy and a Quest', () => {
    const { root } = setup();
    for (const npcId of [
      'ashley',
      'sydney-team-room-3',
      'jory',
      'nicole',
      'michael',
      'ian',
    ] as const) {
      gameEvents.emit('npc:arrived', { npcId });
      expect(questButton(root), npcId).toBeNull();
      overlays!.close(NPC_DIALOG_OVERLAY_ID);
    }
  });

  it('shows no button on the appearances a Quest does not name (Q17)', () => {
    const quests: NpcDialogQuests = { status: () => mainQuestStatus({}), canStart: () => true };
    const { root } = setup({ quests });
    for (const npcId of ['sydney', 'ian-team-room-2', 'steven'] as const) {
      gameEvents.emit('npc:arrived', { npcId });
      expect(questButton(root), npcId).toBeNull();
      overlays!.close(NPC_DIALOG_OVERLAY_ID);
    }
  });

  it('not started, with a starter: starts the Quest and closes the dialog', () => {
    withJonQuest(() => {
      const quests: NpcDialogQuests = { status: () => mainQuestStatus({}), canStart: () => true };
      const { root, startQuest } = setup({ quests });
      gameEvents.emit('npc:arrived', { npcId: 'jon' });
      questButton(root)!.click();
      expect(startQuest).toHaveBeenCalledWith('main');
      expect(panel(root).hidden).toBe(true);
    });
  });

  it('in progress: shows "title · x / y" and keeps the dialog open', () => {
    withJonQuest(() => {
      const quests: NpcDialogQuests = {
        status: () => mainQuestStatus({ progress: 2 }),
        canStart: () => true,
      };
      const { root, startQuest } = setup({ quests });
      gameEvents.emit('npc:arrived', { npcId: 'jon' });
      questButton(root)!.click();
      expect(lineText(root)).toBe('Get started at JG · 2 / 5');
      expect(startQuest).not.toHaveBeenCalled();
      expect(panel(root).hidden).toBe(false);
    });
  });

  it('done: shows "Thanks again!"', () => {
    withJonQuest(() => {
      const quests: NpcDialogQuests = {
        status: () => mainQuestStatus({ progress: 5, done: true }),
        canStart: () => true,
      };
      const { root } = setup({ quests });
      gameEvents.emit('npc:arrived', { npcId: 'jon' });
      questButton(root)!.click();
      expect(lineText(root)).toBe('Thanks again!');
    });
  });

  it("keeps Ian's GRAB THE HAMMER and NOT MY TICKET, in order, with focus on the first", () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'ian' });
    const labels = [...root.querySelectorAll('.npc-dialog__actions button')].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(['GRAB THE HAMMER', 'NOT MY TICKET']);
    expect(document.activeElement?.textContent).toBe('GRAB THE HAMMER');
  });
});
