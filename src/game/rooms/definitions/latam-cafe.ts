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
// though they walk away from it: Alexandre Nunes (3,3, already inside
// table1's block), Ygor Azevedo (3,6), Fernanda Gioiosa (5,7), Jean
// Rodrigues (8,3), Joao Vitor Amorim (1,2), Vinicius Martins (11,5) and
// Sander Nonaka (8,1, owner request 2026-10-09: moved off the counter onto
// the open floor tile beside its right/register end, between the front
// lip's blocked (7,1) and the crates above at (8,0) -- genuinely newly
// blocked, not already covered by a fixture).
const WALKABLE: readonly (readonly boolean[])[] = [
  [true, true, true, true, false, false, false, false, false, false, false, true],
  [true, true, true, true, true, false, false, false, false, true, true, true],
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
 * (`src/ui/remote-lounge/`), not the Map. `doors` is empty (owner request,
 * 2026-10-09): the design's own bottom pill bar (MAP, FUTEBOL FIELD, DISCO
 * HALL) sat at y≈826, exactly where the HUD's own bottom action bar (chat
 * input, EMOTE, SNOWBALL, MAP, IGLOO, QUESTS) covers it, so those three
 * `RoomDoor` hotspots are gone along with the pills themselves (hidden from
 * the exported art, `scripts/export-room-art.ts`). The HUD's own MAP button
 * already opens the Map; `src/ui/latam-nav/latam-nav.ts` now links the two
 * sibling LATAM Rooms as small pills under the HUD's title instead. The
 * design draws no "BACK TO HQ"-style pill of its own -- the Room's actual way
 * back is still the HUD's own persistent MAP button, from which Town Center
 * is one tap away; there is no dedicated in-Room exit to HQ, which is a real
 * gap against the Remote Lounge's own BACK TO HQ precedent, not an oversight
 * (flagged in the execution report).
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
  // The design's own bottom pill bar (and its `RoomDoor` hotspots) is gone
  // (owner request, 2026-10-09): see this file's own header comment.
  // `src/ui/latam-nav/latam-nav.ts` links the sibling LATAM Rooms instead.
  doors: [],
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
    // Beside the counter, at its right (register) end, standing on the
    // floor rather than on the counter itself (owner request, 2026-10-09:
    // the design's own point, `(6,0)` with this same offset, rendered him
    // standing on top of the counter). `(8,1)` is the nearest open floor
    // tile to the register -- the design's own "MATCH THE TREATS" bubble
    // (cx 1095, cy 372.5, inside tile `(6,0)`) links to `Minigame Pao de
    // Queijo Memory.dc.html`, triggered by clicking Sander there -- clear of
    // both the front lip's blocked `(7,1)` and the crates' tile `(8,0)`.
    // His dialog (`PAO_DE_QUEIJO_DIALOG`, `npcs.ts`) opens on a direct click
    // (#218); `hotspots`/`minigameMarkers` below re-dispatch the same
    // `npc:arrived` for a click on his own floating bubble instead (owner
    // feedback 2026-10-13).
    { npcId: 'sander-nonaka', tile: { col: 8, row: 1 }, offset: { x: 0, y: 0 } },
  ],
  // Sander's own "MATCH THE TREATS" bubble, re-dispatched to his dialog the
  // same way the Disco Hall's `disco-turntable` and the Futebol Field's
  // `penalty-kick-ball` hotspots already reuse an NPC's own `npc:arrived`
  // (`main.ts`). The rect is generous around `minigameMarkers`' own
  // `sander-treats-bubble` anchor (1150,500 -- Sander's own `npcSlotPoint`,
  // tile (8,1) centre) and its glow/callout, the same oversized-click-area
  // convention the Igloo's `trophy-case` and the Roof Deck's
  // `igloo-gear-stall` hotspots use.
  hotspots: [
    {
      id: 'sander-treats-bubble',
      label: 'Match the Treats',
      rect: { x: 1060, y: 295, width: 180, height: 120 },
    },
  ],
  // Owner feedback 2026-10-13: the design's own pulsing glow and bouncing
  // "MATCH THE TREATS" bubble (traced from `a[href="Minigame Pao de Queijo
  // Memory.dc.html"]`, hidden from the exported art by
  // `scripts/export-room-art.ts`'s own `latam-cafe` rule) is drawn live
  // instead of lost. Re-anchored to Sander's own in-game point (1150,500,
  // his `npcSlotPoint`) rather than the design's raw (1095,402.5): the owner
  // moved him off the counter (this file's own `npcSlots` comment above),
  // so the design's own coordinates no longer sit over him. `depth` is
  // `depthForTile({col:8,row:1}) + 1` (9009): one more than Sander's own
  // depth (9008), so his bubble floats in front of him rather than being
  // covered by his own figure -- the one Room where the generic "below
  // NPCs" default (`room-definition.ts`'s own `RoomMinigameMarker` comment)
  // would hide the marker behind its own NPC.
  minigameMarkers: [
    {
      id: 'sander-treats-bubble',
      anchor: { x: 1150, y: 500 },
      depth: 9009,
      glow: { color: '#FFD23F', dx: 0, dy: -30, rx: 80, ry: 70, periodMs: 1400, peakOpacity: 0.22 },
      callout: {
        text: 'MATCH THE TREATS',
        color: '#FFD23F',
        width: 170,
        height: 38,
        dx: 0,
        dy: -151,
      },
    },
  ],
};
