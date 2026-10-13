// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDoorHover, type DoorHover } from './door-hover';

let root: HTMLElement;
let hover: DoorHover;

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  hover = createDoorHover(root);
});

afterEach(() => {
  hover.destroy();
  root.remove();
});

function pill(): HTMLElement {
  return root.querySelector('.door-hover') as HTMLElement;
}

describe('createDoorHover (#170 D3)', () => {
  it('starts hidden, decorative only', () => {
    expect(pill().hidden).toBe(true);
    expect(pill().getAttribute('aria-hidden')).toBe('true');
    expect(hover.shownText()).toBeNull();
  });

  it('shows its text at the point it is given, in Stage pixels, and follows it', () => {
    hover.show({ text: 'CLICK TO ENTER · KITCHEN', point: { x: 900, y: 200 }, locked: false });
    expect(pill().hidden).toBe(false);
    expect(hover.shownText()).toBe('CLICK TO ENTER · KITCHEN');
    expect(pill().style.left).toBe('900px');
    expect(pill().style.top).toBe('200px');
    expect(pill().classList.contains('door-hover--locked')).toBe(false);

    hover.show({ text: 'CLICK TO ENTER · KITCHEN', point: { x: 910, y: 215 }, locked: false });
    expect(pill().style.left).toBe('910px');
    expect(pill().style.top).toBe('215px');
  });

  it('greys a locked door, and hides', () => {
    hover.show({ text: 'TEAM ROOM 5 · UNDER CONSTRUCTION', point: { x: 1, y: 2 }, locked: true });
    expect(pill().classList.contains('door-hover--locked')).toBe(true);
    hover.show({ text: 'UNDER CONSTRUCTION', point: { x: 1, y: 2 }, locked: true });
    expect(hover.shownText()).toBe('UNDER CONSTRUCTION');
    hover.hide();
    expect(pill().hidden).toBe(true);
    expect(hover.shownText()).toBeNull();
  });
});
