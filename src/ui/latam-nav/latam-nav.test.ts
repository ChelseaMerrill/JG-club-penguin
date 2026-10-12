// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../../contracts';
import { createLatamNav, type LatamNav } from './latam-nav';

let nav: LatamNav | undefined;

function setup(initialRoomId: RoomId = 'town-center') {
  const root = document.createElement('div');
  document.body.append(root);
  const goToRoom = vi.fn<(roomId: RoomId) => void>();
  nav = createLatamNav(root, { goToRoom, initialRoomId });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const pillLabels = () =>
    [...root.querySelectorAll<HTMLButtonElement>('.latam-nav__pill')].map((p) => p.textContent);
  return { root, goToRoom, q, pillLabels };
}

function enter(roomId: RoomId): void {
  gameEvents.emit('room:enter', { roomId, entryTile: { col: 5, row: 9 } });
}

afterEach(() => {
  nav?.destroy();
  nav = undefined;
  document.body.replaceChildren();
});

describe('createLatamNav', () => {
  it('is hidden outside the LATAM Rooms', () => {
    const { q } = setup('town-center');
    expect(q('.latam-nav')!.hidden).toBe(true);
  });

  it('shows DISCO HALL then FUTEBOL FIELD in the LATAM Café', () => {
    const { q, pillLabels } = setup('town-center');
    enter('latam-cafe');
    expect(q('.latam-nav')!.hidden).toBe(false);
    expect(pillLabels()).toEqual(['DISCO HALL', 'FUTEBOL FIELD']);
  });

  it('shows CAFE LOUNGE then FUTEBOL FIELD in the LATAM Disco Hall', () => {
    const { pillLabels } = setup('town-center');
    enter('latam-disco-hall');
    expect(pillLabels()).toEqual(['CAFE LOUNGE', 'FUTEBOL FIELD']);
  });

  it('shows CAFE LOUNGE then DISCO HALL in the LATAM Futebol Field', () => {
    const { pillLabels } = setup('town-center');
    enter('latam-futebol-field');
    expect(pillLabels()).toEqual(['CAFE LOUNGE', 'DISCO HALL']);
  });

  it('shows itself already when booted straight into a LATAM Room', () => {
    const { q, pillLabels } = setup('latam-disco-hall');
    expect(q('.latam-nav')!.hidden).toBe(false);
    expect(pillLabels()).toEqual(['CAFE LOUNGE', 'FUTEBOL FIELD']);
  });

  it('hides again on leaving to a non-LATAM Room', () => {
    const { q } = setup('town-center');
    enter('latam-cafe');
    expect(q('.latam-nav')!.hidden).toBe(false);

    enter('town-center');
    expect(q('.latam-nav')!.hidden).toBe(true);
  });

  it("calls goToRoom with the clicked pill's Room id", () => {
    const { goToRoom } = setup('town-center');
    enter('latam-cafe');
    const discoPill = [...document.querySelectorAll<HTMLButtonElement>('.latam-nav__pill')].find(
      (p) => p.textContent === 'DISCO HALL',
    )!;

    discoPill.click();

    expect(goToRoom).toHaveBeenCalledWith('latam-disco-hall');
  });

  it('stops listening for room:enter once destroyed', () => {
    const { q } = setup('town-center');
    nav!.destroy();
    nav = undefined;

    expect(() => enter('latam-cafe')).not.toThrow();
    // The element itself is gone; nothing left to assert hidden on.
    expect(q('.latam-nav')).toBeNull();
  });
});
