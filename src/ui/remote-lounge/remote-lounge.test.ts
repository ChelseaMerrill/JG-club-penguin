// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../../contracts';
import { HQ_LOCATION, REMOTE_JGERS } from '../../game/npcs/remote-lounge-figures';
import { createOverlayManager } from '../hud/overlay-manager';
import { GLOBE_CENTER, GLOBE_RADIUS, milesBetween } from './globe';
import { createRemoteLounge, REMOTE_CARD_OVERLAY_ID, type RemoteLounge } from './remote-lounge';

let lounge: RemoteLounge | undefined;

function setup(initialRoomId: RoomId = 'remote-lounge') {
  const root = document.createElement('div');
  document.body.append(root);
  const overlays = createOverlayManager();
  const goToRoom = vi.fn<(roomId: RoomId) => void>();
  // No real map in jsdom: the globe draws its ocean and grid without it.
  const loadMap = vi.fn(() => new Promise<never>(() => {}));
  lounge = createRemoteLounge(root, { overlays, goToRoom, initialRoomId, loadMap });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  return { root, overlays, goToRoom, loadMap, q };
}

afterEach(() => {
  lounge?.destroy();
  lounge = undefined;
  document.body.replaceChildren();
});

describe('globe geometry', () => {
  it("stands the globe on the design's pedestal: centre (870, 299), radius 175", () => {
    expect(GLOBE_CENTER).toEqual([870, 299]);
    expect(GLOBE_RADIUS).toBe(175);
  });

  it('gives great-circle miles from HQ, rounded', () => {
    const jameson = REMOTE_JGERS.find((p) => p.key === 'jameson')!;
    expect(milesBetween(jameson, HQ_LOCATION)).toBe(1148);
    const vickers = REMOTE_JGERS.find((p) => p.key === 'vickers')!;
    expect(milesBetween(vickers, HQ_LOCATION)).toBeLessThan(10);
  });
});

describe('createRemoteLounge', () => {
  it('shows only in the Remote Lounge, and loads the map once', () => {
    const { q, loadMap } = setup('town-center');
    expect(q('.remote-lounge').hidden).toBe(true);
    expect(loadMap).not.toHaveBeenCalled();

    gameEvents.emit('room:enter', { roomId: 'remote-lounge', entryTile: { col: 3, row: 5 } });
    expect(q('.remote-lounge').hidden).toBe(false);
    expect(q('.globe')).not.toBeNull();

    gameEvents.emit('room:leave', { roomId: 'remote-lounge' });
    expect(q('.remote-lounge').hidden).toBe(true);
    expect(q('.globe')).toBeNull();

    gameEvents.emit('room:enter', { roomId: 'remote-lounge', entryTile: { col: 3, row: 5 } });
    expect(loadMap).toHaveBeenCalledTimes(1);
  });

  it("lists everyone in the design's order and opens a roster row's card", () => {
    const { q, root, overlays } = setup();
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.remote-lounge__roster-item')];
    expect(
      rows.map((row) => row.querySelector('.remote-lounge__roster-name')!.textContent),
    ).toEqual(REMOTE_JGERS.map((p) => p.name));

    rows[3]!.click();

    expect(q('.remote-lounge__card').hidden).toBe(false);
    expect(q('.remote-lounge__card-name').textContent).toBe('John Higgins');
    expect(q('.remote-lounge__card-title').textContent).toBe('Software Engineer');
    expect(q('.remote-lounge__card-index').textContent).toBe('4 / 17');
    expect(rows[3]!.getAttribute('aria-pressed')).toBe('true');
    expect(overlays.current()).toBe(REMOTE_CARD_OVERLAY_ID);
  });

  it('hides the title of a TITLE TBD person', () => {
    const { q, root } = setup();
    [...root.querySelectorAll<HTMLButtonElement>('.remote-lounge__roster-item')]
      .find((row) => row.textContent!.includes('Casey Snow'))!
      .click();
    expect(q('.remote-lounge__card-title').hidden).toBe(true);
  });

  it('opens the card when the Penguin reaches a remote JGer, and tells the Room when it closes', () => {
    const { q, overlays } = setup();
    const talked = vi.fn();
    const closed = vi.fn();
    const offTalked = gameEvents.on('npc:talked', talked);
    const offClosed = gameEvents.on('npc:dialog-closed', closed);

    gameEvents.emit('npc:arrived', { npcId: 'joshua-jameson' });
    expect(q('.remote-lounge__card-name').textContent).toBe('Joshua Jameson');
    expect(talked).toHaveBeenCalledWith({ npcId: 'joshua-jameson' });

    overlays.close(REMOTE_CARD_OVERLAY_ID);
    expect(q('.remote-lounge__card').hidden).toBe(true);
    expect(closed).toHaveBeenCalledWith({ npcId: 'joshua-jameson' });
    offTalked();
    offClosed();
  });

  it('ignores an HQ NPC arriving, and leaves another open overlay alone', () => {
    const { q, overlays } = setup();
    gameEvents.emit('npc:arrived', { npcId: 'casey' });
    expect(q('.remote-lounge__card').hidden).toBe(true);

    overlays.open('map', () => {});
    gameEvents.emit('npc:arrived', { npcId: 'matt-bessler' });
    expect(q('.remote-lounge__card').hidden).toBe(true);
    expect(overlays.current()).toBe('map');
  });

  it('steps through people with ◀ ▶, wrapping, and GLOBE closes the card', () => {
    const { q, root } = setup();
    root.querySelector<HTMLButtonElement>('.remote-lounge__roster-item')!.click();
    q<HTMLButtonElement>('[aria-label="Previous"]').click();
    expect(q('.remote-lounge__card-name').textContent).toBe('Chris Nyberg');
    q<HTMLButtonElement>('[aria-label="Next"]').click();
    expect(q('.remote-lounge__card-name').textContent).toBe('Matt Bessler');

    q<HTMLButtonElement>('.remote-lounge__hex--globe').click();
    expect(q('.remote-lounge__card').hidden).toBe(true);
  });

  it('BACK TO HQ goes to Town Center', () => {
    const { q, goToRoom } = setup();
    q<HTMLButtonElement>('.remote-lounge__exit').click();
    expect(goToRoom).toHaveBeenCalledWith('town-center');
  });

  it("clicking the globe's LATAM pin opens the LATAM Café (owner request, 2026-10-09)", () => {
    const { q, goToRoom } = setup();
    q<SVGGElement>('.globe__latam-pin').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(goToRoom).toHaveBeenCalledWith('latam-cafe');
  });
});

describe('the LATAM roster card (owner request, 2026-10-12)', () => {
  it('tops the roster, above every JGer, without changing the JGer rows', () => {
    const { root } = setup();
    const latamRow = root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!;
    expect(latamRow).not.toBeNull();
    expect(root.querySelector('.remote-lounge__roster')!.firstElementChild).toBe(latamRow);
    expect(latamRow.querySelector('.remote-lounge__roster-name')!.textContent).toBe('LATAM');
    expect(latamRow.querySelector('.remote-lounge__roster-city')!.textContent).toBe(
      'Rio de Janeiro, Brazil',
    );

    // A sibling class, not a JGer row: the JGer-only count and order hold.
    const jgerRows = [...root.querySelectorAll<HTMLButtonElement>('.remote-lounge__roster-item')];
    expect(jgerRows).toHaveLength(REMOTE_JGERS.length);
    expect(
      jgerRows.map((row) => row.querySelector('.remote-lounge__roster-name')!.textContent),
    ).toEqual(REMOTE_JGERS.map((p) => p.name));
  });

  it('opens a purple, index-less LATAM card with the distance from HQ and the Café line', () => {
    const { q, root, overlays } = setup();
    root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!.click();

    const card = q('.remote-lounge__card');
    expect(card.hidden).toBe(false);
    expect(card.classList.contains('remote-lounge__card--latam')).toBe(true);
    expect(q('.remote-lounge__card-name').textContent).toBe('LATAM');
    expect(card.textContent).toContain('Rio de Janeiro, Brazil');
    expect(card.textContent).toMatch(/\d+ mi/);
    expect(q('.remote-lounge__card-line').textContent).toBe(
      '19 JGers across the Café, the Disco Hall and the Futebol Field.',
    );
    expect(q('.remote-lounge__card-index').hidden).toBe(true);
    expect(q('.remote-lounge__card-title').hidden).toBe(true);
    expect(
      root
        .querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(overlays.current()).toBe(REMOTE_CARD_OVERLAY_ID);
  });

  it('has no Prev/Next, just VISIT LATAM and GLOBE', () => {
    const { q, root } = setup();
    root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!.click();

    expect(q('[aria-label="Previous"]')).toBeNull();
    expect(q('[aria-label="Next"]')).toBeNull();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.remote-lounge__hex--globe')];
    expect(buttons.map((b) => b.textContent)).toEqual(['VISIT LATAM', 'GLOBE']);
  });

  it('VISIT LATAM goes to the LATAM Café', () => {
    const { root, goToRoom } = setup();
    root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!.click();

    [...root.querySelectorAll<HTMLButtonElement>('.remote-lounge__hex--globe')]
      .find((b) => b.textContent === 'VISIT LATAM')!
      .click();
    expect(goToRoom).toHaveBeenCalledWith('latam-cafe');
  });

  it('Escape closes the LATAM card, same as a person card', () => {
    const { q, root } = setup();
    root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!.click();
    expect(q('.remote-lounge__card').hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(q('.remote-lounge__card').hidden).toBe(true);
    expect(root.querySelector('.remote-lounge__roster-latam')!.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it("selecting a JGer row after LATAM un-presses LATAM's row, and vice versa", () => {
    const { root } = setup();
    const latamRow = root.querySelector<HTMLButtonElement>('.remote-lounge__roster-latam')!;
    const firstJger = root.querySelector<HTMLButtonElement>('.remote-lounge__roster-item')!;

    latamRow.click();
    expect(latamRow.getAttribute('aria-pressed')).toBe('true');

    firstJger.click();
    expect(latamRow.getAttribute('aria-pressed')).toBe('false');
    expect(firstJger.getAttribute('aria-pressed')).toBe('true');

    latamRow.click();
    expect(firstJger.getAttribute('aria-pressed')).toBe('false');
    expect(latamRow.getAttribute('aria-pressed')).toBe('true');
  });
});
