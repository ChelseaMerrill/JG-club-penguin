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
  spawnTile: { col: 6, row: 8 },
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
  npcSlots: [],
};
