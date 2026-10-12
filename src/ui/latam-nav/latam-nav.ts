import { gameEvents, type RoomId } from '../../contracts';
import './latam-nav.css';

/** The three LATAM Rooms this nav links between (owner request, 2026-10-09). */
type LatamRoomId = 'latam-cafe' | 'latam-disco-hall' | 'latam-futebol-field';

const LATAM_ROOM_IDS: ReadonlySet<RoomId> = new Set<RoomId>([
  'latam-cafe',
  'latam-disco-hall',
  'latam-futebol-field',
]);

function isLatamRoom(roomId: RoomId): roomId is LatamRoomId {
  return LATAM_ROOM_IDS.has(roomId);
}

/**
 * Every LATAM Room's own pill label, the design's own text
 * (`design/Latam Cafe.dc.html` and siblings' door-pill markup), in a fixed
 * order: a Room's own nav shows these two minus itself, so the Café gets
 * DISCO HALL then FUTEBOL FIELD, the Disco Hall gets CAFE LOUNGE then
 * FUTEBOL FIELD, and the Field gets CAFE LOUNGE then DISCO HALL.
 */
const LATAM_LINKS: readonly { roomId: LatamRoomId; label: string }[] = [
  { roomId: 'latam-cafe', label: 'CAFE LOUNGE' },
  { roomId: 'latam-disco-hall', label: 'DISCO HALL' },
  { roomId: 'latam-futebol-field', label: 'FUTEBOL FIELD' },
];

export interface LatamNavDeps {
  /** A Room change straight to `roomId`, the same Session-aware change the Remote Lounge's BACK TO HQ makes. */
  goToRoom: (roomId: RoomId) => void;
  initialRoomId: RoomId;
}

export interface LatamNav {
  destroy(): void;
}

/**
 * The LATAM Rooms' own nav (owner request, 2026-10-09): two small pills
 * linking a LATAM Room to its two siblings, sitting just under the HUD's
 * title/subtitle block. Shown only while the local Player is in a LATAM
 * Room (`room:enter`), replacing the door pills the exported art used to
 * bake into the bottom of each Room, which the HUD's own bottom action bar
 * covered at y≈826.
 */
export function createLatamNav(uiLayer: HTMLElement, deps: LatamNavDeps): LatamNav {
  const root = document.createElement('div');
  root.className = 'latam-nav';
  root.hidden = true;
  uiLayer.append(root);

  function render(current: LatamRoomId): void {
    root.replaceChildren(
      ...LATAM_LINKS.filter((link) => link.roomId !== current).map((link) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'latam-nav__pill';
        pill.textContent = link.label;
        pill.addEventListener('click', () => deps.goToRoom(link.roomId));
        return pill;
      }),
    );
  }

  function enterIfLatam(roomId: RoomId): void {
    if (!isLatamRoom(roomId)) {
      root.hidden = true;
      return;
    }
    render(roomId);
    root.hidden = false;
  }

  const unsubscribe = gameEvents.on('room:enter', ({ roomId }) => enterIfLatam(roomId));

  enterIfLatam(deps.initialRoomId);

  return {
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
