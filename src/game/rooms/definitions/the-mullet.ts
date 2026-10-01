import type { RoomDefinition } from '../room-definition';
import { createGrid } from '../grid';
import { devPit } from './dev-pit';
import { officeHallway } from './office-hallway';

// Not the standard 12x10 grid (#51 D2): `design/The Mullet.dc.html` bakes a
// 14x11 floor, 154 tile diamonds whose first north corner is (800, 248) --
// `isolib.js`'s `setDims(14, 11)`, origin y round(560 - 25 * 50 / 4) = 248.
const GRID = createGrid({ x: 800, y: 248 }, 14, 11);

// The design's shared `door()` frame, 70x165 on screen.
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };

// Traced from the design's fixtures, each `box()` inverted from its
// left/right face polygons' floor edges back to grid coordinates (#51 D2); a
// tile is blocked where one footprint covers a quarter or more of its area:
//   - the Ms. Pac-Man cabinet, base `770,293 825,320.5 870,298 815,270.5`
//     -> (0,0), (1,0);
//   - the TV-lounge couch with its back and arms, `970,428 1150,518
//     1095,545.5 915,455.5` plus `930,418 1110,508 1095,515.5 915,425.5`
//     -> (5,2) to (8,2);
//   - the pool table, `600,388 750,463 670,503 520,428` -> (1-3,5),
//     (1-3,6);
//   - the ping-pong table, `920,609 1060,679 990,714 850,644` -> (8,6),
//     (9,6), (10,6), (9,7), (10,7).
// The snack counter against the back-right wall covers at most 0.18 of
// (10,0), so it stays walkable. The rug under the couch, the dashed floor
// path and the confetti are flat floor art. Every NPC's own tile (see
// `npcSlots` below) is additionally blocked (#16 fix 5): Jason (1,1), Nicole
// (6,2) and Ann Marie (8,2) on the couch, Dom (5,4), Jon (7,6), Brandon
// (11,6), Jory (13,6), Tony (0,7) and Ashley (7,10).
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, false, false, false, false, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, false, true, true, true, true, true, true, true, true],
  [true, false, false, false, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, true, true, true, false, false, false, false, false, true, false],
  [false, true, true, true, true, true, true, true, true, false, false, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, false, true, true, true, true, true, true],
];

/**
 * Traced from `design/The Mullet.dc.html`, "THE MULLET (MEZZANINE)" (#51
 * slice 3). Its two doors are the design's in-scene door frames: "← HALLWAY"
 * on the back-left wall (`770,263 700,298 700,168 770,133`) and "DEV PIT →"
 * on the right wall (`1410,553 1480,588 1480,458 1410,423`). The "↙ HALLWAY"
 * and "DEV PIT ↘" pills are HUD chrome, not doors. Neither the Hallway nor
 * the Dev Pit draws a door into the Mullet, so from them it is reached by the
 * Map (#51 D5), and each of its doors lands on the target Room's own spawn
 * tile, as the Bathroom's does. The Ms. Pac-Man cabinet is a prop: the arcade
 * and its Mullet Mania badge are out of scope, so Brandon's Interaction is
 * Dialogue.
 */
export const theMullet: RoomDefinition = {
  id: 'the-mullet',
  title: 'THE MULLET',
  // The banner's own subtitle, used verbatim: it carries no fabricated live
  // figure (#16 D2's rule).
  subtitle: 'MEZZANINE · MS. PAC-MAN · TV LOUNGE · POOL · PING PONG · END OF THE GAME',
  background: { kind: 'image', key: 'room-the-mullet', url: 'rooms/the-mullet.png' },
  grid: GRID,
  walkable: WALKABLE,
  // Where the design draws the local player's own "You" Penguin (its shadow
  // is at (570, 543)).
  spawnTile: { col: 3, row: 8 },
  doors: [
    {
      label: 'HALLWAY',
      hotspot: { x: 700, y: 133, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'office-hallway',
      // The Hallway draws no door back into the Mullet, so this lands on the
      // Hallway's own spawn tile (#51 D5; the Bathroom precedent).
      entryTile: officeHallway.spawnTile,
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1410, y: 423, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'dev-pit',
      // The Dev Pit draws no Mullet door either, so this lands on the Dev
      // Pit's own spawn tile.
      entryTile: devPit.spawnTile,
    },
  ],
  npcSlots: [
    // Each slot is the tile under the NPC's ground shadow as the design
    // draws it at rest, with its group transforms applied (Tony's group is
    // translated by (-30, -81), so his shadow sits at (470, 437)). Jory and
    // Dom, whom the design moves with SMIL, take their t=0 animated position
    // as their rest slot. Nicole and Ann Marie sit on the couch and draw no
    // shadow, so theirs is the tile under their feet. Jory's shadow (1172, 769) falls just off the
    // floor's front-right edge, at col 14.1, so she takes the nearest floor
    // tile, (13,6).
    //
    // The NPCs the design moves (owner request, 2026-10-01, Track D:
    // `src/npcs/motions/the-mullet.ts`) are drawn exactly where it stands
    // their feet (its figure `<svg>`'s (60, 120) point, with every group
    // transform applied) by an `offset`, so their moves trace its own: Dom
    // at his lap's first point (860, 478.26), Brandon at (1062, 711.6), Tony
    // at (470, 433.9) and Ashley at (620, 698.26). Jon's slot is already
    // within 2.4 px of his, and Jory's lap is re-expressed relative to her
    // on-floor slot instead (see her motion).
    { npcId: 'jason-mullet', tile: { col: 1, row: 1 } },
    { npcId: 'nicole-mullet', tile: { col: 6, row: 2 } },
    { npcId: 'ann-marie-mullet', tile: { col: 8, row: 2 } },
    { npcId: 'dom-mullet', tile: { col: 5, row: 4 }, offset: { x: 10, y: -19.74 } },
    { npcId: 'jon-mullet', tile: { col: 7, row: 6 } },
    { npcId: 'brandon-mullet', tile: { col: 11, row: 6 }, offset: { x: 12, y: 13.6 } },
    { npcId: 'jory-mullet', tile: { col: 13, row: 6 } },
    { npcId: 'tony', tile: { col: 0, row: 7 }, offset: { x: 20, y: -14.1 } },
    { npcId: 'ashley-mullet', tile: { col: 7, row: 10 }, offset: { x: -30, y: 0.26 } },
    // "You" is the local Player's own Penguin, never a static NPC slot.
  ],
};
