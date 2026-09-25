// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOverlayManager, type OverlayManager } from '../hud/overlay-manager';
import {
  createCoreValuesCard,
  CORE_VALUES_OVERLAY_ID,
  type CoreValuesCard,
} from './core-values-card';

describe('createCoreValuesCard', () => {
  let root: HTMLDivElement;
  let overlays: OverlayManager;
  let card: CoreValuesCard | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.append(root);
    overlays = createOverlayManager();
  });

  afterEach(() => {
    card?.destroy();
    card = undefined;
    overlays.destroy();
  });

  function panel(): HTMLElement {
    return root.querySelector('.core-values-card') as HTMLElement;
  }

  it('is hidden until open() is called, and shows the heading plus all four words', () => {
    card = createCoreValuesCard(root, overlays);

    expect(panel().hidden).toBe(true);

    card.open();

    expect(panel().hidden).toBe(false);
    expect(panel().textContent).toContain('CORE VALUES');
    for (const word of ['SERVE', 'GRIND', 'GROW', 'INSPIRE']) {
      expect(panel().textContent).toContain(word);
    }
  });

  it('registers with the shared OverlayManager under CORE_VALUES_OVERLAY_ID', () => {
    card = createCoreValuesCard(root, overlays);

    card.open();

    expect(overlays.current()).toBe(CORE_VALUES_OVERLAY_ID);
  });

  it('Escape (via the shared OverlayManager) closes the card', () => {
    card = createCoreValuesCard(root, overlays);
    card.open();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(panel().hidden).toBe(true);
    expect(overlays.current()).toBeNull();
  });

  it('the close button closes the card and releases the overlay', () => {
    card = createCoreValuesCard(root, overlays);
    card.open();

    (root.querySelector('.core-values-card__close') as HTMLButtonElement).click();

    expect(panel().hidden).toBe(true);
    expect(overlays.current()).toBeNull();
  });

  it('a click on the backdrop (outside the panel) closes the card', () => {
    card = createCoreValuesCard(root, overlays);
    card.open();

    panel().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(panel().hidden).toBe(true);
    expect(overlays.current()).toBeNull();
  });

  it('a click inside the dialog panel does not close the card', () => {
    card = createCoreValuesCard(root, overlays);
    card.open();

    (root.querySelector('.core-values-card__panel') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(panel().hidden).toBe(false);
    expect(overlays.current()).toBe(CORE_VALUES_OVERLAY_ID);
  });

  it('opening another overlay on the same manager closes the card', () => {
    card = createCoreValuesCard(root, overlays);
    card.open();

    overlays.open('menu', () => {});

    expect(panel().hidden).toBe(true);
  });
});
