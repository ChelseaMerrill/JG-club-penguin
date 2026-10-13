import type { HexColor, RoomId, Tile } from '../../contracts';
import type { Placement } from '../../persistence/progress-store';
import type { DiscoFloorTile } from './disco-floor';
import type { TankFish } from './tank-fish';

/**
 * A Room's art. `procedural` is drawn by `RoomScene` from `walkable` in the
 * design's room-surface colours until #16 exports the real design art as
 * `image`.
 */
export type RoomBackground = { kind: 'procedural' } | { kind: 'image'; key: string; url: string };

/**
 * Pixel origin: the screen position of tile `{ col: 0, row: 0 }`'s north
 * corner, per `design/build/isolib.js` and the Room design files.
 * `columns`/`rows` size the `walkable` mask. Tile size is not a `RoomGrid`
 * field; it lives in `iso.ts`'s `TILE_WIDTH`/`TILE_HEIGHT`, the single
 * source for tile size shared by every Room (#13 fix 5). Build one with
 * `grid.ts`'s `createGrid` rather than by hand.
 */
export interface RoomGrid {
  origin: { x: number; y: number };
  columns: number;
  rows: number;
}

/** The clickable/drawable region for a door sign, in stage pixel coordinates. */
export interface DoorHotspot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `targetRoomId: null` means the door is disabled (its destination Room has
 * no `RoomDefinition` yet); `validate.ts` requires a non-null target to name
 * a Room that is actually registered.
 *
 * `entryTile` is a tile in the **target** Room, not this one: the tile a
 * Player arrives on after passing through this door. `validate.ts` checks it
 * is walkable in the target Room's own `walkable` mask.
 */
export interface RoomDoor {
  label: string;
  hotspot: DoorHotspot;
  targetRoomId: RoomId | null;
  entryTile: Tile;
}

/** A placeholder slot for an NPC (#14, #36 fill in behavior). */
export interface RoomNpcSlot {
  npcId: string;
  tile: Tile;
  /**
   * Stage pixels from `tile`'s point to where the Room design actually
   * stands the NPC, when that isn't the tile's centre: e.g. Team Room 3's
   * Millie, seated at the end of her desk. Only where the NPC is drawn (and
   * clicked) moves; walking to it, blocking and depth stay on `tile`.
   */
  offset?: StagePoint;
}

/**
 * A piece of the Room design's furniture drawn in front of an NPC, as the
 * design paints it after that NPC's figure: Team Room 3's desks in front of
 * Millie and Sydney and the couch's front around Casey, so they sit at them
 * instead of standing on top of the baked-in art. A transparent 1600x900
 * image exported from the design by `scripts/export-room-art.ts`
 * (`FOREGROUND_LAYERS`), sorted just in front of `overNpcId`'s slot tile:
 * a Penguin behind the furniture is covered by it too, and one in front of it
 * draws over it. NPC nameplates are drawn with the figure, so a layer must
 * not overlap one (the designs never do).
 */
export interface RoomForeground {
  key: string;
  url: string;
  overNpcId: string;
}

/** A point in Stage pixels (1600x900), for things that aren't on a floor Tile. */
export interface StagePoint {
  x: number;
  y: number;
}

/**
 * A slot for interactive Furniture. Reserved for the Igloo (#16): Furniture
 * is CONTEXT.md's term for items a Player buys at the Igloo Gear stall and
 * places in their own Igloo, so no other Room populates this.
 *
 * #135: each slot has a `placement` that must match `IGLOO_SLOT_PLACEMENT`
 * for its number (`validate.ts` checks it). A floor slot sits on a Tile. A
 * wall slot is a Stage point on the left or right back wall, whose art is
 * drawn sheared into that wall plane. The ceiling slot hangs its item on a
 * cord from `cordTopY` down to `anchor`, with a shadow on the floor at
 * `shadow`. Wall and ceiling fixtures aren't Tile positions, so they use
 * Stage pixels (CONTEXT.md reserves Tiles for Penguins, doors, spawn and NPCs).
 */
export type RoomFurnitureSlot =
  | { id: string; placement: Extract<Placement, 'floor'>; tile: Tile }
  | {
      id: string;
      placement: Extract<Placement, 'wall'>;
      wall: 'left' | 'right';
      anchor: StagePoint;
    }
  | {
      id: string;
      placement: Extract<Placement, 'ceiling'>;
      anchor: StagePoint;
      cordTopY: number;
      shadow: StagePoint;
    };

/**
 * A non-interactive decorative prop position (e.g. Town Center's planter,
 * Dev Pit's desk) — not Furniture, which CONTEXT.md reserves for Igloo items
 * a Player buys and owns (#13 fix 6).
 */
export interface RoomProp {
  id: string;
  tile: Tile;
}

/**
 * A non-door clickable target (#16 D5): the Igloo's `trophy-case` and the
 * Roof Deck's `igloo-gear-stall`. `rect` reuses `DoorHotspot`'s shape (stage
 * pixel coordinates); `validate.ts` checks `id` is unique within the Room and
 * `rect` lies within the 1600x900 Stage.
 */
export interface RoomHotspot {
  id: string;
  label: string;
  rect: DoorHotspot;
}

/**
 * DOM-rendered Room signage text (#77 D2): drawn as live `<span>`s in `#ui`
 * (`src/ui/wall-text/wall-text.ts`) instead of baked into the Room's exported
 * PNG, so it always renders sharp with the page's own web fonts regardless of
 * window size -- unlike an SVG-as-image texture, which can't use a web font
 * once flattened to a raster background.
 *
 * `x`/`y` are the Stage pixel anchor the design's own
 * `<text transform="matrix(1 skewY 0 1 x y)" text-anchor="middle">` used, so
 * `wall-text.ts` centres the DOM text on this same anchor both axes. `skewY`
 * is that same matrix's shear factor (the wall's own isometric slant).
 * `maxWidth` is the widest (Stage px) this label may measure before it
 * overflows its backing shape -- see each Room definition's own comment for
 * how it derived that number from the design's hexagon/backing polygon.
 */
export interface RoomWallText {
  id: string;
  text: string;
  x: number;
  y: number;
  colour: HexColor;
  maxWidth: number;
  skewY: number;
}

/**
 * The pulsing glow behind a `RoomMinigameMarker`, traced from the design's
 * own `<ellipse ... opacity="0"><animate attributeName="opacity"
 * values="0;PEAK;0" dur="PERIODs" repeatCount="indefinite"/></ellipse>`:
 * `dx`/`dy` are Stage px from the marker's own `anchor` (0/0 when the design
 * draws it centred there), `rx`/`ry` its radii, and `peakOpacity`/`periodMs`
 * its `values`' middle stop and `dur`. `minigame-markers.ts` samples this as
 * a 0 -> peak -> 0 triangle wave, SMIL's own default linear interpolation for
 * an `<animate>` with neither `keyTimes` nor `calcMode`.
 */
export interface RoomMinigameMarkerGlow {
  color: HexColor;
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  periodMs: number;
  peakOpacity: number;
}

/**
 * A `RoomMinigameMarker`'s floating label pill, traced from the design's own
 * bouncing call-out group (a rounded rect, a small pointer triangle and its
 * `<text>`): `dx`/`dy` are the pill's own resting centre, Stage px from the
 * marker's `anchor`. Every design call-out this prototype ports bobs with the
 * exact same `animateTransform` (`values="0 0;0 -6;0 0" dur="1.2s"
 * repeatCount="indefinite"`), so the bob itself is one shared animation
 * (`minigame-markers.ts`'s `sampleMarkerCalloutBob`), not per-marker data.
 */
export interface RoomMinigameMarkerCallout {
  text: string;
  /** The pill's own fill; its text is always the design's own near-black. */
  color: HexColor;
  width: number;
  height: number;
  dx: number;
  dy: number;
}

/**
 * The LATAM Futebol Field's bouncing Penalty Kick ball (owner feedback
 * 2026-10-13): the design's own ball `<g>` (a white circle, a black pentagon
 * and two rotating "valve" dots) bounces `animateTransform type="translate"`
 * `0 0;0 -BOUNCE_HEIGHTpx;0 0` over `bouncePeriodMs`, eased by the design's
 * own spline (approximated here with one `cubic-bezier`, see
 * `minigame-markers.ts`); its ground shadow squashes in sync (`rx` only,
 * `shadow.rx` at rest narrowing to `shadow.squashedRx` at the bounce's peak).
 */
export interface RoomMinigameMarkerBall {
  radius: number;
  bounceHeight: number;
  bouncePeriodMs: number;
  shadow: { dx: number; dy: number; rx: number; ry: number; squashedRx: number };
}

/**
 * A design-sourced animated call-out marking a Room's minigame trigger (owner
 * feedback 2026-10-13: the LATAM Café's hidden "MATCH THE TREATS" bubble, the
 * Disco Hall's oversized baked-in "SPIN IT · CARNAVAL PARADE" sign, and the
 * Futebol Field's missing bouncing ball). `room-minigame-markers.ts` draws
 * it: every marker gets a pulsing `glow`; `callout` and `ball` are each
 * optional, since the Café/Disco markers are glow+callout and the Futebol
 * marker is glow+ball (no callout pill of its own, its "KICK IT · PENALTY
 * SHOOTOUT" line is itself a `callout`, so both may be set together).
 *
 * `depth` sorts it like any other Phaser object at this Room's `RoomScene`:
 * by convention, above the background/floor and below NPCs/Penguins (e.g.
 * `HOTSPOT_DEPTH`/a tile's own `depthForTile`, neither of which a Room
 * definition imports -- this field is plain data, a hand-computed number with
 * a comment, the same convention every other hard-coded Stage-pixel field in
 * these files already uses). A Room may still author a higher `depth` when
 * its own NPC would otherwise cover the marker (see the LATAM Café's own
 * comment): this is a per-Room, reviewable call, not something the renderer
 * decides.
 */
export interface RoomMinigameMarker {
  id: string;
  anchor: StagePoint;
  depth: number;
  glow: RoomMinigameMarkerGlow;
  callout?: RoomMinigameMarkerCallout;
  ball?: RoomMinigameMarkerBall;
}

/**
 * A Room is data: everything `RoomScene` needs to render and validate one
 * Room, and everything #14/#15/#16/#28 need to place Penguins, NPCs and
 * furniture in it.
 */
export interface RoomDefinition {
  id: RoomId;
  title: string;
  subtitle: string;
  background: RoomBackground;
  grid: RoomGrid;
  /** `walkable[row][col]`; `true` where a Penguin may stand. */
  walkable: readonly (readonly boolean[])[];
  doors: readonly RoomDoor[];
  spawnTile: Tile;
  npcSlots: readonly RoomNpcSlot[];
  furnitureSlots?: readonly RoomFurnitureSlot[];
  props?: readonly RoomProp[];
  /** Non-door clickable targets (#16 D5): e.g. the Igloo's `trophy-case`. */
  hotspots?: readonly RoomHotspot[];
  /** DOM-rendered wall/signage text (#77 D2): e.g. Town Center's Core Values poster. */
  wallText?: readonly RoomWallText[];
  /** Furniture the design draws in front of its NPCs (see `RoomForeground`). */
  foregrounds?: readonly RoomForeground[];
  /** The pet fish in the Room's desk tank, a decoration (`tank-fish.ts`): Town Center only. */
  tankFish?: TankFish;
  /** Potted plants on these floor tiles, a decoration (`plants.ts`); each tile must be unwalkable. */
  plants?: readonly Tile[];
  /**
   * A floor that cycles colours like its design (owner request, 2026-10-09:
   * the LATAM Disco Hall's dance floor -- see `disco-floor.ts`), drawn above
   * `background` and below every NPC/Penguin/foreground. Not from `walkable`:
   * only the LATAM Disco Hall's design has this animation baked into its
   * `.dc.html`, so nothing derives it generically from the grid.
   */
  animatedFloorTiles?: readonly DiscoFloorTile[];
  /** Animated design call-outs marking this Room's minigame trigger(s) (owner feedback 2026-10-13); see `RoomMinigameMarker`. */
  minigameMarkers?: readonly RoomMinigameMarker[];
}
