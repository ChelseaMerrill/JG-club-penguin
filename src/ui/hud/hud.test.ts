// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TEXT_MAX, gameEvents, type RoomId } from '../../contracts';
import { createHud, type Hud, type HudDeps, type RoomTitle } from './hud';

let currentHud: Hud | undefined;

function setup(overrides: Partial<HudDeps> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const onIgloo = vi.fn();
  const onSignOut = vi.fn();
  const resolveRoomTitle = vi.fn((roomId: RoomId): RoomTitle => ({
    title: roomId.toUpperCase(),
    subtitle: `subtitle-${roomId}`,
  }));
  const onChatSend = vi.fn(() => Promise.resolve(true));
  const onEmotePick = vi.fn();
  const deps: HudDeps = {
    resolveRoomTitle,
    onIgloo,
    onSignOut,
    initialBalance: 0,
    onChatSend,
    onEmotePick,
    ...overrides,
  };
  const hud = createHud(root, deps);
  currentHud = hud;
  return { root, hud, onIgloo, onSignOut, resolveRoomTitle, onChatSend, onEmotePick };
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

  it('the MENU panel has exactly the Sign out button (RETURN TO TOWN CENTER removed, #33 D7/review round 1 fix 3)', () => {
    const { root } = setup();

    const buttonClasses = [...root.querySelectorAll('.hud__menu-panel button')].map(
      (button) => button.className,
    );

    expect(buttonClasses).toEqual(['hud__menu-signout']);
  });

  it('Sign out in the MENU panel calls the injected onSignOut and closes the menu', () => {
    const { root, onSignOut } = setup();

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    (root.querySelector('.hud__menu-signout') as HTMLButtonElement).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect((root.querySelector('.hud__menu-panel') as HTMLElement).hidden).toBe(true);
  });

  it('EMOTE (#47) and SNOWBALL (#53) are shown; QUESTS renders hidden', () => {
    const { root } = setup();

    expect((root.querySelector('.hud__button--emote') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.hud__button--snowball') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('.hud__button--quests') as HTMLElement).hidden).toBe(true);
  });

  it('EMOTE opens the picker, closing an open MENU first (#47)', () => {
    const { root, hud } = setup();
    const menuPanel = () => root.querySelector('.hud__menu-panel') as HTMLElement;
    const picker = () => root.querySelector('.emote-picker') as HTMLElement;

    (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
    expect(menuPanel().hidden).toBe(false);

    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();

    expect(menuPanel().hidden).toBe(true);
    expect(picker().hidden).toBe(false);
    expect(hud.overlays.current()).toBe('emote');
  });

  it('EMOTE again closes the picker', () => {
    const { root } = setup();
    const picker = () => root.querySelector('.emote-picker') as HTMLElement;

    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();
    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();

    expect(picker().hidden).toBe(true);
  });

  it('clicking a picker tile calls onEmotePick and closes the picker (#47)', () => {
    const { root, onEmotePick } = setup();
    const picker = () => root.querySelector('.emote-picker') as HTMLElement;

    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();
    (root.querySelector('[data-emote="wave"]') as HTMLButtonElement).click();

    expect(onEmotePick).toHaveBeenCalledWith('wave');
    expect(picker().hidden).toBe(true);
  });

  it('ESC closes the open picker (#47)', () => {
    const { root } = setup();
    const picker = () => root.querySelector('.emote-picker') as HTMLElement;

    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(picker().hidden).toBe(true);
  });

  it('hide() closes an open picker', () => {
    const { root, hud } = setup();
    const picker = () => root.querySelector('.emote-picker') as HTMLElement;

    (root.querySelector('.hud__button--emote') as HTMLButtonElement).click();
    hud.hide();

    expect(picker().hidden).toBe(true);
  });

  describe('Snowball mode (#53)', () => {
    function snowballButton(root: HTMLElement): HTMLButtonElement {
      return root.querySelector('.hud__button--snowball') as HTMLButtonElement;
    }
    function panel(root: HTMLElement): HTMLElement {
      return root.querySelector('.hud__snowball-panel') as HTMLElement;
    }

    it('SNOWBALL asks to enter the mode; the panel stays hidden until the mode is set on', () => {
      const onSnowballToggle = vi.fn();
      const { root } = setup({ onSnowballToggle });

      expect(panel(root).hidden).toBe(true);
      snowballButton(root).click();

      expect(onSnowballToggle).toHaveBeenCalledWith(true);
      expect(panel(root).hidden).toBe(true);
    });

    it('setSnowballMode(true) shows the mode panel and the active button; SNOWBALL then asks to leave', () => {
      const onSnowballToggle = vi.fn();
      const { root, hud } = setup({ onSnowballToggle });

      hud.setSnowballMode(true);

      expect(panel(root).hidden).toBe(false);
      expect(panel(root).textContent).toContain('SNOWBALL MODE');
      expect(panel(root).textContent).toContain('Hit a penguin: they get a snow hat for 10s.');
      expect(panel(root).textContent).not.toContain('Snowmageddon');
      expect(snowballButton(root).classList.contains('hud__button--active')).toBe(true);

      snowballButton(root).click();
      expect(onSnowballToggle).toHaveBeenLastCalledWith(false);

      hud.setSnowballMode(false);
      expect(panel(root).hidden).toBe(true);
      expect(snowballButton(root).classList.contains('hud__button--active')).toBe(false);
    });

    it('renders one pip per snowball of capacity and "N LEFT · REFILLS 1 / 4S"', () => {
      const { root, hud } = setup();
      hud.setSnowballMode(true);

      hud.setSnowballAmmo(2, 3);
      expect(root.querySelectorAll('.hud__snowball-pip')).toHaveLength(3);
      expect(root.querySelectorAll('.hud__snowball-pip--full')).toHaveLength(2);
      expect(root.querySelector('.hud__snowball-ammo-text')?.textContent).toBe(
        '2 LEFT · REFILLS 1 / 4S',
      );

      hud.setSnowballAmmo(0, 3);
      expect(root.querySelectorAll('.hud__snowball-pip--full')).toHaveLength(0);
      expect(root.querySelector('.hud__snowball-ammo-text')?.textContent).toBe(
        '0 LEFT · REFILLS 1 / 4S',
      );
    });

    it('entering the mode closes MENU first, then enters', () => {
      const onSnowballToggle = vi.fn();
      const { root, hud } = setup({ onSnowballToggle });
      (root.querySelector('.hud__button--menu') as HTMLButtonElement).click();
      expect(hud.overlays.current()).toBe('menu');

      snowballButton(root).click();

      expect(hud.overlays.current()).toBeNull();
      expect((root.querySelector('.hud__menu-panel') as HTMLElement).hidden).toBe(true);
      expect(onSnowballToggle).toHaveBeenCalledWith(true);
    });

    it('refuses to enter the mode while another HUD overlay is open', () => {
      const onSnowballToggle = vi.fn();
      const { root, hud } = setup({ onSnowballToggle });
      hud.overlays.open('penguin-creator', () => {});

      snowballButton(root).click();

      expect(onSnowballToggle).not.toHaveBeenCalled();
      expect(hud.overlays.current()).toBe('penguin-creator');
    });

    it('Escape leaves the mode when no overlay is open (#109)', () => {
      const onSnowballToggle = vi.fn();
      const { hud } = setup({ onSnowballToggle });
      hud.setSnowballMode(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onSnowballToggle).toHaveBeenCalledWith(false);
    });

    it('Escape does nothing while the mode is already off (as when a HUD overlay is open: main.ts already turned it off, #109)', () => {
      const onSnowballToggle = vi.fn();
      setup({ onSnowballToggle });

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onSnowballToggle).not.toHaveBeenCalled();
    });

    it('refuses to enter the mode with 0 ammo; SNOWBALL stays off (#109)', () => {
      const onSnowballToggle = vi.fn();
      const { root, hud } = setup({ onSnowballToggle });
      hud.setSnowballAmmo(0, 3);

      snowballButton(root).click();

      expect(onSnowballToggle).not.toHaveBeenCalled();
      expect(snowballButton(root).classList.contains('hud__button--active')).toBe(false);
    });

    it('re-entering is allowed again once ammo refills above 0 (#109)', () => {
      const onSnowballToggle = vi.fn();
      const { root, hud } = setup({ onSnowballToggle });
      hud.setSnowballAmmo(0, 3);
      snowballButton(root).click();
      expect(onSnowballToggle).not.toHaveBeenCalled();

      hud.setSnowballAmmo(1, 3);
      snowballButton(root).click();

      expect(onSnowballToggle).toHaveBeenCalledWith(true);
    });
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

describe('createHud Quests (#46)', () => {
  it('shows the QUESTS button once onQuests is wired, and clicking it calls onQuests', () => {
    const onQuests = vi.fn();
    const { root } = setup({ onQuests });
    const button = root.querySelector('.hud__button--quests') as HTMLButtonElement;

    expect(button.hidden).toBe(false);
    button.click();

    expect(onQuests).toHaveBeenCalledTimes(1);
  });

  it('marks the QUESTS button active while the Quests panel is open', () => {
    const { root, hud } = setup({ onQuests: vi.fn() });
    const button = root.querySelector('.hud__button--quests') as HTMLButtonElement;

    hud.setQuestsActive(true);
    expect(button.classList.contains('hud__button--active')).toBe(true);
    hud.setQuestsActive(false);
    expect(button.classList.contains('hud__button--active')).toBe(false);
  });

  it('exposes a quest slot inside the HUD for the quest widget', () => {
    const { root, hud } = setup();

    expect(root.querySelector('.hud')?.contains(hud.questSlot)).toBe(true);
  });

  it('hides a toast after its own durationMs, and after 4 s by default', () => {
    vi.useFakeTimers();
    try {
      const { root } = setup();
      const toast = () => root.querySelector('.hud__toast') as HTMLElement;

      gameEvents.emit('ui:toast', { message: 'Quest: Visit the Dev Pit', durationMs: 3000 });
      vi.advanceTimersByTime(2999);
      expect(toast().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast().hidden).toBe(true);

      gameEvents.emit('ui:toast', { message: 'Saved' });
      vi.advanceTimersByTime(3999);
      expect(toast().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast().hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
