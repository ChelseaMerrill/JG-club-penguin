import { GameObjects, type Scene } from 'phaser';

/**
 * Draws one Igloo Gear item's Room art (#41 resolved decision 2): there is
 * no dedicated Furniture sprite yet, so each `artKey` (`IGLOO_GEAR_CATALOG`
 * in `src/persistence/minigame-rules.ts`) gets a simple flat shape in the
 * same cyan/teal/light palette `src/ui/market.ts`'s `ITEM_ICON_BUILDERS`
 * uses for the Market's DOM icons -- not the same shapes, but the same
 * visual vocabulary. Kept in its own module, away from `RoomScene`, so the
 * art is easy to find and replace once real Furniture sprites exist.
 *
 * #135: art is placement-aware. Floor items are Phaser `Graphics` sitting on
 * a Tile. Wall items are drawn into a canvas texture with the wall-plane
 * shear (the design's `matrix(1 ∓0.5 0 1)`), so they lie flat on the left or
 * right back wall; the three JG awards draw their logo (`public/awards/*.svg`,
 * the same files the Trophy Case shows) inside a frame. Wall art is at most
 * 38 px wide, the narrowest gap between the Igloo's wall fixtures. The
 * Disco Ball hangs from the ceiling on a cord, with a shadow on the floor.
 */

// The design's own cyan/teal/light palette (`RoomScene.ts`'s hotspot/door
// colours, `market.css`'s `--mk-cyan`/`--mk-teal`/`--mk-light`).
const ART_CYAN = 0x00bdff;
const ART_TEAL = 0x0c4b5f;
const ART_LIGHT = 0xf4f4f4;
const ART_BASE = 0x3a4046;

const CSS_CYAN = '#00bdff';
const CSS_TEAL = '#0c4b5f';
const CSS_LIGHT = '#f4f4f4';
const CSS_BASE = '#3a4046';
const CSS_DARK = '#101418';

/** The widest any wall item is drawn, so every wall item fits every wall slot. */
export const WALL_ART_MAX_WIDTH = 38;

type FurnitureArtBuilder = (graphics: GameObjects.Graphics) => void;

/**
 * One builder per floor `artKey`, drawing around the shape's own base point
 * `(0, 0)` -- the tile's screen centre, the same anchor `RoomScene.drawProps`
 * and `drawNpcs` place things at -- with the shape's "up" extending in
 * negative `y` so it reads as sitting on the tile rather than centred on it.
 */
const FLOOR_ART_BUILDERS: Record<string, FurnitureArtBuilder> = {
  beanbag: (g) => {
    g.fillStyle(ART_TEAL, 1);
    g.fillEllipse(0, -10, 46, 34);
    g.lineStyle(2, ART_CYAN, 1);
    g.strokeEllipse(0, -10, 46, 34);
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
  'arcade-cabinet': (g) => {
    g.fillStyle(ART_BASE, 1);
    g.fillRect(-16, -50, 32, 50);
    g.lineStyle(2, ART_TEAL, 1);
    g.strokeRect(-16, -50, 32, 50);
    g.fillStyle(ART_CYAN, 1);
    g.fillRect(-11, -44, 22, 16);
  },
};

type WallArtDrawer = (ctx: CanvasRenderingContext2D) => void;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * One drawer per wall `artKey`, drawing centred on `(0, 0)` in the wall's
 * own flat coordinates (the caller applies the shear), no wider than
 * `WALL_ART_MAX_WIDTH`.
 */
const WALL_ART_DRAWERS: Record<string, WallArtDrawer> = {
  'rgb-light-strip': (ctx) => {
    ctx.shadowColor = CSS_CYAN;
    ctx.shadowBlur = 10;
    ctx.fillStyle = CSS_CYAN;
    roundRect(ctx, -18, -3, 36, 6, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CSS_LIGHT;
    ctx.stroke();
  },
  'jg-pennant': (ctx) => {
    ctx.fillStyle = CSS_TEAL;
    ctx.beginPath();
    ctx.moveTo(-17, -11);
    ctx.lineTo(17, 0);
    ctx.lineTo(-17, 11);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CSS_CYAN;
    ctx.stroke();
    ctx.fillStyle = CSS_LIGHT;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JG', -6, 0);
  },
  'framed-team-photo': (ctx) => {
    ctx.fillStyle = CSS_BASE;
    ctx.fillRect(-17, -13, 34, 26);
    ctx.fillStyle = CSS_LIGHT;
    ctx.fillRect(-13, -9, 26, 18);
    ctx.fillStyle = CSS_CYAN;
    for (const dx of [-7, 0, 7]) {
      ctx.beginPath();
      ctx.arc(dx, 1, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = CSS_TEAL;
    ctx.fillRect(-13, 5, 26, 4);
  },
  'ship-it-sign': (ctx) => {
    ctx.fillStyle = CSS_DARK;
    roundRect(ctx, -19, -8, 38, 16, 4);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CSS_CYAN;
    ctx.stroke();
    ctx.fillStyle = CSS_CYAN;
    ctx.shadowColor = CSS_CYAN;
    ctx.shadowBlur = 6;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHIP IT', 0, 1);
    ctx.shadowBlur = 0;
  },
  dartboard: (ctx) => {
    for (const [radius, fill] of [
      [15, CSS_TEAL],
      [11, CSS_LIGHT],
      [7, CSS_CYAN],
      [3, CSS_TEAL],
    ] as const) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CSS_BASE;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  },
};

/**
 * The award items (#135 D7): each draws its logo, loaded by `RoomScene`'s
 * Igloo `preload()` as a Phaser texture, inside a frame on the wall.
 */
export const FURNITURE_IMAGE_ART: Readonly<Record<string, { textureKey: string; url: string }>> = {
  'award-bptw': { textureKey: 'furniture-award-bptw', url: 'awards/bptw.svg' },
  'award-inc5000': { textureKey: 'furniture-award-inc5000', url: 'awards/inc500.svg' },
  'award-top-workplaces': {
    textureKey: 'furniture-award-top-workplaces',
    url: 'awards/top-wp.svg',
  },
};

/** The size award logos are rasterised at when loaded (`load.svg`), before framing. */
export const AWARD_LOGO_LOAD_SIZE = 64;

function drawAwardFrame(ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null): void {
  ctx.fillStyle = CSS_LIGHT;
  ctx.fillRect(-19, -19, 38, 38);
  ctx.lineWidth = 3;
  ctx.strokeStyle = CSS_TEAL;
  ctx.strokeRect(-19, -19, 38, 38);
  if (logo) ctx.drawImage(logo, -15, -15, 30, 30);
}

/** Every `artKey` this module draws with a dedicated shape, for any placement. */
export const KNOWN_FURNITURE_ART_KEYS: readonly string[] = [
  ...Object.keys(FLOOR_ART_BUILDERS),
  ...Object.keys(WALL_ART_DRAWERS),
  ...Object.keys(FURNITURE_IMAGE_ART),
  'disco-ball',
];

/**
 * Pure lookup, split out from `drawFurnitureArt` so the "known artKey vs.
 * fallback" decision is unit-testable without a real Phaser `Scene` (this
 * repo's tests never construct one -- see `furniture-art.test.ts`).
 */
export function isKnownFurnitureArtKey(artKey: string): boolean {
  return KNOWN_FURNITURE_ART_KEYS.includes(artKey);
}

/** A generic diamond placeholder for any `artKey` this module doesn't recognise yet. */
function fallbackArt(g: GameObjects.Graphics): void {
  const points = [
    { x: 0, y: -40 },
    { x: 20, y: -20 },
    { x: 0, y: 0 },
    { x: -20, y: -20 },
  ];
  g.fillStyle(ART_TEAL, 1);
  g.fillPoints(points, true);
  g.lineStyle(2, ART_CYAN, 1);
  g.strokePoints(points, true);
}

function drawFallbackWallArt(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CSS_TEAL;
  ctx.fillRect(-15, -15, 30, 30);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CSS_CYAN;
  ctx.strokeRect(-15, -15, 30, 30);
}

/** Where, and how, one Furniture item is drawn. */
export type FurnitureArtPlacement =
  | { placement: 'floor' }
  | { placement: 'wall'; wall: 'left' | 'right' }
  | { placement: 'ceiling'; cordTopY: number };

// Canvas size for a sheared wall-art texture: 38 px wide art sheared by 0.5
// grows up to 19 px taller; the rest is room for glow.
const WALL_TEXTURE_WIDTH = 56;
const WALL_TEXTURE_HEIGHT = 84;

/**
 * The canvas texture key for `artKey` hung on `wall`, created on first use
 * and reused after that (textures outlive a Scene restart). Returns `null`
 * when this Scene can't make canvas textures (the headless renderer).
 */
function ensureWallTexture(
  scene: Pick<Scene, 'textures'>,
  artKey: string,
  wall: 'left' | 'right',
): string | null {
  const key = `furniture-wall:${artKey}:${wall}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, WALL_TEXTURE_WIDTH, WALL_TEXTURE_HEIGHT);
  const ctx = texture?.getContext();
  if (!texture || !ctx) return null;

  ctx.save();
  ctx.setTransform(
    1,
    wall === 'left' ? -0.5 : 0.5,
    0,
    1,
    WALL_TEXTURE_WIDTH / 2,
    WALL_TEXTURE_HEIGHT / 2,
  );
  const image = FURNITURE_IMAGE_ART[artKey];
  if (image) {
    const logo = scene.textures.exists(image.textureKey)
      ? (scene.textures.get(image.textureKey).getSourceImage() as CanvasImageSource)
      : null;
    drawAwardFrame(ctx, logo);
  } else {
    (WALL_ART_DRAWERS[artKey] ?? drawFallbackWallArt)(ctx);
  }
  ctx.restore();
  texture.refresh();
  return key;
}

function drawDiscoBall(g: GameObjects.Graphics, cordLength: number): void {
  const radius = 18;
  g.lineStyle(1.5, ART_LIGHT, 1);
  g.lineBetween(0, -cordLength, 0, -radius);
  g.fillStyle(ART_CYAN, 1);
  g.fillCircle(0, 0, radius);
  g.lineStyle(1, ART_LIGHT, 0.85);
  for (const angle of [0, 30, 60, 90, 120, 150]) {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * radius;
    const dy = Math.sin(rad) * radius;
    g.lineBetween(-dx, -dy, dx, dy);
  }
  g.strokeCircle(0, 0, radius);
}

/**
 * Draws `artKey`'s Room art as a new `Container` at `point`, left
 * un-depth-sorted: the caller (`RoomScene.renderFurniture`) sets its depth.
 * `point` is a floor Tile's screen centre, a wall slot's anchor, or where
 * the ceiling slot's item hangs (its cord runs up to `cordTopY`).
 */
export function drawFurnitureArt(
  scene: Pick<Scene, 'add' | 'textures'>,
  artKey: string,
  point: { x: number; y: number },
  where: FurnitureArtPlacement = { placement: 'floor' },
): GameObjects.Container {
  const container = scene.add.container(point.x, point.y);

  if (where.placement === 'wall') {
    const key = ensureWallTexture(scene, artKey, where.wall);
    if (key) {
      container.add(scene.add.image(0, 0, key));
      return container;
    }
  }

  const graphics = scene.add.graphics();
  container.add(graphics);
  if (where.placement === 'ceiling' && artKey === 'disco-ball') {
    drawDiscoBall(graphics, point.y - where.cordTopY);
  } else {
    (FLOOR_ART_BUILDERS[artKey] ?? fallbackArt)(graphics);
  }
  return container;
}

/** The ceiling item's shadow on the floor, drawn at floor depth by the caller. */
export function drawCeilingShadow(
  scene: Pick<Scene, 'add'>,
  point: { x: number; y: number },
): GameObjects.Graphics {
  const graphics = scene.add.graphics();
  graphics.fillStyle(ART_TEAL, 0.28);
  graphics.fillEllipse(point.x, point.y, 48, 18);
  return graphics;
}
