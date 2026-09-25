import type { RoomDefinition, RoomHotspot, RoomWallText } from '../room-definition';
import { createStandardRoomGrid } from '../grid';
import { roofDeck } from './roof-deck';

// The standard 12x10 grid every one of the five prototype Rooms shares
// (#16 D2, `grid.ts`'s `createStandardRoomGrid`).

// The shape every door hotspot in this Room uses, from the design's shared
// `door()` isolib helper -- except the sliding-panel elevator, which isn't
// drawn with that frame (see the ELEVATOR door below).
const DOOR_HOTSPOT_SIZE = { width: 70, height: 165 };
const ELEVATOR_HOTSPOT_SIZE = { width: 90, height: 175 };

// Traced from the design's fixtures: `box()`-drawn desks/counters/stairs
// inverted from their screen polygons back to grid tiles (see the #16
// execution plan). Unwalkable tiles: the elevator/Icebox recesses along the
// back wall (rows 0-2), the Front Desk counter (cols 3-8, rows 0-1), the
// stairwell platform (cols 1-4, rows 6-7), the "SHIP IT" pedestal (cols 2-3,
// rows 8-9), and the recurring corner light/statue pedestal (cols 10-11,
// rows 7-8) that every one of the five prototype Rooms places in about the
// same spot (Dev Pit's own comment names it correctly; this Room's used to
// mislabel it "a planter" -- #16 fix 5). Darrin's and Jon's own tiles (see
// `npcSlots` below) are additionally blocked so a Penguin can't walk through
// them (#16 fix 5); Sydney's and the Front Desk penguin's tiles already sat
// on unwalkable fixtures.
const WALKABLE: readonly (readonly boolean[])[] = [
  [false, false, true, false, false, false, false, false, false, false, true, true],
  [false, false, true, false, false, false, false, false, false, true, true, true],
  [true, true, true, true, false, false, false, false, false, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, false, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, false, false, false, false, true, false, true, true, true, true, true],
  [true, false, false, false, false, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, false, false],
  [true, true, false, false, true, true, true, true, true, true, true, true],
];

// Core Values poster labels (#77): DOM-rendered replacements for the
// design's baked SVG labels, which overflow their hexagon badges at the
// design's own font-size/letter-spacing (the bug this ticket fixes -- see
// `wall-text.test.ts`, which reproduces the original 6.5px/1px numbers
// against these same `maxWidth`s to confirm it). `scripts/export-room-art.ts`
// hides the design's "CORE VALUES" heading and four label `<text>` elements
// from the exported PNG (its own Town Center rule, #77); `src/ui/wall-text/
// wall-text.ts` redraws them live in `#ui` instead.
//
// Anchors, colours and skewY are traced directly from `design/Room 01 Town
// Center.dc.html`'s five `<text transform="matrix(1 0.5 0 1 x y)" ...>`
// elements -- the poster wall's shared shear factor is 0.5 for all five.
// Heading colour (#B3B6C9) is the design's own `fill`, not named in the #77
// ticket body (which only gave colours for the four value words).
//
// `maxWidth` derivation for the four value hexagons: each badge's *inner*
// (dark-background) polygon -- e.g. SERVE's `1003.7,226.8 995,217.5
// 986.3,218.2 986.3,228.2 995,237.5 1003.7,236.8` -- has flat vertical
// left/right edges (it only tapers to a point above/below that band), so its
// horizontal extent is exactly `max(x) - min(x)` of those six points
// regardless of any shear: an SVG `matrix(a b c d e f)` maps `x' = a*x + c*y
// + e`, and this wall's matrix has `c = 0`, so x is never a function of y --
// shearing only ever moves a point's y as a function of its x, leaving the
// screen-space x-extent identical to the unsheared local extent. All four
// value hexagons measure 17.4px wide this way (986.3..1003.7 for SERVE,
// 1019.8..1037.2 for GRIND, 1053.3..1070.7 for GROW, 1086.8..1104.2 for
// INSPIRE). 2.4px of padding (1.2px each side, clearing the hexagon's taper
// toward its top/bottom points) leaves 15px of usable width.
//
// The heading sits on the poster's own dark trapezoid backing plate
// (`977.5,243.8 1112.5,311.3 1112.5,243.8 977.5,176.3`, the same 135px-wide
// shape the whole poster stands on), so a generous 20px of padding (10px
// each side) leaves 115px -- far more than "CORE VALUES" needs.
//
// `..._ABOVE_ANCHOR`/`..._BELOW_ANCHOR` (exported for
// `e2e/core-values-poster.spec.ts`'s own "stays inside its hexagon" check,
// alongside `maxWidth`): each value hexagon's own inner polygon has the same
// y-range, `anchor.y - 6.5` to `anchor.y + 13.5` (e.g. SERVE's inner polygon
// points above: 217.5 and 237.5, 6.5 above/13.5 below its 224.0 anchor) --
// asymmetric because the design's anchor is the text *baseline*, not the
// hexagon's own vertical centre. Unlike `maxWidth`, this is the polygon's
// real, un-padded range: it's what "touches or crosses its hexagon" is
// actually checked against, not a safety margin. The heading has no hexagon
// of its own (it sits directly on the poster's shared backing plate, far
// larger than one line of text needs -- see above), so its own span is sized
// generously around its actual rendered footprint instead (~81px wide at
// `HEADING_FONT_SIZE_PX`/`HEADING_LETTER_SPACING_PX`, sheared by
// `POSTER_WALL_SKEW_Y` -- see `wall-text.test.ts`'s own measurement).
export const VALUE_LABEL_MAX_WIDTH = 15;
export const HEADING_MAX_WIDTH = 115;
export const VALUE_LABEL_ABOVE_ANCHOR = 6.5;
export const VALUE_LABEL_BELOW_ANCHOR = 13.5;
export const HEADING_ABOVE_ANCHOR = 30;
export const HEADING_BELOW_ANCHOR = 30;
const POSTER_WALL_SKEW_Y = 0.5;

const CORE_VALUES_WALL_TEXT: readonly RoomWallText[] = [
  {
    id: 'heading',
    text: 'CORE VALUES',
    x: 1045,
    y: 217.5,
    colour: '#B3B6C9',
    maxWidth: HEADING_MAX_WIDTH,
    skewY: POSTER_WALL_SKEW_Y,
  },
  {
    id: 'serve',
    text: 'SERVE',
    x: 995,
    y: 224,
    colour: '#F4F4F4',
    maxWidth: VALUE_LABEL_MAX_WIDTH,
    skewY: POSTER_WALL_SKEW_Y,
  },
  {
    id: 'grind',
    text: 'GRIND',
    x: 1028.5,
    y: 240.8,
    colour: '#00BDFF',
    maxWidth: VALUE_LABEL_MAX_WIDTH,
    skewY: POSTER_WALL_SKEW_Y,
  },
  {
    id: 'grow',
    text: 'GROW',
    x: 1062,
    y: 257.5,
    colour: '#F4F4F4',
    maxWidth: VALUE_LABEL_MAX_WIDTH,
    skewY: POSTER_WALL_SKEW_Y,
  },
  {
    id: 'inspire',
    text: 'INSPIRE',
    x: 1095.5,
    y: 274.3,
    colour: '#00BDFF',
    maxWidth: VALUE_LABEL_MAX_WIDTH,
    skewY: POSTER_WALL_SKEW_Y,
  },
];

/**
 * The id `src/ui/wall-text/wall-text.ts` looks for (#77 D5/D6): when a Room's
 * `hotspots` has an entry with this id, the wall-text overlay draws a
 * clickable `<button>` over its `rect` that opens the Core Values card
 * (`src/ui/wall-text/core-values-card.ts`), wired in `src/main.ts`.
 */
export const CORE_VALUES_POSTER_HOTSPOT_ID = 'core-values-poster';

/**
 * The poster's own backing plate, `977.5,243.8 1112.5,311.3 1112.5,243.8
 * 977.5,176.3` (the same shape `HEADING_MAX_WIDTH`'s derivation comment
 * above uses): its axis-aligned bounding box is `x: 977.5..1112.5, y:
 * 176.3..311.3` -- a 135x135 Stage-pixel square -- used as-is as the click
 * target's `rect` (#77 D5, a scope-change follow-up: the wall labels stay
 * small enough to fit their hexagons, so a click opens a properly legible
 * card instead).
 */
const CORE_VALUES_POSTER_HOTSPOT: RoomHotspot = {
  id: CORE_VALUES_POSTER_HOTSPOT_ID,
  label: 'Core values',
  rect: { x: 977.5, y: 176.3, width: 135, height: 135 },
};

/**
 * Traced from `design/Room 01 Town Center.dc.html`. Doors: DEV PIT (real,
 * `door()`-styled sign), THE ICEBOX and STAIRWELL (both disabled — neither
 * Room is in this prototype's five), and the sliding-panel elevator labelled
 * "ELEVATOR · ROOF DECK" (real; its hotspot is the two animated door panels'
 * bounding box, since it isn't drawn with the same `door()` frame as the
 * others). The design also shows a "KITCHEN ↘" HUD exit pill with no in-scene
 * door graphic to place a hotspot on, so this Room has no door to The Melt
 * (The Melt's own "← TOWN CENTER" door is one-way in this static prototype;
 * see the #16 execution plan's reported deviations).
 */
export const townCenter: RoomDefinition = {
  id: 'town-center',
  title: 'TOWN CENTER',
  subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
  background: { kind: 'image', key: 'room-town-center', url: 'rooms/town-center.png' },
  wallText: CORE_VALUES_WALL_TEXT,
  hotspots: [CORE_VALUES_POSTER_HOTSPOT],
  grid: createStandardRoomGrid(),
  walkable: WALKABLE,
  spawnTile: { col: 6, row: 8 },
  doors: [
    {
      label: 'THE ICEBOX',
      hotspot: { x: 860, y: 150, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'DEV PIT',
      hotspot: { x: 1270, y: 355, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: 'dev-pit',
      // The tile just inside Dev Pit's own "TOWN CENTER" door (#16 fix 4):
      // the nearest walkable tile to that door's hotspot centre in Dev Pit's
      // own grid, the same rule `reachability.test.ts` uses for a door's
      // approach tile.
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'STAIRWELL',
      hotspot: { x: 610, y: 180, ...DOOR_HOTSPOT_SIZE },
      targetRoomId: null,
      entryTile: { col: 0, row: 0 },
    },
    {
      label: 'ELEVATOR · ROOF DECK',
      hotspot: { x: 385, y: 282, ...ELEVATOR_HOTSPOT_SIZE },
      targetRoomId: 'roof-deck',
      // Roof Deck has no door/elevator of its own drawn in the design (only
      // a HUD exit pill), so this lands on Roof Deck's own spawn tile (#16
      // fix 4) -- a judgment call reported on the #16 execution plan.
      entryTile: roofDeck.spawnTile,
    },
  ],
  npcSlots: [
    // Darrin Jahnel, Sydney Murauskas and Jon Keller: full names on their
    // nameplates, kebab-cased to first name only per the #16 execution
    // plan's example (`darrin`).
    { npcId: 'darrin', tile: { col: 3, row: 4 } },
    { npcId: 'sydney', tile: { col: 6, row: 2 } },
    { npcId: 'jon', tile: { col: 6, row: 6 } },
    // The receptionist penguin behind the Front Desk counter; her tile sits
    // on the (unwalkable) counter itself, same as any NPC standing behind a
    // fixed fixture (#16 D6).
    { npcId: 'front-desk', tile: { col: 6, row: 1 } },
    // Jory Hutchins has her own nameplate and speech bubble (`sayJory`), like
    // Darrin/Sydney/Jon, but her `jump` bounce animation and "SURVIVOR" badge
    // are nested *inside* Sydney's own `walkSyd` group in the design markup,
    // not a standalone figure with its own fixed position -- she rides along
    // with wherever Sydney's walk cycle currently places her, so there's no
    // single tile that's "hers" to place an NPC slot on the way Darrin's,
    // Sydney's and Jon's own patrol-start tiles are approximated. #16 fix 5
    // decision: no NPC slot for Jory, for a different reason than Matt's
    // exclusion in Dev Pit (Matt is a Penguin/Player, never a static NPC
    // slot at all; Jory is a designed NPC, just one without an independent
    // position in this design). Reviewable if #36 finds otherwise.
  ],
};
