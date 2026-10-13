import type { GameObjects, Scene } from 'phaser';
import type { HexColor } from '../../contracts';
import { discoTileColourAt, type DiscoFloorTile } from './disco-floor';

/** The design's own stroke on every dance-floor polygon (`disco-floor.ts`). */
const STROKE_COLOUR = 0x0e1013;
const STROKE_WIDTH = 1;

export interface RoomDiscoFloorOptions {
  /** Where the floor sorts against the Room's background image and its Penguins/NPCs/furniture. */
  depth: number;
  /** Under reduced motion it stays at its `t = 0` colours, drawn once, with no per-frame redraw. */
  reducedMotion: boolean;
}

/**
 * Draws a Room's animated dance floor (`disco-floor.ts`): a single `Graphics`
 * redrawn each frame, one filled-and-stroked polygon per tile, each tile's
 * fill cycling through its own SMIL colour stops. `RoomScene` builds one for
 * a Room with `animatedFloorTiles`, calls `update` each frame and `destroy`
 * on shutdown -- the same lifecycle `RoomTankFish` uses for Town Center's fish.
 */
export class RoomDiscoFloor {
  private elapsedMs = 0;
  private readonly graphics: GameObjects.Graphics;
  private currentColours: HexColor[];

  constructor(
    scene: Scene,
    private readonly tiles: readonly DiscoFloorTile[],
    private readonly options: RoomDiscoFloorOptions,
  ) {
    this.graphics = scene.add.graphics().setDepth(options.depth);
    this.currentColours = this.tiles.map((tile) => discoTileColourAt(tile, 0));
    this.draw();
  }

  update(deltaMs: number): void {
    if (this.options.reducedMotion) return;
    this.elapsedMs += deltaMs;
    this.currentColours = this.tiles.map((tile) => discoTileColourAt(tile, this.elapsedMs));
    this.draw();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  /** Each tile's current fill, in `tiles` order (debug-only: `window.__roomDebug.discoFloor`). */
  debug(): readonly HexColor[] {
    return this.currentColours;
  }

  private draw(): void {
    this.graphics.clear();
    this.tiles.forEach((tile, index) => {
      const points = tile.points.map((point) => ({ x: point.x, y: point.y }));
      this.graphics.fillStyle(Number.parseInt(this.currentColours[index].slice(1), 16), 1);
      this.graphics.fillPoints(points, true);
      this.graphics.lineStyle(STROKE_WIDTH, STROKE_COLOUR, 1);
      this.graphics.strokePoints(points, true);
    });
  }
}
