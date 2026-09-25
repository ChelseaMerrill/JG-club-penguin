import { GameObjects, type Scene } from 'phaser';

/**
 * Draws one Igloo Gear item's Room art (#41 resolved decision 2): there is
 * no dedicated Furniture sprite yet, so each `artKey` (`IGLOO_GEAR_CATALOG`
 * in `src/persistence/minigame-rules.ts`) gets a simple flat Phaser
 * `Graphics` shape in the same cyan/teal/light palette `src/ui/market.ts`'s
 * `ITEM_ICON_BUILDERS` uses for the Market's DOM icons -- not the same
 * shapes (these are drawn isometrically, sitting on a floor tile, rather
 * than as a flat square DOM icon), but the same visual vocabulary. Kept in
 * its own module, away from `RoomScene`, so the art is easy to find and
 * replace once real Furniture sprites exist.
 */

// The design's own cyan/teal/light palette (`RoomScene.ts`'s hotspot/door
// colours, `market.css`'s `--mk-cyan`/`--mk-teal`/`--mk-light`).
const ART_CYAN = 0x00bdff;
const ART_TEAL = 0x0c4b5f;
const ART_LIGHT = 0xf4f4f4;
const ART_BASE = 0x3a4046;

type FurnitureArtBuilder = (graphics: GameObjects.Graphics) => void;

/**
 * One builder per known `artKey`, drawing around the shape's own base point
 * `(0, 0)` -- the tile's screen centre, the same anchor `RoomScene.drawProps`
 * and `drawNpcs` place things at -- with the shape's "up" extending in
 * negative `y` so it reads as sitting on the tile rather than centred on it.
 */
const FURNITURE_ART_BUILDERS: Record<string, FurnitureArtBuilder> = {
  beanbag: (g) => {
    g.fillStyle(ART_TEAL, 1);
    g.fillEllipse(0, -10, 46, 34);
    g.lineStyle(2, ART_CYAN, 1);
    g.strokeEllipse(0, -10, 46, 34);
  },
  'rgb-light-strip': (g) => {
    g.fillStyle(ART_CYAN, 0.9);
    g.fillRoundedRect(-26, -10, 52, 10, 5);
    g.lineStyle(2, ART_LIGHT, 0.8);
    g.strokeRoundedRect(-26, -10, 52, 10, 5);
  },
  desk: (g) => {
    g.fillStyle(ART_BASE, 1);
    g.fillRect(-26, -12, 52, 14);
    g.lineStyle(2, ART_TEAL, 1);
    g.strokeRect(-26, -12, 52, 14);
  },
  speakers: (g) => {
    for (const dx of [-16, 16]) {
      g.fillStyle(ART_BASE, 1);
      g.fillRect(dx - 7, -36, 14, 34);
      g.lineStyle(2, ART_TEAL, 1);
      g.strokeRect(dx - 7, -36, 14, 34);
    }
  },
  'dual-monitors': (g) => {
    for (const dx of [-13, 13]) {
      g.fillStyle(ART_CYAN, 1);
      g.fillRoundedRect(dx - 11, -30, 22, 26, 2);
      g.lineStyle(2, ART_TEAL, 1);
      g.strokeRoundedRect(dx - 11, -30, 22, 26, 2);
    }
  },
  'disco-ball': (g) => {
    g.fillStyle(ART_CYAN, 1);
    g.fillCircle(0, -24, 18);
    g.lineStyle(1, ART_LIGHT, 0.85);
    for (const angle of [0, 30, 60, 90, 120, 150]) {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.cos(rad) * 18;
      const dy = Math.sin(rad) * 18;
      g.lineBetween(-dx, -24 - dy, dx, -24 + dy);
    }
    g.strokeCircle(0, -24, 18);
  },
  'arcade-cabinet': (g) => {
    g.fillStyle(ART_BASE, 1);
    g.fillRect(-16, -50, 32, 50);
    g.lineStyle(2, ART_TEAL, 1);
    g.strokeRect(-16, -50, 32, 50);
    g.fillStyle(ART_CYAN, 1);
    g.fillRect(-11, -44, 22, 16);
  },
};

/** Every `artKey` `FURNITURE_ART_BUILDERS`/`drawFurnitureArt` recognises. */
export const KNOWN_FURNITURE_ART_KEYS: readonly string[] = Object.keys(FURNITURE_ART_BUILDERS);

/**
 * Pure lookup, split out from `drawFurnitureArt` so the "known artKey vs.
 * fallback" decision is unit-testable without a real Phaser `Scene` (this
 * repo's tests never construct one -- see `furniture-art.test.ts`).
 */
export function isKnownFurnitureArtKey(artKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(FURNITURE_ART_BUILDERS, artKey);
}

/** A generic diamond placeholder for any `artKey` this module doesn't recognise yet. */
function fallbackArt(g: GameObjects.Graphics): void {
  g.fillStyle(ART_TEAL, 1);
  g.fillPoints(
    [
      { x: 0, y: -40 },
      { x: 20, y: -20 },
      { x: 0, y: 0 },
      { x: -20, y: -20 },
    ],
    true,
  );
  g.lineStyle(2, ART_CYAN, 1);
  g.strokePoints(
    [
      { x: 0, y: -40 },
      { x: 20, y: -20 },
      { x: 0, y: 0 },
      { x: -20, y: -20 },
    ],
    true,
  );
}

/**
 * Draws `artKey`'s Room art as a new `Graphics` object positioned at
 * `point` (a tile's screen centre, `iso.ts`'s `tileToScreen`), left
 * un-depth-sorted: the caller (`RoomScene.renderFurniture`) sets `depth`
 * itself via `depthForTile`, matching Penguins/props/NPCs.
 */
export function drawFurnitureArt(
  scene: Pick<Scene, 'add'>,
  artKey: string,
  point: { x: number; y: number },
): GameObjects.Graphics {
  const graphics = scene.add.graphics();
  graphics.setPosition(point.x, point.y);
  const build = FURNITURE_ART_BUILDERS[artKey] ?? fallbackArt;
  build(graphics);
  return graphics;
}
