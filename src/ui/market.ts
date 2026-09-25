import {
  ProgressStoreError,
  type ProgressStore,
  type ShopItem,
} from '../persistence/progress-store';
import './market.css';

/** The id `main.ts` registers this overlay with on `hud.overlays`. */
export const MARKET_OVERLAY_ID = 'market';

/** The one stall this build's catalog serves (CONTEXT.md's "Igloo Gear stall"). */
const IGLOO_GEAR_STALL = 'igloo';

export interface MarketOptions {
  store: Pick<ProgressStore, 'loadAll' | 'purchase'>;
  /** The ✕ button; the caller also closes this via `hud.overlays` (Escape/another overlay opening). */
  onClose: () => void;
}

export interface Market {
  /**
   * Shows the overlay on the IGLOO tab and reloads `store.loadAll()` so the
   * catalog, owned items and balance are always current (following
   * `trophy-case.ts`'s pattern: no live update, so every open is a fresh
   * read). Exposed as its own public method, rather than folded into the
   * hotspot handler that calls it, so #36's Casey dialog can also open this
   * same panel once that NPC Interaction lands.
   */
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

/** Formats a Token amount the way the HUD does (`hud.ts`'s `setBalance`). */
function formatTokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** A single `market__icon-bar` sized like the design's Igloo Starter Kit bars. */
function bar(widthPx: number, heightPx: number, modifier: string): HTMLElement {
  const node = el('div', `market__icon-bar market__icon-bar--${modifier}`);
  node.style.width = `${widthPx}px`;
  node.style.height = `${heightPx}px`;
  return node;
}

/**
 * Builds each catalog item's art from simple flat shapes, reusing the visual
 * vocabulary of the Penguin Creator's "IGLOO STARTER KIT" tiles (three bars
 * of varying height/color, `design/Penguin Creator.dc.html`) for the
 * furniture that reads naturally as a bar (Desk, Speakers, Dual Monitors),
 * and a bespoke flat shape for the rest -- there is no dedicated art asset
 * for any of these seven items yet.
 */
const ITEM_ICON_BUILDERS: Record<string, (icon: HTMLElement) => void> = {
  beanbag: (icon) => icon.append(el('div', 'market__icon-beanbag')),
  'rgb-light-strip': (icon) => icon.append(el('div', 'market__icon-strip')),
  desk: (icon) => icon.append(bar(46, 14, 'desk')),
  speakers: (icon) => icon.append(bar(14, 34, 'speaker'), bar(14, 34, 'speaker')),
  'dual-monitors': (icon) => icon.append(bar(20, 26, 'monitor'), bar(20, 26, 'monitor')),
  'disco-ball': (icon) => icon.append(el('div', 'market__icon-disco')),
  'arcade-cabinet': (icon) => icon.append(el('div', 'market__icon-cabinet')),
};

function buildIcon(artKey: string): HTMLElement {
  const icon = el('div', 'market__item-icon');
  icon.dataset.artKey = artKey;
  const buildParts = ITEM_ICON_BUILDERS[artKey];
  if (buildParts) {
    buildParts(icon);
  } else {
    icon.classList.add('market__icon-placeholder');
  }
  return icon;
}

/**
 * Mounts the Market panel (design: `design/Room 05 Roof Deck.dc.html`'s
 * MARKET panel, "MARKETPLACE · SPEND YOUR TOKENS") into `root` (the `#ui`
 * layer) as a full-Stage DOM overlay, hidden until `open()`, following
 * `trophy-case.ts`'s pattern: this module only renders itself and reads/
 * writes through `options.store`; the caller (`main.ts`) registers it with
 * the HUD's `OverlayManager` so Escape closes it and it closes any other
 * open overlay first.
 *
 * The design's panel has four tabs (CAPS, HEXLES, IGLOO, EMOTES); this
 * build's catalog and `ProgressStore` only carry Furniture for the Igloo
 * Gear stall, so only the IGLOO tab is rendered at all (#40 resolved
 * decision: the other three are left out, not shown disabled).
 */
export function createMarket(root: HTMLElement, options: MarketOptions): Market {
  const overlay = el('div', 'market');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'market-title');

  const frame = el('div', 'market__frame');

  const header = el('div', 'market__header');
  const titleBlock = el('div', 'market__title-block');
  const title = el('div', 'market__title', 'MARKET');
  title.id = 'market-title';
  const subtitle = el('div', 'market__subtitle', 'TALK TO A VENDOR TO OPEN');
  titleBlock.append(title, subtitle);
  const closeButton = button('market__close', '✕');
  closeButton.setAttribute('aria-label', 'Close Market');
  closeButton.addEventListener('click', () => options.onClose());
  header.append(titleBlock, closeButton);

  const tabsRow = el('div', 'market__tabs');
  tabsRow.setAttribute('role', 'tablist');
  const iglooTab = button('market__tab', 'IGLOO');
  iglooTab.dataset.tab = 'igloo';
  iglooTab.setAttribute('role', 'tab');
  iglooTab.setAttribute('aria-pressed', 'true');
  tabsRow.append(iglooTab);

  const grid = el('div', 'market__items');
  grid.dataset.panel = 'igloo';

  const errorEl = el('p', 'market__error');
  errorEl.setAttribute('role', 'alert');

  const footer = el('div', 'market__footer');
  const balanceEl = el('div', 'market__balance');
  const hint = el('div', 'market__hint', 'EARN TOKENS FROM MINIGAME ROUNDS');
  footer.append(balanceEl, hint);

  const body = el('div', 'market__body');
  body.append(grid, errorEl, footer);

  frame.append(header, tabsRow, body);
  overlay.append(frame);
  root.append(overlay);

  function setBalance(tokens: number): void {
    balanceEl.textContent = `BALANCE ${formatTokens(tokens)}`;
  }
  setBalance(0);

  function setError(message: string): void {
    errorEl.textContent = message;
  }

  function applyOwned(tileEl: HTMLElement, buyButton: HTMLButtonElement, owned: boolean): void {
    tileEl.classList.toggle('market__item--owned', owned);
    buyButton.textContent = owned ? 'OWNED' : 'BUY';
    buyButton.classList.toggle('market__item-buy--owned', owned);
    buyButton.disabled = owned;
  }

  async function handleBuy(
    item: ShopItem,
    tileEl: HTMLElement,
    buyButton: HTMLButtonElement,
  ): Promise<void> {
    // Disabled synchronously, before the `await` below ever yields, so a
    // double click can't fire a second `purchase` call.
    buyButton.disabled = true;
    setError('');
    try {
      const result = await options.store.purchase(item.id);
      if (overlay.hidden) return; // Closed again before `purchase` resolved.
      setBalance(result.balance);
      applyOwned(tileEl, buyButton, true);
    } catch (error) {
      if (overlay.hidden) return;
      if (error instanceof ProgressStoreError && error.code === 'already_owned') {
        applyOwned(tileEl, buyButton, true);
        return;
      }
      if (error instanceof ProgressStoreError && error.code === 'insufficient_tokens') {
        setError('Not enough tokens');
      } else {
        setError("Couldn't complete purchase. Try again.");
      }
      buyButton.disabled = false;
    }
  }

  function renderCatalog(catalog: readonly ShopItem[], ownedItems: readonly string[]): void {
    grid.replaceChildren();
    for (const item of catalog) {
      const tileEl = el('div', 'market__item');
      tileEl.dataset.itemId = item.id;

      const icon = buildIcon(item.artKey);
      const name = el('div', 'market__item-name', item.name);

      const priceRow = el('div', 'market__item-price-row');
      const priceEl = el('div', 'market__item-price');
      const priceIcon = el('span', 'market__item-price-icon');
      const priceValue = el('span', 'market__item-price-value', formatTokens(item.price));
      priceEl.append(priceIcon, priceValue);

      const buyButton = button('market__item-buy');
      buyButton.addEventListener('click', () => void handleBuy(item, tileEl, buyButton));

      priceRow.append(priceEl, buyButton);
      tileEl.append(icon, name, priceRow);
      grid.append(tileEl);

      applyOwned(tileEl, buyButton, ownedItems.includes(item.id));
    }
  }

  return {
    async open() {
      overlay.hidden = false;
      setError('');
      const snapshot = await options.store.loadAll();
      if (overlay.hidden) return; // Closed again before `loadAll` resolved.
      setBalance(snapshot.tokens);
      renderCatalog(
        snapshot.catalog.filter((item) => item.stall === IGLOO_GEAR_STALL),
        snapshot.ownedItems,
      );
    },
    close() {
      overlay.hidden = true;
    },
    isOpen: () => !overlay.hidden,
    destroy() {
      overlay.remove();
    },
  };
}
