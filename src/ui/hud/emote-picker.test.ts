// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTES } from '../../contracts';
import { createEmotePicker, EMOTE_OVERLAY_ID, type EmotePicker } from './emote-picker';
import { createOverlayManager, type OverlayManager } from './overlay-manager';

let currentPicker: EmotePicker | undefined;
let currentOverlays: OverlayManager | undefined;

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const overlays = createOverlayManager();
  const onPick = vi.fn();
  const picker = createEmotePicker(root, { overlays, onPick });
  currentPicker = picker;
  currentOverlays = overlays;
  return { root, overlays, onPick, picker };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentPicker?.destroy();
  currentOverlays?.destroy();
  currentPicker = undefined;
  currentOverlays = undefined;
});

describe('createEmotePicker', () => {
  it('is hidden until toggled open, and registers with the overlay manager', () => {
    const { root, overlays } = setup();
    const panel = () => root.querySelector('.emote-picker') as HTMLElement;

    expect(panel().hidden).toBe(true);

    currentPicker!.toggle();

    expect(panel().hidden).toBe(false);
    expect(overlays.current()).toBe(EMOTE_OVERLAY_ID);
  });

  it('toggling again closes it', () => {
    const { root } = setup();
    const panel = () => root.querySelector('.emote-picker') as HTMLElement;

    currentPicker!.toggle();
    currentPicker!.toggle();

    expect(panel().hidden).toBe(true);
  });

  it('renders one tile per EMOTES entry, in order', () => {
    const { root } = setup();
    const tiles = root.querySelectorAll('.emote-picker__tile');

    expect(tiles).toHaveLength(EMOTES.length);
    tiles.forEach((tile, index) => {
      expect((tile as HTMLElement).dataset.emote).toBe(EMOTES[index]);
    });
  });

  it('clicking a tile calls onPick with its emoteId and closes the picker', () => {
    const { root, onPick } = setup();
    currentPicker!.toggle();

    (root.querySelector('[data-emote="dance"]') as HTMLButtonElement).click();

    expect(onPick).toHaveBeenCalledWith('dance');
    expect((root.querySelector('.emote-picker') as HTMLElement).hidden).toBe(true);
  });

  it('pressing a digit key 1-8 while open picks the matching Emote in EMOTES order', () => {
    const { onPick } = setup();
    currentPicker!.toggle();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));

    expect(onPick).toHaveBeenCalledWith(EMOTES[2]);
  });

  it('a digit key does nothing while the picker is closed', () => {
    const { onPick } = setup();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('Escape (via the overlay manager) closes the picker', () => {
    const { root } = setup();
    currentPicker!.toggle();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect((root.querySelector('.emote-picker') as HTMLElement).hidden).toBe(true);
  });

  it('opening another overlay closes the picker (one overlay at a time)', () => {
    const { root, overlays } = setup();
    currentPicker!.toggle();

    const onClose = vi.fn();
    overlays.open('menu', onClose);

    expect((root.querySelector('.emote-picker') as HTMLElement).hidden).toBe(true);
  });

  it('a digit key no longer picks once the picker has been closed', () => {
    const { onPick } = setup();
    currentPicker!.toggle();
    currentPicker!.toggle();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

    expect(onPick).not.toHaveBeenCalled();
  });
});
