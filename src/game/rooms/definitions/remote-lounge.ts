import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { townCenter } from './town-center';

// `design/Remote Area.html` draws its room shell with the same isolib grid
// as the HQ Rooms (`S=50, OX=800, OY=250, W=12, D=10`): the standard 12x10
// grid.
//
// The only fixture on the floor is the hex pedestal the globe stands on,
// centred at (6.2, 4.8) with radius 1.5: its vertical sides sit at cols 4.9
// and 7.5 and its points at rows 3.3 and 6.3. A tile is blocked where the
// pedestal covers a quarter or more of it (the Bathroom's rule), which is
// (5-6, 3), (5-7, 4) and (5-7, 5). Col 4 (a 0.1-wide sliver), (7, 3) and
// row 6 stay walkable.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, false, false, true, true, true, true, true],
  [true, true, true, true, true, false, false, false, true, true, true, true],
  [true, true, true, true, true, false, false, false, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Remote Area.html` ("16 · REMOTE LOUNGE"): where the
 * JGers who work outside HQ hang out. No HQ Room has a door into it, so it is
 * reached only from the Map, like the Bathroom. Its one way out is the
 * design's blinking "BACK TO HQ ↘" pill, kept in the exported art and made a
 * door to Town Center; the hotspot is the pill's own box, measured from the
 * design (it has no wall door).
 */
export const remoteLounge: RoomDefinition = {
  id: 'remote-lounge',
  title: 'THE REMOTE LOUNGE',
  // The banner's "JGERS OUTSIDE HQ · 6 ON THE GLOBE · CLICK ANYONE TO FLY
  // THERE", minus its live count and the globe instruction (the globe is not
  // built yet).
  subtitle: 'JGERS OUTSIDE HQ',
  background: { kind: 'image', key: 'room-remote-lounge', url: 'rooms/remote-lounge.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  // A clear tile left of the pedestal: the design draws no "You", and the
  // open front floor is where its people stand.
  spawnTile: { col: 3, row: 5 },
  doors: [
    {
      label: 'BACK TO HQ',
      hotspot: { x: 1439, y: 748, width: 125, height: 40 },
      targetRoomId: 'town-center',
      // Town Center draws no door back here, so this lands on Town Center's
      // own spawn tile, as the Igloo's TOWN CENTER door does (#16 fix 4).
      entryTile: townCenter.spawnTile,
    },
  ],
  // The design's remote JGers, at its own `spots` (grid units, the figure's
  // feet), in its list order. Each is on the nearest walkable tile clear of
  // the pedestal, the spawn tile and the others, with `offset` the Stage px
  // from that tile's point to the design's spot. Millie's spot (5, 10)
  // shares its nearest tile with Austin's, so she takes the one beside it.
  npcSlots: [
    { npcId: 'matt-bessler', tile: { col: 1, row: 4 }, offset: { x: -20, y: -15 } },
    { npcId: 'cameron-lynch', tile: { col: 2, row: 7 }, offset: { x: -10, y: 0 } },
    { npcId: 'austin-marcum', tile: { col: 5, row: 9 }, offset: { x: 30, y: -10 } },
    { npcId: 'matt-anderson', tile: { col: 8, row: 8 }, offset: { x: -30, y: 0 } },
    { npcId: 'john-higgins', tile: { col: 10, row: 6 }, offset: { x: -20, y: -5 } },
    { npcId: 'paul-macfarlane', tile: { col: 10, row: 3 }, offset: { x: 10, y: -10 } },
    { npcId: 'dani-milliken', tile: { col: 0, row: 8 }, offset: { x: 10, y: 10 } },
    { npcId: 'ethan-schoen', tile: { col: 11, row: 1 }, offset: { x: 0, y: -25 } },
    { npcId: 'steven-remote-lounge', tile: { col: 11, row: 6 }, offset: { x: 20, y: -5 } },
    { npcId: 'tommy-kneeland', tile: { col: 8, row: 9 }, offset: { x: -50, y: 0 } },
    { npcId: 'casey-remote-lounge', tile: { col: 8, row: 0 }, offset: { x: 10, y: -10 } },
    { npcId: 'steven-vickers', tile: { col: 9, row: 8 }, offset: { x: 40, y: -5 } },
    { npcId: 'millie-remote-lounge', tile: { col: 4, row: 9 }, offset: { x: 0, y: 25 } },
    { npcId: 'michael-shirk', tile: { col: 6, row: 0 }, offset: { x: 30, y: -10 } },
    { npcId: 'matthew-wonkovich', tile: { col: 11, row: 0 }, offset: { x: 50, y: 0 } },
    { npcId: 'joshua-jameson', tile: { col: 0, row: 4 }, offset: { x: -30, y: -10 } },
  ],
};
