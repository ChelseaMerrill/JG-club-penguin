import { gameEvents, type RoomId } from '../../contracts';
import { createOverlayManager } from './overlay-manager';
import type { RoomTitle } from './room-titles';

/** Dependencies injected so the HUD stays decoupled from parallel tickets. */
export interface HudDeps {
  /** Room title/subtitle for the HUD header (#32 D3). Wired from
   *  `src/ui/hud/room-titles.ts` in `src/main.ts` until #13's
   *  `getRoomDefinition` replaces it. */
  resolveRoomTitle: (roomId: RoomId) => RoomTitle;
  /** #15 `changeRoom('igloo')` once it lands; a no-op until then. */
  onIgloo: () => void;
  /** The existing `auth.signOut`. */
  onSignOut: () => void;
  /** 0 until #34 loads the real Token balance. */
  initialBalance: number;
}

export interface Hud {
  show(): void;
  hide(): void;
  destroy(): void;
}

const MENU_OVERLAY_ID = 'menu';

/**
 * The HUD every Room shares: Room title (top left), Token balance / PENGUIN /
 * MENU (top right), and the chat slot / MAP / IGLOO bar (bottom), reproducing
 * `design/Room 01 Town Center.dc.html` and `design/Club JenGuin HUD
 * Menus.dc.html` in Stage pixels. Mounted once into `layer` (the `#ui`
 * overlay); `show()`/`hide()` toggle it around sign-in/sign-out.
 */
export function createHud(layer: HTMLElement, deps: HudDeps): Hud {
  const overlays = createOverlayManager();

  const root = document.createElement('div');
  root.className = 'hud';
  root.hidden = true;

  // Top left: Room title and subtitle, updated on `room:enter`.
  const titleBlock = document.createElement('div');
  titleBlock.className = 'hud__title-block';
  const titleEl = document.createElement('div');
  titleEl.className = 'hud__title';
  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'hud__subtitle';
  titleBlock.append(titleEl, subtitleEl);

  // Top right: Token balance, PENGUIN (opens the Creator), MENU (sign out).
  const topRight = document.createElement('div');
  topRight.className = 'hud__top-right';

  const tokensEl = document.createElement('div');
  tokensEl.className = 'hud__tokens';
  const tokensIcon = document.createElement('span');
  tokensIcon.className = 'hud__tokens-icon';
  const tokensValue = document.createElement('span');
  tokensValue.className = 'hud__tokens-value';
  tokensEl.append(tokensIcon, tokensValue);

  const penguinButton = document.createElement('button');
  penguinButton.type = 'button';
  penguinButton.className = 'hud__button hud__button--penguin';
  penguinButton.textContent = 'PENGUIN';
  penguinButton.addEventListener('click', () => gameEvents.emit('ui:open-creator'));

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'hud__button hud__button--menu';
  menuButton.textContent = 'MENU';

  topRight.append(tokensEl, penguinButton, menuButton);

  const menuPanel = document.createElement('div');
  menuPanel.className = 'hud__menu-panel';
  menuPanel.hidden = true;
  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'hud__menu-signout';
  signOutButton.textContent = 'Sign out';
  menuPanel.append(signOutButton);

  function closeMenu(): void {
    menuPanel.hidden = true;
  }

  menuButton.addEventListener('click', () => {
    if (overlays.current() === MENU_OVERLAY_ID) {
      overlays.close(MENU_OVERLAY_ID);
      closeMenu();
      return;
    }
    menuPanel.hidden = false;
    overlays.open(MENU_OVERLAY_ID, closeMenu);
  });

  signOutButton.addEventListener('click', () => {
    overlays.close(MENU_OVERLAY_ID);
    closeMenu();
    deps.onSignOut();
  });

  // Bottom bar: chat slot (B-3 fills this in), MAP and IGLOO. EMOTE,
  // SNOWBALL and QUESTS stay hidden until their stretch tickets land.
  const bottomBar = document.createElement('div');
  bottomBar.className = 'hud__bottom-bar';

  const chatSlot = document.createElement('div');
  chatSlot.className = 'hud__chat-slot';
  chatSlot.textContent = 'Say something...';

  const emoteButton = document.createElement('button');
  emoteButton.type = 'button';
  emoteButton.className = 'hud__button hud__button--bottom hud__button--emote';
  emoteButton.textContent = 'EMOTE';
  emoteButton.hidden = true;

  const snowballButton = document.createElement('button');
  snowballButton.type = 'button';
  snowballButton.className = 'hud__button hud__button--bottom hud__button--snowball';
  snowballButton.textContent = 'SNOWBALL';
  snowballButton.hidden = true;

  const mapButton = document.createElement('button');
  mapButton.type = 'button';
  mapButton.className = 'hud__button hud__button--bottom hud__button--map';
  mapButton.textContent = 'MAP';
  mapButton.addEventListener('click', () => gameEvents.emit('ui:open-map'));

  const iglooButton = document.createElement('button');
  iglooButton.type = 'button';
  iglooButton.className = 'hud__button hud__button--bottom hud__button--igloo';
  iglooButton.textContent = 'IGLOO';
  iglooButton.addEventListener('click', () => deps.onIgloo());

  const questsButton = document.createElement('button');
  questsButton.type = 'button';
  questsButton.className = 'hud__button hud__button--bottom hud__button--quests';
  questsButton.textContent = 'QUESTS';
  questsButton.hidden = true;

  bottomBar.append(chatSlot, emoteButton, snowballButton, mapButton, iglooButton, questsButton);

  root.append(titleBlock, topRight, menuPanel, bottomBar);
  layer.append(root);

  function setBalance(balance: number): void {
    tokensValue.textContent = balance.toLocaleString('en-US');
  }
  setBalance(deps.initialBalance);

  function setRoom(roomId: RoomId): void {
    const { title, subtitle } = deps.resolveRoomTitle(roomId);
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
  }

  const unsubscribeRoomEnter = gameEvents.on('room:enter', ({ roomId }) => setRoom(roomId));
  const unsubscribeTokens = gameEvents.on('tokens:changed', ({ balance }) => setBalance(balance));

  return {
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      overlays.close(MENU_OVERLAY_ID);
      closeMenu();
    },
    destroy() {
      unsubscribeRoomEnter();
      unsubscribeTokens();
      overlays.destroy();
      root.remove();
    },
  };
}
