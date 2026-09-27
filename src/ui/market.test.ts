// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import type { ProgressStore } from '../persistence/progress-store';
import { createMarket, type Market } from './market';

let currentMarket: Market | undefined;

function setup(store: ProgressStore = createInMemoryProgressStore()) {
  const root = document.createElement('div');
  document.body.append(root);
  const onClose = vi.fn();
  const market = createMarket(root, { store, onClose });
  currentMarket = market;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends Element = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(selector),
  ];
  return { root, market, onClose, store, q, qa };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentMarket?.destroy();
  currentMarket = undefined;
});

describe('createMarket', () => {
  it('is hidden until opened', () => {
    const { q, market } = setup();

    expect(q('.market').hidden).toBe(true);
    expect(market.isOpen()).toBe(false);
  });

  it('renders only the IGLOO tab (CAPS, HEXLES and EMOTES are left out)', () => {
    const { qa } = setup();

    const tabs = qa<HTMLButtonElement>('.market__tab').map((b) => b.textContent);
    expect(tabs).toEqual(['IGLOO']);
  });

  it('loads the store and lists the Igloo Gear catalog with price and BUY, plus the balance', async () => {
    const { q, qa, market } = setup();

    await market.open();

    expect(q('.market').hidden).toBe(false);
    expect(q('.market__balance').textContent).toBe('BALANCE 100');

    const tiles = qa('.market__item');
    expect(tiles).toHaveLength(14);

    const beanbag = q('[data-item-id="beanbag"]');
    expect(beanbag.querySelector('.market__item-name')?.textContent).toBe('Beanbag');
    expect(beanbag.querySelector('.market__item-price-value')?.textContent).toBe('50');
    const buyButton = beanbag.querySelector<HTMLButtonElement>('.market__item-buy')!;
    expect(buyButton.textContent).toBe('BUY');
    expect(buyButton.disabled).toBe(false);
  });

  // #135 D10: wall and ceiling items say where they go; floor items don't.
  it('shows a placement line on wall and ceiling items only', async () => {
    const { q, market } = setup();

    await market.open();

    const line = (id: string) =>
      q(`[data-item-id="${id}"]`).querySelector('.market__item-placement')?.textContent;
    expect(line('jg-pennant')).toBe('Hangs on the wall');
    expect(line('rgb-light-strip')).toBe('Hangs on the wall');
    expect(line('award-inc5000')).toBe('Hangs on the wall');
    expect(line('disco-ball')).toBe('Hangs from the ceiling');
    expect(line('beanbag')).toBeUndefined();
  });

  it('shows the three JG awards with their logos at 60 tokens', async () => {
    const { q, market } = setup();

    await market.open();

    for (const [id, alt, src] of [
      ['award-bptw', 'Best Places to Work', 'awards/bptw.svg'],
      ['award-inc5000', 'Inc. 5000', 'awards/inc500.svg'],
      ['award-top-workplaces', 'Top Workplaces', 'awards/top-wp.svg'],
    ]) {
      const card = q(`[data-item-id="${id}"]`);
      const img = card.querySelector<HTMLImageElement>('.market__item-icon img')!;
      expect(img.alt).toBe(alt);
      expect(img.getAttribute('src')).toBe(src);
      expect(card.querySelector('.market__item-price-value')?.textContent).toBe('60');
    }
  });

  it('gives every catalog item a dedicated icon, never the placeholder', async () => {
    const { qa, market } = setup();

    await market.open();

    for (const icon of qa('.market__item-icon')) {
      expect(icon.classList.contains('market__icon-placeholder'), icon.dataset.artKey).toBe(false);
    }
  });

  it('shows an already-owned item as OWNED, not BUY', async () => {
    const store = createInMemoryProgressStore();
    await store.purchase('beanbag');
    const { q, market } = setup(store);

    await market.open();

    const beanbag = q('[data-item-id="beanbag"]');
    expect(beanbag.classList.contains('market__item--owned')).toBe(true);
    const buyButton = beanbag.querySelector<HTMLButtonElement>('.market__item-buy')!;
    expect(buyButton.textContent).toBe('OWNED');
    expect(buyButton.disabled).toBe(true);
  });

  it('BUY success flips the item to OWNED and updates the balance', async () => {
    const { q, market } = setup();
    await market.open();

    const beanbag = q('[data-item-id="beanbag"]');
    const buyButton = beanbag.querySelector<HTMLButtonElement>('.market__item-buy')!;
    buyButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(buyButton.textContent).toBe('OWNED');
    expect(buyButton.disabled).toBe(true);
    expect(beanbag.classList.contains('market__item--owned')).toBe(true);
    expect(q('.market__balance').textContent).toBe('BALANCE 50');
  });

  it('insufficient_tokens shows "Not enough tokens" and leaves the balance unchanged', async () => {
    const { q, market } = setup();
    await market.open();

    const arcadeCabinet = q('[data-item-id="arcade-cabinet"]');
    const buyButton = arcadeCabinet.querySelector<HTMLButtonElement>('.market__item-buy')!;
    buyButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(q('.market__error').textContent).toBe('Not enough tokens');
    expect(q('.market__balance').textContent).toBe('BALANCE 100');
    expect(buyButton.textContent).toBe('BUY');
    expect(buyButton.disabled).toBe(false);
    expect(arcadeCabinet.classList.contains('market__item--owned')).toBe(false);
  });

  it('disables BUY while a purchase is in flight so a double click cannot double-buy', async () => {
    const store = createInMemoryProgressStore();
    const purchaseSpy = vi.spyOn(store, 'purchase');
    const { q, market } = setup(store);
    await market.open();

    const beanbag = q('[data-item-id="beanbag"]');
    const buyButton = beanbag.querySelector<HTMLButtonElement>('.market__item-buy')!;

    buyButton.click();
    expect(buyButton.disabled).toBe(true);
    buyButton.click(); // A second click while the first purchase is still in flight.

    await Promise.resolve();
    await Promise.resolve();

    expect(purchaseSpy).toHaveBeenCalledTimes(1);
    expect(buyButton.textContent).toBe('OWNED');
  });

  it('the close button calls onClose, leaving Escape to the OverlayManager', async () => {
    const { q, market, onClose } = setup();
    await market.open();

    q<HTMLButtonElement>('.market__close').click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close() hides the overlay', async () => {
    const { q, market } = setup();
    await market.open();

    market.close();

    expect(q('.market').hidden).toBe(true);
    expect(market.isOpen()).toBe(false);
  });

  it('re-reads the store every time it opens', async () => {
    const store = createInMemoryProgressStore();
    const loadAllSpy = vi.spyOn(store, 'loadAll');
    const { market } = setup(store);

    await market.open();
    market.close();
    await market.open();

    expect(loadAllSpy).toHaveBeenCalledTimes(2);
  });
});
