import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

/**
 * Traced from `design/Latam Disco Hall.dc.html` ("18 · LATAM DISCO HALL"):
 * the LATAM section's dance hall, reached from the LATAM Café, not the Map
 * (#<issue> -- like `remote-lounge.ts`'s Room outside 108 State St, the
 * LATAM Rooms get no Map tile of their own).
 *
 * The design's main floor hexagon (`polygon points="800,250 1400,550 900,800
 * 300,500"`) is exactly the standard 12x10 grid's own four corners under
 * `createStandardRoomGrid()`'s `OX=800, OY=250, S=50` origin (confirmed by
 * converting each corner with `tileCornerToScreen`: `{0,0}`->(800,250),
 * `{12,0}`->(1400,550), `{12,10}`->(900,800), `{0,10}`->(300,500)) -- the
 * whole grid is the dance floor, no cut corners.
 *
 * Blocked tiles, each a grounded 3D prop's own floor-contact corner
 * (converted with `screenToTile`, the same `OX=800,OY=250,S=50`):
 *  - `{1,1}`: the right floor speaker stack (base apex at design (800,320)).
 *  - `{1,9}`: the left floor speaker stack (base apex at (395,522.5)).
 *  - `{1,6}`: the purple amp/subwoofer stack (base apex at (565,442.5)); its
 *    smaller second tier rests on top of this one, not its own floor spot.
 *  - `{9,0},{10,0},{11,0},{9,1},{10,1},{11,1}`: the DJ booth/turntable riser
 *    built into the back-right corner. Its front apex corner converts to
 *    `{11,1}`; its back corners fall at grid row -1 (against the back wall,
 *    off the playable grid), so this is the riser's on-grid footprint,
 *    approximated to whole tiles (the #51 "quarter or more" rule, applied to
 *    a wedge rather than a straight-sided box).
 *  - Each of the six dancers' own tile (`npcSlots` below), per convention.
 * The mirror ball (`circle cx="850" cy="355"`) hangs from the ceiling, like
 * the Igloo's Disco Ball (#135): decorative, not a floor obstacle. The
 * confetti sparkles, the flashing dance-floor tile colours and the DJ
 * booth's own turntable/equaliser animation are all likewise decorative, not
 * obstacles.
 */
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, false, false, false],
  [true, false, true, true, true, true, true, true, true, false, false, false],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, true, true, false, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, false, true, true, true],
  [true, true, true, true, false, true, true, true, true, true, true, true],
  [true, false, true, false, true, true, true, false, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, true, true, true, true, true, true, true, true, true, true],
];

export const latamDiscoHall: RoomDefinition = {
  id: 'latam-disco-hall',
  // The breadcrumb's own "18 · LATAM DISCO HALL"; this design draws no
  // separate title/subtitle HUD banner on the Stage itself (unlike the HQ
  // Rooms) -- only this breadcrumb (which sits above, outside, the exported
  // Stage) and the DJ booth's own in-world neon sign.
  title: 'LATAM DISCO HALL',
  // The DJ booth's own neon sign, its second line ("· SALÃO LATAM ·").
  // Judgment call: the design gives this Room no HUD subtitle banner to take
  // verbatim, unlike every HQ Room, so this is the closest design-sourced
  // text naming the Room.
  subtitle: 'SALÃO LATAM',
  background: { kind: 'image', key: 'room-latam-disco-hall', url: 'rooms/latam-disco-hall.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  // Open floor near the front-centre of the dance floor, clear of every
  // dancer and every blocked prop tile.
  spawnTile: { col: 5, row: 7 },
  // The design's own bottom exit-pill bar (MAP, CAFE LOUNGE, FUTEBOL FIELD)
  // and its `RoomDoor` hotspots are gone (owner request, 2026-10-09): that
  // bar sat at y≈826, exactly where the HUD's own bottom action bar covers
  // it, and is hidden from the exported art now too
  // (`scripts/export-room-art.ts`). The HUD's own MAP button already opens
  // the Map; `src/ui/latam-nav/latam-nav.ts` links the two sibling LATAM
  // Rooms as small pills under the HUD's title instead.
  doors: [],
  // The six JGers from `design/Characters LATAM.dc.html` whose card reads
  // "LATAM Disco Hall", at the Room design's own `translate(x y)` points,
  // converted to tile + offset with `screenToTile`/`tileToScreen`
  // (`OX=800,OY=250,S=50`): e.g. Lucas Varani's (780,410) falls inside tile
  // `{3,3}` (centre (800,425)), 20px left and 15px up of its centre.
  npcSlots: [
    { npcId: 'lucas-varani', tile: { col: 3, row: 3 }, offset: { x: -20, y: -15 } },
    { npcId: 'hector-grecco', tile: { col: 6, row: 3 }, offset: { x: 20, y: -5 } },
    { npcId: 'jose-acosta', tile: { col: 4, row: 5 }, offset: { x: 30, y: 0 } },
    { npcId: 'fernando-possebon', tile: { col: 3, row: 6 }, offset: { x: -10, y: 0 } },
    { npcId: 'fernando-garagnani', tile: { col: 8, row: 4 }, offset: { x: 10, y: 0 } },
    { npcId: 'ricardo-cordeiro', tile: { col: 7, row: 6 }, offset: { x: 5, y: -7.5 } },
  ],
};
