/**
 * STUB for #31. A minimal Phaser Penguin renderer. Each Penguin is an outer
 * Container placed at its tile, holding an inner bob Container (the idle
 * y-bob tween moves only this one, so `setPosition` on the outer Container
 * never fights the tween) with a mirrored figure (body, belly and beak
 * shapes) and a name Text. Replace wholesale when #31 lands.
 */
import type { GameObjects, Scene } from 'phaser';
import {
  UNNAMED_PENGUIN,
  type Facing,
  type PenguinLook,
  type PresencePayload,
  type Tile,
} from '../contracts';
import type { RemotePenguinView } from '../realtime/room-channel';
import { maskName } from '../ui/mask-names';

const BODY_WIDTH = 48;
const BODY_HEIGHT = 60;
const BELLY_WIDTH = 28;
const BELLY_HEIGHT = 40;
const BEAK_OFFSET_X = 14;
const BEAK_HALF_HEIGHT = 5;
const BEAK_LENGTH = 10;
const NAME_OFFSET_Y = 40;
const BOB_DISTANCE = 6;
const BOB_DURATION_MS = 900;
const TILE_WIDTH = 100;
const TILE_HEIGHT = 50;
/** Screen position of tile (0, 0), so the stub Room is centred on the 1600x900 Stage. */
const ORIGIN_X = 800;
const ORIGIN_Y = 200;

interface PenguinEntry {
  container: GameObjects.Container;
  figure: GameObjects.Container;
  body: GameObjects.Ellipse;
  belly: GameObjects.Ellipse;
  beak: GameObjects.Triangle;
  nameText: GameObjects.Text;
}

function hexToColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Isometric projection: 100x50 tiles, matching the fixed Room layout. */
function isoPosition(tile: Tile): { x: number; y: number } {
  return {
    x: ORIGIN_X + (tile.col - tile.row) * (TILE_WIDTH / 2),
    y: ORIGIN_Y + (tile.col + tile.row) * (TILE_HEIGHT / 2),
  };
}

/** The design mirrors the figure with `scaleX(-1)`; the unmirrored figure faces right. */
function scaleXFor(facing: Facing): number {
  return facing === 'left' ? -1 : 1;
}

function shownName(name: string): string {
  return maskName(name || UNNAMED_PENGUIN);
}

/** Renders remote Penguins, and the local Player's own Penguin, as Phaser Containers. */
export class PenguinSpriteView implements RemotePenguinView {
  private readonly scene: Scene;
  private readonly remote = new Map<string, PenguinEntry>();
  private local: PenguinEntry | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private build(payload: PresencePayload): PenguinEntry {
    const { look, tile, facing } = payload;
    const { x, y } = isoPosition(tile);
    const body = this.scene.add.ellipse(0, 0, BODY_WIDTH, BODY_HEIGHT, hexToColor(look.body));
    const belly = this.scene.add.ellipse(0, 6, BELLY_WIDTH, BELLY_HEIGHT, hexToColor(look.belly));
    // A beak pointing right, so mirroring the figure points it left.
    const beak = this.scene.add.triangle(
      BEAK_OFFSET_X,
      -12,
      0,
      -BEAK_HALF_HEIGHT,
      0,
      BEAK_HALF_HEIGHT,
      BEAK_LENGTH,
      0,
      hexToColor(look.beak),
    );
    const figure = this.scene.add.container(0, 0, [body, belly, beak]);
    figure.setScale(scaleXFor(facing), 1);
    const nameText = this.scene.add
      .text(0, NAME_OFFSET_Y, shownName(look.name), { fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5, 0);
    const bob = this.scene.add.container(0, 0, [figure, nameText]);
    const container = this.scene.add.container(x, y, [bob]);

    this.scene.tweens.add({
      targets: bob,
      y: -BOB_DISTANCE,
      duration: BOB_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return { container, figure, body, belly, beak, nameText };
  }

  private apply(entry: PenguinEntry, payload: PresencePayload): void {
    const look: PenguinLook = payload.look;
    entry.body.setFillStyle(hexToColor(look.body));
    entry.belly.setFillStyle(hexToColor(look.belly));
    entry.beak.setFillStyle(hexToColor(look.beak));
    entry.nameText.setText(shownName(look.name));
    entry.figure.setScale(scaleXFor(payload.facing), 1);
    const { x, y } = isoPosition(payload.tile);
    entry.container.setPosition(x, y);
  }

  private destroy(entry: PenguinEntry): void {
    // Destroying the outer Container destroys its children, and Phaser
    // removes their tweens with them.
    this.scene.tweens.killTweensOf(entry.container.list);
    entry.container.destroy();
  }

  /** Adds or, for an already-shown `playerId`, updates in place (never a second Container). */
  upsert(p: PresencePayload): void {
    const existing = this.remote.get(p.playerId);
    if (existing) {
      this.apply(existing, p);
      return;
    }
    this.remote.set(p.playerId, this.build(p));
  }

  remove(playerId: string): void {
    const entry = this.remote.get(playerId);
    if (!entry) return;
    this.destroy(entry);
    this.remote.delete(playerId);
  }

  /** Removes every remote Penguin and the local Penguin. */
  clear(): void {
    for (const entry of this.remote.values()) this.destroy(entry);
    this.remote.clear();
    this.clearLocal();
  }

  /** Shows (or moves and restyles) the signed-in Player's own Penguin; not part of the remote roster. */
  showLocal(payload: PresencePayload): void {
    if (this.local) {
      this.apply(this.local, payload);
      return;
    }
    this.local = this.build(payload);
  }

  /** Removes the local Penguin, e.g. on sign-out. */
  clearLocal(): void {
    if (!this.local) return;
    this.destroy(this.local);
    this.local = null;
  }
}
