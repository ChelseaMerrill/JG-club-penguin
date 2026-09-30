import type { GameObjects, Scene } from 'phaser';
import type { ScreenPoint } from '../rooms/iso';
import { ensureSvgTexture } from '../svg-texture';
import {
  CHICKEN_HAND_OFFSET,
  CHICKEN_TOSS_PERIOD_MS,
  CHICKEN_VIEWBOX,
  pickChickenTarget,
  planChickenToss,
  renderChickenSvg,
  sampleChickenToss,
  type ChickenTarget,
  type ChickenTossPlan,
} from './chicken-toss';

const CHICKEN_TEXTURE_KEY = 'npc-prop:ashley-chicken-toss';

/** When the first toss goes, after the Room opens: she holds it a moment first. */
const FIRST_TOSS_MS = 2500;

/** The design's `sq1`-`sq3`: shown ~4% of 9 s while rising 12 px, then faded over ~2%. */
const SQUEAK_SHOW_MS = 360;
const SQUEAK_FADE_MS = 180;
const SQUEAK_RISE = 12;

export interface RoomChickenTossOptions {
  /** Where the thrower's feet are right now; `undefined` while she isn't drawn. */
  throwerFeet: () => ScreenPoint | undefined;
  /** The Penguins in the Room right now, local and remote. */
  targets: () => ChickenTarget[];
  /** Draws over everything in the Room, as the design's chicken does. */
  depth: number;
}

interface Flight {
  plan: ChickenTossPlan;
  elapsedMs: number;
  squeaked: number;
  image: GameObjects.Image;
}

/**
 * Ashley's squeaky-chicken toss (owner request, 2026-09-30, Track D;
 * `chicken-toss.ts` has the rules): every 9 s she throws the design's
 * chicken at a Penguin in the Room, which tumbles, squeaks on each landing,
 * and fades. `RoomScene` builds one only when motion is allowed, calls
 * `update` each frame and `destroy` on shutdown.
 */
export class RoomChickenToss {
  private clockMs = 0;
  private nextTossMs = FIRST_TOSS_MS;
  private lastTargetId: string | null = null;
  private tosses = 0;
  private flight: Flight | null = null;
  private readonly squeaks = new Set<GameObjects.Text>();

  constructor(
    private readonly scene: Scene,
    private readonly options: RoomChickenTossOptions,
  ) {
    ensureSvgTexture(scene.textures, CHICKEN_TEXTURE_KEY, renderChickenSvg);
  }

  update(deltaMs: number): void {
    this.clockMs += deltaMs;
    if (!this.flight && this.clockMs >= this.nextTossMs) {
      this.nextTossMs += CHICKEN_TOSS_PERIOD_MS;
      this.toss();
    }
    const flight = this.flight;
    if (!flight) return;
    flight.elapsedMs += deltaMs;
    while (
      flight.squeaked < flight.plan.landingsMs.length &&
      flight.elapsedMs >= flight.plan.landingsMs[flight.squeaked]!
    ) {
      this.squeak(flight.plan.hops[flight.squeaked]!.to);
      flight.squeaked += 1;
    }
    const pose = sampleChickenToss(flight.plan, flight.elapsedMs);
    if (!pose) {
      flight.image.destroy();
      this.flight = null;
      return;
    }
    this.place(flight.image, pose.point);
    flight.image.setRotation(pose.rotation).setAlpha(pose.alpha);
  }

  /** `__roomDebug.chickenToss`. */
  debug(): { tosses: number; lastTargetId: string | null; flying: boolean } {
    return { tosses: this.tosses, lastTargetId: this.lastTargetId, flying: this.flight !== null };
  }

  destroy(): void {
    this.flight?.image.destroy();
    this.flight = null;
    for (const squeak of this.squeaks) squeak.destroy();
    this.squeaks.clear();
  }

  private toss(): void {
    // Skipped (not queued) while the texture is still decoding or nobody is here.
    if (!this.scene.textures.exists(CHICKEN_TEXTURE_KEY)) return;
    const feet = this.options.throwerFeet();
    if (!feet) return;
    const target = pickChickenTarget(this.options.targets(), this.lastTargetId);
    if (!target) return;
    this.lastTargetId = target.id;
    this.tosses += 1;
    const hand = { x: feet.x + CHICKEN_HAND_OFFSET.x, y: feet.y + CHICKEN_HAND_OFFSET.y };
    const image = this.scene.add
      .image(0, 0, CHICKEN_TEXTURE_KEY)
      .setScale(0.5)
      .setDepth(this.options.depth);
    this.place(image, hand);
    this.flight = { plan: planChickenToss(hand, target.feet), elapsedMs: 0, squeaked: 0, image };
  }

  /** Puts the chicken's design origin on `point`: the image is centred on its fill box. */
  private place(image: GameObjects.Image, point: ScreenPoint): void {
    const { x, y, width, height } = CHICKEN_VIEWBOX;
    image.setPosition(point.x + x + width / 2, point.y + y + height / 2);
  }

  /** A "SQUEAK" callout at a landing, styled as the design's `sq1`-`sq3` text. */
  private squeak(point: ScreenPoint): void {
    const text = this.scene.add
      .text(point.x, point.y - 20, 'SQUEAK', {
        fontFamily: "'Anton', Impact, sans-serif",
        fontSize: '13px',
        color: '#F2C12E',
        stroke: '#0C4B5F',
        strokeThickness: 4,
      })
      .setLetterSpacing(1)
      .setOrigin(0.5, 1)
      .setDepth(this.options.depth);
    this.squeaks.add(text);
    this.scene.tweens.add({
      targets: text,
      y: text.y - SQUEAK_RISE,
      duration: SQUEAK_SHOW_MS / 3,
    });
    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      delay: SQUEAK_SHOW_MS,
      duration: SQUEAK_FADE_MS,
      onComplete: () => {
        this.squeaks.delete(text);
        text.destroy();
      },
    });
  }
}
