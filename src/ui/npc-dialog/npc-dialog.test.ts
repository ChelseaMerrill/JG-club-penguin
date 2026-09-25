// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../../contracts';
import { createOverlayManager, type OverlayManager } from '../hud/overlay-manager';
import { createNpcDialog, NPC_DIALOG_OVERLAY_ID, type NpcDialog } from './npc-dialog';

let dialog: NpcDialog | undefined;
let overlays: OverlayManager | undefined;

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  overlays = createOverlayManager();
  const launchMinigame = vi.fn();
  const openStall = vi.fn();
  dialog = createNpcDialog(root, { overlays, actions: { launchMinigame, openStall } });
  return { root, launchMinigame, openStall };
}

function panel(root: HTMLElement): HTMLElement {
  return root.querySelector('.npc-dialog') as HTMLElement;
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

  it('opens on npc:arrived, showing the name, title and idle line', () => {
    const { root } = setup();

    gameEvents.emit('npc:arrived', { npcId: 'ian' });

    expect(panel(root).hidden).toBe(false);
    expect(overlays!.current()).toBe(NPC_DIALOG_OVERLAY_ID);
    expect(root.querySelector('.npc-dialog__name')?.textContent).toBe('Ian Ballard');
    expect(root.querySelector('.npc-dialog__title')?.textContent).toBe('VP of Engineering');
    expect(root.querySelector('.npc-dialog__line')?.textContent).toBe('Who broke CI? Be honest.');
  });

  it('shows no title element content when the NPC has none', () => {
    const { root } = setup();

    // Chelsea Merrill's title is null (design "TITLE TBD" / humans.js's "ROLE
    // TBD · SEND ME THIS ONE").
    gameEvents.emit('npc:arrived', { npcId: 'chelsea' });

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

  it("Ian's buttons: GRAB THE HAMMER launches bug-squash and closes; NOT MY TICKET just closes", () => {
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

    expect(panel(root).hidden).toBe(true);
  });

  it("Chelsea's buttons: GRAB THE SPATULA launches pancake-flip; I BURN TOAST just closes", () => {
    const { root, launchMinigame } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'chelsea' });

    const grabButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'GRAB THE SPATULA',
    ) as HTMLButtonElement;
    grabButton.click();

    expect(launchMinigame).toHaveBeenCalledWith('pancake-flip');
    expect(panel(root).hidden).toBe(true);
  });

  it('Casey calls openStall("igloo-gear") and closes', () => {
    const { root, openStall } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'casey' });

    const stallButton = root.querySelector('.npc-dialog__actions button') as HTMLButtonElement;
    stallButton.click();

    expect(openStall).toHaveBeenCalledWith('igloo-gear');
    expect(panel(root).hidden).toBe(true);
  });

  it('every other NPC shows its line and a close button, with no extra action buttons', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });

    expect(root.querySelector('.npc-dialog__line')?.textContent).toBe(
      'Welcome to JG. Sunglasses stay on.',
    );
    expect(root.querySelectorAll('.npc-dialog__actions button')).toHaveLength(0);

    const closeButton = root.querySelector('.npc-dialog__close') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    closeButton.click();
    expect(panel(root).hidden).toBe(true);
  });

  it('Escape closes the dialog', () => {
    const { root } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'jon' });
    expect(panel(root).hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(panel(root).hidden).toBe(true);
    expect(overlays!.current()).toBeNull();
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
});
