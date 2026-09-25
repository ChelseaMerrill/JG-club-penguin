// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TEXT_MAX, gameEvents, type RoomId } from '../../contracts';
import { createHud, type Hud, type HudDeps, type RoomTitle } from './hud';

let currentHud: Hud | undefined;

function setup(overrides: Partial<HudDeps> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const onIgloo = vi.fn();
  const onReturnToTownCenter = vi.fn();
  const onSignOut = vi.fn();
  const resolveRoomTitle = vi.fn((roomId: RoomId): RoomTitle => ({
    title: roomId.toUpperCase(),
    subtitle: `subtitle-${roomId}`,
  }));
  const onChatSend = vi.fn(() => Promise.resolve(true));
  const deps: HudDeps = {
    resolveRoomTitle,
    onIgloo,
    onReturnToTownCenter,
    onSignOut,
    initialBalance: 0,
    onChatSend,
    ...overrides,
  };
  const hud = createHud(root, deps);
  currentHud = hud;
  return { root, hud, onIgloo, onReturnToTownCenter, onSignOut, resolveRoomTitle, onChatSend };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentHud?.destroy();
  currentHud = undefined;
});

describe('createHud', () => {
  it('renders the initial Token balance and updates it on tokens:changed', () => {
    const { root } = setup({ initialBalance: 250 });

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('250');

    gameEvents.emit('tokens:changed', { balance: 1250 });

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('1,250');
  });

  it('shows the Town Center title and subtitle from creation, before any room:enter arrives', () => {
    const { root, resolveRoomTitle } = setup();

    expect(resolveRoomTitle).toHaveBeenCalledWith('town-center');
    expect(root.querySelector('.hud__title')?.textContent).toBe('TOWN-CENTER');
    expect(root.querySelector('.hud__subtitle')?.textContent).toBe('subtitle-town-center');
  });

  it('updates the Room title and subtitle on room:enter via the injected resolveRoomTitle', () => {
    const resolveRoomTitle = vi.fn((): RoomTitle => ({
      title: 'TOWN CENTER',
      subtitle: 'JG HQ · 108 STATE ST',
    }));
    const { root } = setup({ resolveRoomTitle });

    gameEvents.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });

    expect(resolveRoomTitle).toHaveBeenCalledWith('town-center');
    expect(root.querySelector('.hud__title')?.textContent).toBe('TOWN CENTER');
    expect(root.querySelector('.hud__subtitle')?.textContent).toBe('JG HQ · 108 STATE ST');
  });

  it('PENGUIN emits ui:open-creator', () => {
    const { root } = setup();
    const spy = vi.fn();
    const unsubscribe = gameEvents.on('ui:open-creator', spy);

    (root.querySelector('.hud__button--penguin') as HTMLButtonElement).click();

    expect(spy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('MAP emits ui:open-map', () => {
    const { root } = setup();
    const spy = vi.fn();
    const unsubscribe = gameEvents.on('ui:open-map', spy);

    (root.querySelector('.hud__button--map') as HTMLButtonElement).click();

    expect(spy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('PENGUIN closes an open MENU before emitting ui:open-creator', () => {
    const { root } = setup();
    const menuPanel = () => root.querySelector('.hud__menu-panel') as HTMLElement;

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    expect(menuPanel().hidden).toBe(false);

    (root.querySelector('.hud__button--penguin') as HTMLButtonElement).click();

    expect(menuPanel().hidden).toBe(true);
  });

  it('MAP closes an open MENU before emitting ui:open-map', () => {
    const { root } = setup();
    const menuPanel = () => root.querySelector('.hud__menu-panel') as HTMLElement;

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    expect(menuPanel().hidden).toBe(false);

    (root.querySelector('.hud__button--map') as HTMLButtonElement).click();

    expect(menuPanel().hidden).toBe(true);
  });

  it('exposes the overlay manager for other overlays (#33, #35) to register with', () => {
    const { root, hud } = setup();

    expect(hud.overlays.current()).toBeNull();

    const onClose = vi.fn();
    hud.overlays.open('creator', onClose);
    expect(hud.overlays.current()).toBe('creator');

    // Opening MENU closes the newly-registered overlay too: it's the same
    // one-overlay-at-a-time manager.
    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hud.overlays.current()).toBe('menu');
  });

  it('IGLOO calls the injected onIgloo', () => {
    const { root, onIgloo } = setup();

    (root.querySelector('.hud__button--igloo') as HTMLButtonElement).click();

    expect(onIgloo).toHaveBeenCalledTimes(1);
  });

  it('MENU opens the menu panel and ESC closes it', () => {
    const { root } = setup();
    const menuPanel = () => root.querySelector('.hud__menu-panel') as HTMLElement;

    expect(menuPanel().hidden).toBe(true);

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    expect(menuPanel().hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menuPanel().hidden).toBe(true);
  });

  it('Sign out in the MENU panel calls the injected onSignOut and closes the menu', () => {
    const { root, onSignOut } = setup();

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    (root.querySelector('.hud__menu-signout') as HTMLButtonElement).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect((root.querySelector('.hud__menu-panel') as HTMLElement).hidden).toBe(true);
  });

  it('RETURN TO TOWN CENTER is hidden in Town Center and shown elsewhere, tracked from room:enter', () => {
    const { root } = setup();
    const returnButton = () =>
      root.querySelector('.hud__menu-return-to-town-center') as HTMLElement;

    expect(returnButton().hidden).toBe(true);

    gameEvents.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
    expect(returnButton().hidden).toBe(false);

    gameEvents.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    expect(returnButton().hidden).toBe(true);
  });

  it('RETURN TO TOWN CENTER calls the injected onReturnToTownCenter and closes MENU', () => {
    const onReturnToTownCenter = vi.fn();
    const { root } = setup({ onReturnToTownCenter });
    gameEvents.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    (root.querySelector('.hud__menu-return-to-town-center') as HTMLButtonElement).click();

    expect(onReturnToTownCenter).toHaveBeenCalledTimes(1);
    expect((root.querySelector('.hud__menu-panel') as HTMLElement).hidden).toBe(true);
  });

  it('EMOTE, SNOWBALL and QUESTS render hidden', () => {
    const { root } = setup();

    expect((root.querySelector('.hud__button--emote') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('.hud__button--snowball') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('.hud__button--quests') as HTMLElement).hidden).toBe(true);
  });

  it('renders the chat field with the shared 120 maxlength and its placeholder', () => {
    const { root } = setup();
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    expect(input.maxLength).toBe(CHAT_TEXT_MAX);
    expect(input.placeholder).toBe('Say something...');
  });

  it('Enter calls onChatSend with the field text and clears it once accepted', async () => {
    const onChatSend = vi.fn(() => Promise.resolve(true));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'hello there';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onChatSend).toHaveBeenCalledWith('hello there');

    await Promise.resolve();
    await Promise.resolve();

    expect(input.value).toBe('');
  });

  it('a refused send keeps the typed text in the field', async () => {
    const onChatSend = vi.fn(() => Promise.resolve(false));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'too fast';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(input.value).toBe('too fast');
  });

  it('a rejected send is treated as not accepted and keeps the typed text (#44 review fix F7)', async () => {
    const onChatSend = vi.fn(() => Promise.reject(new Error('network down')));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'still here';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(input.value).toBe('still here');
  });

  it('text typed while a send is pending survives an accepted ack for the older text (#44 review fix F7)', async () => {
    let resolveSend!: (accepted: boolean) => void;
    const onChatSend = vi.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'first message';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // The Player keeps typing while the first send is still pending.
    input.value = 'a second, newer message';
    resolveSend(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(input.value).toBe('a second, newer message');
  });

  it('Enter during IME composition does not submit (isComposing)', () => {
    const onChatSend = vi.fn(() => Promise.resolve(true));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'still composing';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    );

    expect(onChatSend).not.toHaveBeenCalled();
  });

  it('Enter during IME composition does not submit (legacy keyCode 229)', () => {
    const onChatSend = vi.fn(() => Promise.resolve(true));
    const { root } = setup({ onChatSend });
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;

    input.value = 'still composing';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 229 }),
    );

    expect(onChatSend).not.toHaveBeenCalled();
  });

  it('a non-Enter keydown in the chat field never reaches a window keydown listener', () => {
    const { root } = setup();
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;
    const windowSpy = vi.fn();
    window.addEventListener('keydown', windowSpy);

    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }));

      expect(windowSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowSpy);
    }
  });

  it('Enter in the chat field never reaches a window keydown listener (e.g. Escape-closes-overlay)', () => {
    const { root } = setup();
    const input = root.querySelector('.hud__chat-input') as HTMLInputElement;
    const windowSpy = vi.fn();
    window.addEventListener('keydown', windowSpy);

    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(windowSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowSpy);
    }
  });

  it('show() and hide() toggle the HUD root', () => {
    const { root, hud } = setup();
    const hudRoot = () => root.querySelector('.hud') as HTMLElement;

    expect(hudRoot().hidden).toBe(true);

    hud.show();
    expect(hudRoot().hidden).toBe(false);

    hud.hide();
    expect(hudRoot().hidden).toBe(true);
  });
});
