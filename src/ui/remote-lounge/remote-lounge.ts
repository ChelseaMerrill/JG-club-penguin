import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { gameEvents, type RoomId } from '../../contracts';
import { renderCardFigure } from '../../game/npcs/card-figures';
import { HQ_LOCATION, REMOTE_JGERS } from '../../game/npcs/remote-lounge-figures';
import { getNpcDefinition } from '../../npcs/npcs';
import { REMOTE_LOUNGE_NPC_IDS } from '../../npcs/remote-lounge-npcs';
import type { OverlayManager } from '../hud/overlay-manager';
import {
  createGlobe,
  LATAM_PIN_SHAPES,
  milesBetween,
  RIO_LOCATION,
  type Globe,
  type GlobeMap,
} from './globe';
import './remote-lounge.css';

/** The person card's `OverlayManager` id: Escape and any other overlay close it. */
export const REMOTE_CARD_OVERLAY_ID = 'remote-lounge-card';

const ROOM: RoomId = 'remote-lounge';

/** The LATAM roster card's line (owner request, 2026-10-12), in place of a person's quote. */
const LATAM_LINE = '19 JGers across the Café, the Disco Hall and the Futebol Field.';

/** Each person's NPC id, in the design's own order (the roster's and the card's ◀ ▶ order). */
const NPC_IDS: readonly string[] = REMOTE_JGERS.map(
  (p) => REMOTE_LOUNGE_NPC_IDS[p.key as keyof typeof REMOTE_LOUNGE_NPC_IDS],
);

export interface RemoteLoungeDeps {
  overlays: OverlayManager;
  /** Leaves through BACK TO HQ: a Room change straight to `roomId`, as the Map makes one. */
  goToRoom: (roomId: RoomId) => void;
  initialRoomId: RoomId;
  /** Mounted just before this element (the HUD's), so the HUD paints over everything but the card. */
  mountBefore?: Element | null;
  /** Loads the globe's land and US state borders. Injectable for tests. */
  loadMap?: () => Promise<GlobeMap>;
}

export interface RemoteLounge {
  destroy(): void;
}

/** The world's land (110m) and the US state borders (10m), loaded on first entry. */
async function loadWorldMap(): Promise<GlobeMap> {
  const [world, us] = await Promise.all([
    import('world-atlas/land-110m.json'),
    import('us-atlas/states-10m.json'),
  ]);
  const worldTopo = (world.default ?? world) as unknown as Topology;
  const usTopo = (us.default ?? us) as unknown as Topology;
  return {
    land: feature(worldTopo, worldTopo.objects.land as GeometryCollection),
    borders: mesh(usTopo, usTopo.objects.states as GeometryCollection, (a, b) => a !== b),
  };
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function avatar(
  card: (typeof REMOTE_JGERS)[number]['card'],
  uid: string,
  viewBox: string,
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = renderCardFigure(card, uid);
  return svg;
}

/** A small version of the globe's own LATAM pin marker (`LATAM_PIN_SHAPES`),
 *  in place of a face, for the LATAM roster row and card. */
function latamMark(viewBox: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<g>${LATAM_PIN_SHAPES}</g>`;
  return svg;
}

/**
 * The Remote Lounge's live layer (`design/Remote Area.html`): the globe on
 * the pedestal, the roster of remote JGers down the left, the person card on
 * the right, and the blinking BACK TO HQ pill. Shown only while the local
 * Penguin is in the Remote Lounge.
 *
 * Choosing someone (their roster row, their globe pin, or walking up to
 * their figure in the Room, `npc:arrived`) flies the globe to their city and
 * opens their card; GLOBE, Escape or leaving closes it and the globe spins
 * again. The card is an `OverlayManager` overlay like the NPC dialog, which
 * these NPCs never open.
 */
export function createRemoteLounge(uiLayer: HTMLElement, deps: RemoteLoungeDeps): RemoteLounge {
  const root = document.createElement('div');
  root.className = 'remote-lounge';
  root.hidden = true;
  uiLayer.insertBefore(root, deps.mountBefore ?? null);

  const globeLayer = document.createElement('div');
  globeLayer.className = 'remote-lounge__globe';

  const roster = document.createElement('div');
  roster.className = 'remote-lounge__roster';
  roster.setAttribute('role', 'list');
  roster.setAttribute('aria-label', 'Remote JGers');
  // The LATAM roster card (owner request, 2026-10-12): the roster's first
  // row, above every JGer. A sibling of `.remote-lounge__roster-item`, not
  // one of them, so the JGer rows' own order, count and `n / N` indices
  // (and the JGer-only tests pinning them) are unaffected.
  const latamRow = document.createElement('button');
  latamRow.type = 'button';
  latamRow.className = 'remote-lounge__roster-latam';
  latamRow.setAttribute('role', 'listitem');
  latamRow.setAttribute('aria-pressed', 'false');
  const latamFace = latamMark('-16 -16 32 32');
  latamFace.classList.add('remote-lounge__roster-face');
  const latamText = document.createElement('span');
  latamText.className = 'remote-lounge__roster-text';
  const latamName = document.createElement('span');
  latamName.className = 'remote-lounge__roster-name';
  latamName.textContent = 'LATAM';
  const latamCity = document.createElement('span');
  latamCity.className = 'remote-lounge__roster-city';
  latamCity.textContent = 'Rio de Janeiro, Brazil';
  latamText.append(latamName, latamCity);
  latamRow.append(latamFace, latamText);
  latamRow.addEventListener('click', () => selectLatam());
  roster.appendChild(latamRow);
  const rosterButtons = REMOTE_JGERS.map((person, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'remote-lounge__roster-item';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-pressed', 'false');
    const face = avatar(person.card, `remote-roster-${person.key}`, '22 6 76 70');
    face.classList.add('remote-lounge__roster-face');
    const text = document.createElement('span');
    text.className = 'remote-lounge__roster-text';
    const name = document.createElement('span');
    name.className = 'remote-lounge__roster-name';
    name.textContent = person.name;
    const city = document.createElement('span');
    city.className = 'remote-lounge__roster-city';
    city.textContent = person.city;
    text.append(name, city);
    b.append(face, text);
    b.addEventListener('click', () => select(i));
    roster.appendChild(b);
    return b;
  });

  const card = document.createElement('div');
  card.className = 'remote-lounge__card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Remote JGer');
  const cardHead = document.createElement('div');
  cardHead.className = 'remote-lounge__card-head';
  const cardKicker = document.createElement('span');
  const cardIndex = document.createElement('span');
  cardIndex.className = 'remote-lounge__card-index';
  cardHead.append(cardKicker, cardIndex);
  const cardWho = document.createElement('div');
  cardWho.className = 'remote-lounge__card-who';
  const cardFace = document.createElement('div');
  cardFace.className = 'remote-lounge__card-face';
  const cardNames = document.createElement('div');
  cardNames.className = 'remote-lounge__card-names';
  const cardName = document.createElement('div');
  cardName.className = 'remote-lounge__card-name';
  const cardTitle = document.createElement('div');
  cardTitle.className = 'remote-lounge__card-title';
  cardNames.append(cardName, cardTitle);
  cardWho.append(cardFace, cardNames);
  const facts = document.createElement('div');
  facts.className = 'remote-lounge__card-facts';
  const fact = (label: string) => {
    const row = document.createElement('div');
    row.className = 'remote-lounge__card-fact';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('span');
    row.append(k, v);
    facts.appendChild(row);
    return v;
  };
  const cardCity = fact('Based in');
  const cardDistance = fact('From HQ');
  const cardLine = document.createElement('div');
  cardLine.className = 'remote-lounge__card-line';
  const cardButtons = document.createElement('div');
  cardButtons.className = 'remote-lounge__card-buttons';
  const count = REMOTE_JGERS.length;
  const prevButton = button('remote-lounge__hex remote-lounge__hex--step', '◀', () =>
    select((selected - 1 + count) % count),
  );
  prevButton.setAttribute('aria-label', 'Previous');
  const nextButton = button('remote-lounge__hex remote-lounge__hex--step', '▶', () =>
    select((selected + 1) % count),
  );
  nextButton.setAttribute('aria-label', 'Next');
  const globeButton = button('remote-lounge__hex remote-lounge__hex--globe', 'GLOBE', () =>
    deps.overlays.close(REMOTE_CARD_OVERLAY_ID),
  );
  // LATAM has no Prev/Next (its card has no index among 17 JGers to step
  // through): VISIT LATAM takes the stepper's place and reuses GLOBE's own
  // close behaviour, same as a person card's.
  const visitButton = button('remote-lounge__hex remote-lounge__hex--globe', 'VISIT LATAM', () =>
    deps.goToRoom('latam-cafe'),
  );
  card.append(cardHead, cardWho, facts, cardLine, cardButtons);

  const exit = button('remote-lounge__exit', 'BACK TO HQ ↘', () => deps.goToRoom('town-center'));

  root.append(globeLayer, roster, card, exit);

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let globe: Globe | null = null;
  let map: GlobeMap | null = null;
  let mapRequested = false;
  let selected = -1;
  /** The NPC whose figure opened the card, told `npc:dialog-closed` when it closes. */
  let talkingNpcId: string | null = null;

  function showCard(i: number): void {
    const person = REMOTE_JGERS[i]!;
    const npc = getNpcDefinition(NPC_IDS[i]!);
    card.classList.remove('remote-lounge__card--latam');
    cardKicker.textContent = 'REMOTE JGER';
    cardIndex.hidden = false;
    cardIndex.textContent = `${i + 1} / ${count}`;
    cardFace.replaceChildren(avatar(person.card, `remote-card-${person.key}`, '0 0 120 130'));
    cardName.textContent = person.name;
    // The Characters sheet's TITLE TBD people show no title (`remote-lounge-npcs.ts`).
    cardTitle.textContent = npc?.title ?? '';
    cardTitle.hidden = !npc?.title;
    cardCity.textContent = person.city;
    cardDistance.textContent = `${milesBetween(person, HQ_LOCATION)} mi`;
    cardLine.textContent = person.line;
    cardButtons.replaceChildren(prevButton, globeButton, nextButton);
    card.hidden = false;
  }

  /** The LATAM roster card (owner request, 2026-10-12): purple-outlined,
   *  with no Prev/Next or `n / N` index among the 17 JGers, and VISIT LATAM
   *  in their place. */
  function showLatamCard(): void {
    card.classList.add('remote-lounge__card--latam');
    cardKicker.textContent = 'LATAM';
    cardIndex.hidden = true;
    cardIndex.textContent = '';
    cardFace.replaceChildren(latamMark('-16 -16 32 32'));
    cardName.textContent = 'LATAM';
    cardTitle.textContent = '';
    cardTitle.hidden = true;
    cardCity.textContent = 'Rio de Janeiro, Brazil';
    cardDistance.textContent = `${milesBetween(RIO_LOCATION, HQ_LOCATION)} mi`;
    cardLine.textContent = LATAM_LINE;
    cardButtons.replaceChildren(visitButton, globeButton);
    card.hidden = false;
  }

  function closeCard(): void {
    card.hidden = true;
    card.classList.remove('remote-lounge__card--latam');
    selected = -1;
    rosterButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    latamRow.setAttribute('aria-pressed', 'false');
    globe?.world();
    if (talkingNpcId) {
      gameEvents.emit('npc:dialog-closed', { npcId: talkingNpcId });
      talkingNpcId = null;
    }
  }

  function select(i: number): void {
    selected = i;
    rosterButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    latamRow.setAttribute('aria-pressed', 'false');
    globe?.flyTo(i);
    showCard(i);
    deps.overlays.open(REMOTE_CARD_OVERLAY_ID, closeCard);
  }

  function selectLatam(): void {
    selected = -1;
    rosterButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    latamRow.setAttribute('aria-pressed', 'true');
    globe?.flyToLocation(RIO_LOCATION.lon, RIO_LOCATION.lat);
    showLatamCard();
    deps.overlays.open(REMOTE_CARD_OVERLAY_ID, closeCard);
  }

  function enter(): void {
    root.hidden = false;
    if (!globe) {
      globe = createGlobe(HQ_LOCATION, REMOTE_JGERS, {
        onPinClick: select,
        // The LATAM pin (owner request, 2026-10-09): straight to the LATAM
        // Café, the same Room change BACK TO HQ makes, not `flyTo`/a card.
        onLatamPinClick: () => deps.goToRoom('latam-cafe'),
        reducedMotion,
      });
      globeLayer.appendChild(globe.element);
      if (map) globe.setMap(map);
    }
    if (!mapRequested) {
      mapRequested = true;
      (deps.loadMap ?? loadWorldMap)()
        .then((loaded) => {
          map = loaded;
          globe?.setMap(loaded);
        })
        .catch((error: unknown) => {
          // The globe still spins with its ocean and grid; only the land is missing.
          console.error('Remote Lounge: could not load the globe map', error);
          mapRequested = false;
        });
    }
  }

  function leave(): void {
    deps.overlays.close(REMOTE_CARD_OVERLAY_ID);
    globe?.destroy();
    globe = null;
    root.hidden = true;
  }

  const unsubscribeEnter = gameEvents.on('room:enter', ({ roomId }) => {
    if (roomId === ROOM) enter();
  });
  const unsubscribeLeave = gameEvents.on('room:leave', ({ roomId }) => {
    if (roomId === ROOM) leave();
  });
  const unsubscribeArrived = gameEvents.on('npc:arrived', ({ npcId }) => {
    const i = NPC_IDS.indexOf(npcId);
    if (i < 0 || root.hidden) return;
    const current = deps.overlays.current();
    if (current !== null && current !== REMOTE_CARD_OVERLAY_ID) return;
    if (talkingNpcId && talkingNpcId !== npcId) {
      gameEvents.emit('npc:dialog-closed', { npcId: talkingNpcId });
    }
    select(i);
    if (talkingNpcId !== npcId) {
      talkingNpcId = npcId;
      gameEvents.emit('npc:talked', { npcId });
    }
  });

  if (deps.initialRoomId === ROOM) enter();

  return {
    destroy() {
      unsubscribeEnter();
      unsubscribeLeave();
      unsubscribeArrived();
      globe?.destroy();
      root.remove();
    },
  };
}
