import type { GameObjects, Scene } from 'phaser';
import { ensureSvgTexture } from '../svg-texture';
import {
  feedMeAlpha,
  sampleTankFish,
  TANK_FISH_FEED_ME,
  TANK_FISH_NAMEPLATE,
  tankFishSvg,
  type TankFish,
} from './tank-fish';

/** The design's nameplate: Libre Franklin 700 10 px, cyan on near-black. */
const NAMEPLATE_PADDING_X = 6;
/** The design's "feed me" bubble text: Libre Franklin 700 12 px, near-black on white. */
const BUBBLE_FILL = 0xf4f4f4;

export interface RoomTankFishOptions {
  /** Where it sorts against Penguins: the tank's own floor tile's depth. */
  depth: number;
  /** Where its "feed me" bubble sorts: above every Penguin, as NPC bubbles do. */
  bubbleDepth: number;
  /** Under reduced motion it stays still at the swim's start, with no bubble. */
  reducedMotion: boolean;
}

/**
 * Draws a Room's tank fish (`tank-fish.ts`): the swimming fish, its
 * nameplate, and its "feed me" bubble. `RoomScene` builds one for a Room with
 * a `tankFish`, calls `update` each frame and `destroy` on shutdown.
 */
export class RoomTankFish {
  private elapsedMs = 0;
  private readonly fish: GameObjects.Image;
  private readonly nameplate: GameObjects.Container;
  private readonly bubble: GameObjects.Container;
  private readonly rightKey: string;
  private readonly leftKey: string;

  constructor(
    private readonly scene: Scene,
    spec: TankFish,
    private readonly options: RoomTankFishOptions,
  ) {
    const id = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    this.rightKey = `tank-fish:${id}:right`;
    this.leftKey = `tank-fish:${id}:left`;
    ensureSvgTexture(scene.textures, this.rightKey, () => tankFishSvg(spec, 1));
    ensureSvgTexture(scene.textures, this.leftKey, () => tankFishSvg(spec, -1));

    // Rendered at 2x for crispness; the texture is centred on the fish's origin.
    this.fish = scene.add.image(0, 0, '__DEFAULT').setScale(0.5).setDepth(options.depth);
    this.fish.setVisible(false);

    const label = scene.add
      .text(0, 0, `${spec.name} · betta`, {
        fontFamily: "'Libre Franklin', sans-serif",
        fontStyle: '700',
        fontSize: '10px',
        color: '#00BDFF',
      })
      .setOrigin(0.5, 0.5);
    const width = label.width + NAMEPLATE_PADDING_X * 2;
    const { height } = TANK_FISH_NAMEPLATE;
    const pill = scene.add.graphics();
    pill.fillStyle(0x161719, 1);
    pill.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    pill.lineStyle(1.5, 0x0c4b5f, 1);
    pill.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    this.nameplate = scene.add
      .container(TANK_FISH_NAMEPLATE.x, TANK_FISH_NAMEPLATE.y + height / 2, [pill, label])
      .setDepth(options.depth);

    const { dots, pill: bubblePill, text } = TANK_FISH_FEED_ME;
    const bubbleShape = scene.add.graphics();
    bubbleShape.fillStyle(BUBBLE_FILL, 1);
    for (const dot of dots) bubbleShape.fillCircle(dot.x, dot.y, dot.r);
    bubbleShape.fillRoundedRect(
      bubblePill.x,
      bubblePill.y,
      bubblePill.width,
      bubblePill.height,
      bubblePill.radius,
    );
    const bubbleText = scene.add
      .text(bubblePill.x + bubblePill.width / 2, bubblePill.y + bubblePill.height / 2, text, {
        fontFamily: "'Libre Franklin', sans-serif",
        fontStyle: '700',
        fontSize: '12px',
        color: '#161719',
      })
      .setOrigin(0.5, 0.5);
    this.bubble = scene.add
      .container(0, 0, [bubbleShape, bubbleText])
      .setDepth(options.bubbleDepth)
      .setAlpha(0);

    this.apply();
  }

  update(deltaMs: number): void {
    if (this.options.reducedMotion) return;
    this.elapsedMs += deltaMs;
    this.apply();
  }

  destroy(): void {
    this.fish.destroy();
    this.nameplate.destroy();
    this.bubble.destroy();
  }

  private apply(): void {
    const { point, facing } = sampleTankFish(this.elapsedMs);
    const key = facing >= 0 ? this.rightKey : this.leftKey;
    if (this.scene.textures.exists(key)) {
      if (this.fish.texture.key !== key) this.fish.setTexture(key);
      this.fish.setVisible(true);
    }
    // The texture carries the facing; this narrows it through the turn.
    this.fish.setPosition(point.x, point.y).setScale(0.5 * Math.abs(facing), 0.5);
    this.bubble.setAlpha(this.options.reducedMotion ? 0 : feedMeAlpha(this.elapsedMs));
  }
}
