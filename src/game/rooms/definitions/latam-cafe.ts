import type { RoomDefinition } from '../room-definition';
import { createStandardRoomGrid } from '../grid';

// `design/Latam Cafe.dc.html` draws its room shell with the same isolib grid
// as the HQ Rooms and the Remote Lounge (`S=50, OX=800, OY=250, W=12, D=10`:
// its own baked floor polygon `800,250 1400,550 900,800 300,500` matches):
// the standard 12x10 grid.
//
// Traced from the design's fixtures (a tile is blocked where a fixture
// covers a quarter or more of it, the Bathroom's rule), confirmed against a
// grid overlay rendered over the design:
//   - the back-wall counter/register, `(4,0)-(7,0)` on top and its front lip
//     `(5,1)-(7,1)`;
//   - the stacked crates beside it, `(8,0)-(10,0)`;
//   - the four round café tables: `(3,3)-(4,3)` (Alexandre/Joao's),
//     `(2,6)` (Ygor's), `(6,6)-(6,7)` (Fernanda's) and `(6,3)-(7,3)`
//     (Jean/Vinicius's) -- their stools are low-profile and left walkable,
//     as this codebase's convention blocks desks/tables/counters, not every
//     chair;
//   - the two floor planters, `(0,8)` and `(10,8)` (a third plant's leaves
//     reach into frame near `(0,0)-(1,0)` but its pot sits off the visible
//     floor, so it blocks nothing).
// Every NPC's own tile (see `npcSlots` below) is additionally blocked (#16
// fix 5), including Joao Vitor Amorim's and Vinicius Martins' home slot
// though they walk away from it: Sander Nonaka (6,0, already inside the
// counter block), Alexandre Nunes (3,3, already inside table1's block),
// Ygor Azevedo (3,6), Fernanda Gioiosa (5,7), Jean Rodrigues (8,3), Joao
// Vitor Amorim (1,2) and Vinicius Martins (11,5).
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, false, false, false, false, false, false, false, true],
  [true, true, true, true, true, false, false, false, true, true, true, true],
  [true, false, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, false, true, false, false, false, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, false],
  [true, true, false, false, true, true, false, true, true, true, true, true],
  [true, true, true, true, true, false, false, true, true, true, true, true],
  [false, true, true, true, true, true, true, true, true, true, false, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
];

/**
 * Traced from `design/Latam Cafe.dc.html` ("LATAM CAFÉ LOUNGE", breadcrumb
 * "16 · LATAM CAFÉ LOUNGE") -- the LATAM section's Café (owner request,
 * 2026-10-09). Unlike every HQ Room, this design draws no top-left HUD title
 * banner at all (confirmed: no `Bumbastika` title/subtitle div anywhere in
 * the file); the Room's only in-scene name is the "CAFÉ LATAM" neon wall sign
 * over the counter and the breadcrumb outside the Stage. `title`/`subtitle`
 * here are therefore a judgment call, not read off a baked banner: `title`
 * is the packet's own "LATAM CAFÉ"; `subtitle` is "REMOTE · LATAM", the tag
 * every one of this Room's own NPC cards carries on `design/Characters
 * LATAM.dc.html` verbatim (parallel to how the Remote Lounge's subtitle came
 * from that design's own banner text).
 *
 * Reached only from the Remote Lounge globe's LATAM pin
 * (`src/ui/remote-lounge/`), not the Map. Its two in-scene door pills lead
 * to the sibling LATAM Rooms, `latam-futebol-field` and `latam-disco-hall`,
 * which link back. The design's third pill, "MAP", isn't a `RoomDoor`: nothing in
 * `RoomDoor`/`room-definition.ts` can open the Map screen (that's
 * `src/ui/map-screen.ts`, a HUD overlay, not a Room), so it is left out of
 * `doors` entirely. The design draws no "BACK TO HQ"-style pill of its own
 * (its only other exit is that same MAP pill) -- the Room's actual way back
 * is the HUD's own persistent MAP button (`src/ui/hud/hud.ts`, present in
 * every Room, this one included), from which Town Center is one tap away;
 * there is no dedicated in-Room exit to HQ, which is a real gap against the
 * Remote Lounge's own BACK TO HQ precedent, not an oversight (flagged in the
 * execution report).
 */
export const latamCafe: RoomDefinition = {
  id: 'latam-cafe',
  title: 'LATAM CAFÉ',
  subtitle: 'REMOTE · LATAM',
  background: { kind: 'image', key: 'room-latam-cafe', url: 'rooms/latam-cafe.png' },
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  // An open front-floor tile, clear of every table and NPC, the same kind of
  // spawn the Remote Lounge uses (the design draws no "You" of its own).
  spawnTile: { col: 5, row: 9 },
  doors: [
    {
      label: 'FUTEBOL FIELD',
      hotspot: { x: 542.6, y: 826, width: 360.3, height: 52 },
      targetRoomId: 'latam-futebol-field',
      // The target's own spawn tile: every LATAM pill sits on the bottom edge.
      entryTile: { col: 6, row: 8 },
    },
    {
      label: 'DISCO HALL',
      hotspot: { x: 916.9, y: 826, width: 292.1, height: 52 },
      targetRoomId: 'latam-disco-hall',
      // The target's own spawn tile: every LATAM pill sits on the bottom edge.
      entryTile: { col: 5, row: 7 },
    },
  ],
  // The design's seven JGers (`design/Characters LATAM.dc.html`'s cards whose
  // location reads "LATAM Café Lounge"), at the room design's own figure
  // positions (each `<g transform="translate(x y)">`'s point, rounded to its
  // nearest tile with the leftover as `offset`). Alexandre Nunes, Ygor
  // Azevedo, Fernanda Gioiosa, Jean Rodrigues and Sander Nonaka stand still;
  // Joao Vitor Amorim and Vinicius Martins walk
  // (`src/npcs/motions/latam-cafe.ts`), so their slot is their home tile,
  // not where this screenshot happens to catch them.
  npcSlots: [
    { npcId: 'alexandre-nunes', tile: { col: 3, row: 3 }, offset: { x: -37.5, y: -3.7 } },
    {
      npcId: 'joao-vitor-amorim',
      tile: { col: 1, row: 2 },
      offset: { x: -10, y: 5 },
    },
    { npcId: 'ygor-azevedo', tile: { col: 3, row: 6 }, offset: { x: -35, y: -2.5 } },
    { npcId: 'fernanda-gioiosa', tile: { col: 5, row: 7 }, offset: { x: 12.5, y: -8.7 } },
    { npcId: 'jean-rodrigues', tile: { col: 8, row: 3 }, offset: { x: -15, y: 17.5 } },
    {
      npcId: 'vinicius-martins',
      tile: { col: 11, row: 5 },
      offset: { x: -40, y: -5 },
    },
    // At the register, behind the counter. The design's own "MATCH THE
    // TREATS" bubble here links to `Minigame Pao de Queijo Memory.dc.html`,
    // triggered by clicking Sander at the register -- not built yet (the
    // packet's scope is the Room and its cast, not the minigame), so he
    // gets a normal line dialog instead (`npcs.ts`); wire his minigame
    // dialog here when Pão de Queijo Memory lands.
    { npcId: 'sander-nonaka', tile: { col: 6, row: 0 }, offset: { x: -5, y: -22.5 } },
  ],
};
