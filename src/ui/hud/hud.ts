import {
  CHAT_TEXT_MAX,
  gameEvents,
  SPAWN_ROOM_ID,
  type EmoteId,
  type RoomId,
} from '../../contracts';
import { createEmotePicker, EMOTE_OVERLAY_ID } from './emote-picker';
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
  /** The existing `auth.signOut`. */
  onSignOut: () => void;
  /** 0 until #34's progress session loads the saved balance via `tokens:changed`. */
  initialBalance: number;
  /**
   * Sends a chat message (#44): the field itself does no trimming, cutting,
   * or rate limiting; it awaits this to decide whether to clear. Resolves
   * `true` only for an accepted, sent message; the field keeps its text on
   * `false` (e.g. rate-limited).
   */
  onChatSend: (text: string) => Promise<boolean>;
  /** Plays `emoteId` on the local Penguin and best-effort broadcasts it to the Room (#47). */
  onEmotePick: (emoteId: EmoteId) => void;
  /**
   * Asks to enter (`true`) or leave (`false`) Snowball mode (#53). The HUD
   * never flips its own mode: the caller decides, then reports the outcome
   * through `Hud.setSnowballMode`. Entering first closes MENU and is refused
   * outright (no call) while any other HUD overlay is open.
   */
  onSnowballToggle?: (on: boolean) => void;
}

export interface Hud {
  show(): void;
  hide(): void;
  destroy(): void;
  /** The one-overlay-at-a-time manager MENU registers with. Exposed so #33
   *  (Map) and #35 (Penguin Creator) can register their own overlays on the
   *  same manager instead of each building their own. */
  overlays: OverlayManager;
  /** Shows Snowball mode as on (active SNOWBALL button, mode panel) or off (#53). */
  setSnowballMode(on: boolean): void;
  /** Updates the mode panel's ammo pips and "N LEFT · REFILLS 1 / 4S" line (#53). */
  setSnowballAmmo(count: number, capacity: number): void;
}

const MENU_OVERLAY_ID = 'menu';

/** How long a toast (`ui:toast`) stays up before it auto-hides. */
const TOAST_DURATION_MS = 4000;

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

  // Bottom bar: chat field (#44), SNOWBALL (#53), MAP and IGLOO. EMOTE and
  // QUESTS stay hidden until their stretch tickets land.
  const bottomBar = document.createElement('div');
  bottomBar.className = 'hud__bottom-bar';

  const chatSlot = document.createElement('div');
  chatSlot.className = 'hud__chat-slot';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.className = 'hud__chat-input';
  chatInput.placeholder = 'Say something...';
  chatInput.maxLength = CHAT_TEXT_MAX;

  // Every keyboard event stops here: the field never lets a keystroke reach
  // a `window` listener (the overlay manager's Escape, the Minigame shell's
  // P), so typing never triggers game input or click-to-move (#44 D3).
  function stopKeyPropagation(event: KeyboardEvent): void {
    event.stopPropagation();
  }
  chatInput.addEventListener('keyup', stopKeyPropagation);
  chatInput.addEventListener('keypress', stopKeyPropagation);
  chatInput.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key !== 'Enter') return;
    // An IME composition's confirming Enter (e.g. finishing a CJK candidate)
    // must not submit; browsers that don't set `isComposing` mark it with
    // the legacy keyCode 229 instead (#44 review fix F6).
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    const text = chatInput.value;
    void deps
      .onChatSend(text)
      .then((accepted) => {
        // Only clear a field the Player hasn't since typed something new
        // into while the send was pending (#44 review fix F7).
        if (accepted && chatInput.value === text) chatInput.value = '';
      })
      .catch(() => {
        // Treat a rejected send as not accepted: keep the typed text.
      });
  });

  chatSlot.append(chatInput);

  const emoteButton = document.createElement('button');
  emoteButton.type = 'button';
  emoteButton.className = 'hud__button hud__button--bottom hud__button--emote';
  emoteButton.textContent = 'EMOTE';
  emoteButton.addEventListener('click', () => {
    // Closing MENU first keeps one overlay open at a time (#32 D6); the
    // picker itself also registers with `overlays`, so opening it closes
    // MENU too, but MENU's own panel needs its direct `closeMenu()` call
    // (matching PENGUIN/MAP's existing style above).
    overlays.close(MENU_OVERLAY_ID);
    closeMenu();
    emotePicker.toggle();
  });

  const snowballButton = document.createElement('button');
  snowballButton.type = 'button';
  snowballButton.className = 'hud__button hud__button--bottom hud__button--snowball';
  snowballButton.textContent = 'SNOWBALL';
  let snowballMode = false;
  snowballButton.addEventListener('click', () => {
    if (snowballMode) {
      deps.onSnowballToggle?.(false);
      return;
    }
    // As MAP does: MENU closes first (#32 D6). Any other overlay (Creator,
    // Minigame, Trophy Case, Market) refuses the mode outright (#53 v4 #12).
    overlays.close(MENU_OVERLAY_ID);
    closeMenu();
    if (overlays.current() !== null) return;
    deps.onSnowballToggle?.(true);
  });

  const mapButton = document.createElement('button');
  mapButton.type = 'button';
  mapButton.className = 'hud__button hud__button--bottom hud__button--map';
  mapButton.textContent = 'MAP';
  mapButton.addEventListener('click', () => {
    // Closes MENU directly (#32 D6) rather than relying on the Map (#33) to
    // do it: the Map's own `ui:open-map` handler only calls
    // `overlays.open` when a Session is active, so this is what actually
    // closes MENU on the rare click before one has started.
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

  // The toast layer (`ui:toast`, #42): shown wherever the Player is, since
  // the HUD is mounted across every Room. Producers: #34 (a save error) and
  // #42 (a Badge earned via `badge:earned`, translated in `main.ts`).
  const toastEl = document.createElement('div');
  toastEl.className = 'hud__toast';
  toastEl.hidden = true;
  toastEl.setAttribute('role', 'status');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string): void {
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastTimer = null;
    }, TOAST_DURATION_MS);
  }

  // Snowball mode's bottom-centre panel (#53, design HUD-SNOWBALL): title,
  // ammo pips, refill line and the hit hint. The design's Snowmageddon badge
  // copy is omitted (no rewards for hits). Never a widget: `pointer-events:
  // none` in style.css, so it never swallows a throw click on the canvas.
  const snowballPanel = document.createElement('div');
  snowballPanel.className = 'hud__snowball-panel';
  snowballPanel.hidden = true;
  const snowballTitle = document.createElement('div');
  snowballTitle.className = 'hud__snowball-title';
  snowballTitle.textContent = 'SNOWBALL MODE';
  const snowballAmmo = document.createElement('div');
  snowballAmmo.className = 'hud__snowball-ammo';
  const snowballPips = document.createElement('div');
  snowballPips.className = 'hud__snowball-pips';
  const snowballAmmoText = document.createElement('span');
  snowballAmmoText.className = 'hud__snowball-ammo-text';
  snowballAmmo.append(snowballPips, snowballAmmoText);
  const snowballDivider = document.createElement('div');
  snowballDivider.className = 'hud__snowball-divider';
  const snowballHint = document.createElement('div');
  snowballHint.className = 'hud__snowball-hint';
  snowballHint.textContent = 'Hit a penguin: they get a snow hat for 10s.';
  snowballPanel.append(snowballTitle, snowballAmmo, snowballDivider, snowballHint);

  function setSnowballAmmo(count: number, capacity: number): void {
    const pips: HTMLElement[] = [];
    for (let i = 0; i < capacity; i += 1) {
      const pip = document.createElement('span');
      pip.className = i < count ? 'hud__snowball-pip hud__snowball-pip--full' : 'hud__snowball-pip';
      pips.push(pip);
    }
    snowballPips.replaceChildren(...pips);
    snowballAmmoText.textContent = `${count} LEFT · REFILLS 1 / 4S`;
  }

  function setSnowballMode(on: boolean): void {
    snowballMode = on;
    snowballPanel.hidden = !on;
    snowballButton.classList.toggle('hud__button--active', on);
  }

  root.append(titleBlock, topRight, menuPanel, snowballPanel, bottomBar, toastEl);
  layer.append(root);

  const emotePicker = createEmotePicker(root, {
    overlays,
    onPick: (emoteId) => deps.onEmotePick(emoteId),
  });

  function setBalance(balance: number): void {
    tokensValue.textContent = balance.toLocaleString('en-US');
  }
  setBalance(deps.initialBalance);

  function setRoom(roomId: RoomId): void {
    const { title, subtitle } = deps.resolveRoomTitle(roomId);
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
  }

  // Every Session starts in Town Center (#32 D3/#15), so the HUD shows that
  // title from creation rather than sitting blank until the first
  // `room:enter`.
  setRoom(SPAWN_ROOM_ID);

  const unsubscribeRoomEnter = gameEvents.on('room:enter', ({ roomId }) => setRoom(roomId));
  const unsubscribeTokens = gameEvents.on('tokens:changed', ({ balance }) => setBalance(balance));
  const unsubscribeToast = gameEvents.on('ui:toast', ({ message }) => showToast(message));

  return {
    overlays,
    setSnowballMode,
    setSnowballAmmo,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      overlays.close(MENU_OVERLAY_ID);
      closeMenu();
      overlays.close(EMOTE_OVERLAY_ID);
    },
    destroy() {
      unsubscribeRoomEnter();
      unsubscribeTokens();
      unsubscribeToast();
      if (toastTimer !== null) clearTimeout(toastTimer);
      overlays.destroy();
      emotePicker.destroy();
      root.remove();
    },
  };
}
