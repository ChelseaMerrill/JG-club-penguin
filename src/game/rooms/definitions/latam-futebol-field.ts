import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// `design/Latam Futebol Field.dc.html` draws its pitch on the same isolib
// grid as every HQ Room (`S=50, OX=800, OY=250`): its green floor diamond's
// four corners -- (800,250), (1400,550), (900,800), (300,500) -- invert
// exactly to tile (0,0), (12,0), (12,10) and (0,10), the standard 12x10 grid
// (`grid.ts`'s `createStandardRoomGrid`).
//
// Two goals sit inside the pitch, each a frame of two posts and a crossbar
// (`<line>`s, not the design's unrelated orange training cones): the left
// goal's posts invert to (col 1.7, row 4.25) and (col 1.7, row 6.85), its net
// reaching back to col 0.4; the right goal mirrors it at col 11.4/10.1, same
// rows. Each tile a quarter or more of that footprint covers is blocked:
// cols 0-1, rows 4-6 for the left goal, cols 10-11, rows 4-6 for the right.
// Every NPC's own tile (see `npcSlots` below) is additionally blocked, per
// convention. The crowd stands flanking the pitch's two back edges are this
// Room's walls (the row=0 and col=0 faces), not floor fixtures, so they
// block nothing; the four training cones and three corner-kick flags are
// flat floor decoration well under a quarter of their tile.
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, false, true, true, true, true, true],
  [true, true, true, false, false, true, true, true, true, true, true, true],
  [false, false, true, true, true, true, true, true, true, false, false, false],
  [false, false, true, true, true, true, true, true, true, true, false, false],
  [false, false, true, true, true, true, true, true, true, true, false, false],
  [true, true, true, false, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, false, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Latam Futebol Field.dc.html` ("17 · LATAM FUTEBOL
 * FIELD"). No HQ Room draws a door to it -- it is reached from the LATAM
 * Cafe, not the Map (owner request, 2026-10-09) -- so it has no
 * `map-rooms.ts` tile either. Its own three exit pills, in the design's own
 * bottom-of-stage row ("MAP" / "CAFE LOUNGE" / "DISCO HALL"), are measured
 * from the live design (`measure-pills` scratch script, not checked in):
 * MAP opens the Map screen, which this codebase already wires globally at
 * the HUD level (`main.ts`'s `createMapScreen`, self-wiring the HUD's own
 * MAP button) rather than through any `RoomDoor`/`RoomHotspot` -- there is no
 * door/hotspot mechanism that opens it, so it is left out of `doors` here
 * (reported, not invented). CAFE LOUNGE and DISCO HALL lead to those
 * sibling LATAM Rooms.
 *
 * The design's six LATAM JGers (`design/Characters LATAM.dc.html`) each walk
 * a ping-pong path of the open pitch (`src/npcs/npcs.ts`,
 * `src/npcs/motions/latam-futebol-field.ts`). The "KICK IT · PENALTY
 * SHOOTOUT" ball-icon link to `Minigame Penalty Kick.dc.html` is not wired
 * up: the Penalty Kick minigame itself isn't built yet (follow-up).
 */
export const latamFutebolField: RoomDefinition = {
  id: 'latam-futebol-field',
  title: 'LATAM FUTEBOL FIELD',
  // The design draws no in-canvas HUD title/subtitle banner at all (unlike
  // every indoor HQ Room) -- its only text is the breadcrumb (page chrome
  // outside the exported Stage) and the match scoreboard's "LATAM 3 — 2 HQ" /
  // "67:12 · SEGUNDO TEMPO", a fabricated live score/clock (#16 D2's rule),
  // so this subtitle names the scoreboard's own two teams without the live
  // numbers.
  subtitle: 'LATAM VS HQ PICKUP MATCH',
  background: {
    kind: 'image',
    key: 'room-latam-futebol-field',
    url: 'rooms/latam-futebol-field.png',
  },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  // Open floor at the pitch's near-middle, clear of every NPC and both goals.
  spawnTile: { col: 6, row: 8 },
  doors: [
    {
      label: 'CAFE LOUNGE',
      hotspot: { x: 557, y: 826, width: 331, height: 52 },
      targetRoomId: 'latam-cafe',
      // The target's own spawn tile: every LATAM pill sits on the bottom edge.
      entryTile: { col: 5, row: 9 },
    },
    {
      label: 'DISCO HALL',
      hotspot: { x: 902, y: 826, width: 292, height: 52 },
      targetRoomId: 'latam-disco-hall',
      // The target's own spawn tile: every LATAM pill sits on the bottom edge.
      entryTile: { col: 5, row: 7 },
    },
  ],
  npcSlots: [
    // Each tile is the nearest whole tile to the design's own
    // `<animateTransform>` home position (a free-roaming mid-pitch point,
    // not grid-aligned); `offset` is the small (<=40 Stage px) remainder, the
    // Roof Deck vendors'/Team Room 3's precedent for a design position that
    // doesn't land exactly on a tile centre.
    { npcId: 'thalles-stakonski', tile: { col: 3, row: 3 }, offset: { x: 10, y: -20 } },
    { npcId: 'bruno-amado', tile: { col: 9, row: 4 }, offset: { x: 10, y: 10 } },
    { npcId: 'washington-marino', tile: { col: 6, row: 2 }, offset: { x: -20, y: -15 } },
    { npcId: 'chrystian-rissoli', tile: { col: 4, row: 3 }, offset: { x: 0, y: 5 } },
    { npcId: 'paulo-ponciano', tile: { col: 9, row: 8 }, offset: { x: -30, y: -10 } },
    { npcId: 'gustavo-barska', tile: { col: 3, row: 7 }, offset: { x: -40, y: -5 } },
  ],
};
