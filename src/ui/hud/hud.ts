import { gameEvents, SPAWN_ROOM_ID, type RoomId } from '../../contracts';
import { createOverlayManager, type OverlayManager } from './overlay-manager';

/** A Room's HUD header text: the big title and the small subtitle beneath it. */
export interface RoomTitle {
  title: string;
  subtitle: string;
}

/** Dependencies injected so the HUD stays decoupled from parallel tickets. */
export interface HudDeps {
  /** Room title/subtitle for the HUD header (#32 D3). Wired from
   *  `getRoomDefinition(id).title/subtitle` in `src/main.ts` (#16 D7). */
  resolveRoomTitle: (roomId: RoomId) => RoomTitle;
  /** #15 D5: `navigator.changeRoom('igloo')`. */
  onIgloo: () => void;
  /**
   * #15 plan amendment: `navigator.changeRoom('town-center')`, from the MENU
   * panel's RETURN TO TOWN CENTER item. Temporary: remove this item (and this
   * dependency) once the Map (#33) and any added doors cover every dead end.
   */
  onReturnToTownCenter: () => void;
  /** The existing `auth.signOut`. */
  onSignOut: () => void;
  /** 0 until #34 loads the real Token balance. */
  initialBalance: number;
}

export interface Hud {
  show(): void;
  hide(): void;
  destroy(): void;
  /** The one-overlay-at-a-time manager MENU registers with. Exposed so #33
   *  (Map) and #35 (Penguin Creator) can register their own overlays on the
   *  same manager instead of each building their own. */
  overlays: OverlayManager;
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
  penguinButton.addEventListener('click', () => {
    // Closing MENU first keeps one overlay open at a time (#32 D6) even
    // though the Creator itself isn't wired up yet.
    overlays.close(MENU_OVERLAY_ID);
    gameEvents.emit('ui:open-creator');
  });

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'hud__button hud__button--menu';
  menuButton.textContent = 'MENU';

  topRight.append(tokensEl, penguinButton, menuButton);

  const menuPanel = document.createElement('div');
  menuPanel.className = 'hud__menu-panel';
  menuPanel.hidden = true;

  // Temporary (#15 plan amendment): guarantees no Room is a dead end before
  // the Map (#33) and any added doors cover every dead end. Hidden while
  // already in Town Center (`setRoom` below); remove this item once #33
  // and/or new doors make it redundant. Reuses `.hud__menu-signout`'s look.
  const returnToTownCenterButton = document.createElement('button');
  returnToTownCenterButton.type = 'button';
  returnToTownCenterButton.className = 'hud__menu-return-to-town-center';
  returnToTownCenterButton.textContent = 'RETURN TO TOWN CENTER';
  returnToTownCenterButton.addEventListener('click', () => {
    overlays.close(MENU_OVERLAY_ID);
    closeMenu();
    deps.onReturnToTownCenter();
  });

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'hud__menu-signout';
  signOutButton.textContent = 'Sign out';
  menuPanel.append(returnToTownCenterButton, signOutButton);

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

  // Bottom bar: chat slot (#44 fills this in), MAP and IGLOO. EMOTE,
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
  mapButton.addEventListener('click', () => {
    // Closing MENU first keeps one overlay open at a time (#32 D6) even
    // though the Map itself isn't wired up yet.
    overlays.close(MENU_OVERLAY_ID);
    gameEvents.emit('ui:open-map');
  });

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
    returnToTownCenterButton.hidden = roomId === SPAWN_ROOM_ID;
  }

  // Every Session starts in Town Center (#32 D3/#15), so the HUD shows that
  // title from creation rather than sitting blank until the first
  // `room:enter`.
  setRoom(SPAWN_ROOM_ID);

  const unsubscribeRoomEnter = gameEvents.on('room:enter', ({ roomId }) => setRoom(roomId));
  const unsubscribeTokens = gameEvents.on('tokens:changed', ({ balance }) => setBalance(balance));

  return {
    overlays,
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
