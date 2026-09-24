/**
 * STUB for #31. A minimal Phaser Penguin renderer: each Penguin is a
 * Container of a body ellipse, a belly ellipse, a beak triangle and a name
 * Text, with a gentle idle y-bob tween. Replace wholesale when #31 lands.
 */
import type { GameObjects, Scene } from 'phaser';
import { UNNAMED_PENGUIN, type PenguinLook, type PresencePayload, type Tile } from '../contracts';
import type { RemotePenguinView } from '../realtime/room-channel';
import { maskName } from '../ui/mask-names';

const BODY_WIDTH = 48;
const BODY_HEIGHT = 60;
const BELLY_WIDTH = 28;
const BELLY_HEIGHT = 40;
const BEAK_HALF_WIDTH = 6;
const BEAK_HEIGHT = 10;
const NAME_OFFSET_Y = 40;
const BOB_DISTANCE = 6;
const BOB_DURATION_MS = 900;
const TILE_WIDTH = 100;
const TILE_HEIGHT = 50;

interface PenguinEntry {
  container: GameObjects.Container;
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
    x: 800 + (tile.col - tile.row) * (TILE_WIDTH / 2),
    y: 200 + (tile.col + tile.row) * (TILE_HEIGHT / 2),
  };
}

function shownName(name: string): string {
  return maskName(name || UNNAMED_PENGUIN);
}

/** Renders remote (and the local) Penguins as Phaser Containers. */
export class PenguinSpriteView implements RemotePenguinView {
  private readonly scene: Scene;
  private readonly remote = new Map<string, PenguinEntry>();
  private local: PenguinEntry | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private build(payload: PresencePayload): PenguinEntry {
    const { look, tile } = payload;
    const { x, y } = isoPosition(tile);
    const body = this.scene.add.ellipse(0, 0, BODY_WIDTH, BODY_HEIGHT, hexToColor(look.body));
    const belly = this.scene.add.ellipse(0, 6, BELLY_WIDTH, BELLY_HEIGHT, hexToColor(look.belly));
    const beak = this.scene.add.triangle(
      0,
      -4,
      -BEAK_HALF_WIDTH,
      0,
      BEAK_HALF_WIDTH,
      0,
      0,
      BEAK_HEIGHT,
      hexToColor(look.beak),
    );
    const nameText = this.scene.add
      .text(0, NAME_OFFSET_Y, shownName(look.name), { fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5, 0);
    const container = this.scene.add.container(x, y, [body, belly, beak, nameText]);

    this.scene.tweens.add({
      targets: container,
      y: `-=${BOB_DISTANCE}`,
      duration: BOB_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return { container, body, belly, beak, nameText };
  }

  private applyLook(entry: PenguinEntry, look: PenguinLook): void {
    entry.body.setFillStyle(hexToColor(look.body));
    entry.belly.setFillStyle(hexToColor(look.belly));
    entry.beak.setFillStyle(hexToColor(look.beak));
    entry.nameText.setText(shownName(look.name));
  }

  /** Adds or, for an already-shown `playerId`, updates in place (never a second Container). */
  upsert(p: PresencePayload): void {
    const existing = this.remote.get(p.playerId);
    if (existing) {
      this.applyLook(existing, p.look);
      const { x, y } = isoPosition(p.tile);
      existing.container.setPosition(x, y);
      return;
    }
    this.remote.set(p.playerId, this.build(p));
  }

  remove(playerId: string): void {
    const entry = this.remote.get(playerId);
    if (!entry) return;
    entry.container.destroy();
    this.remote.delete(playerId);
  }

  clear(): void {
    for (const entry of this.remote.values()) entry.container.destroy();
    this.remote.clear();
  }

  /** Shows the signed-in Player's own Penguin (not part of the remote roster). */
  showLocal(payload: PresencePayload): void {
    this.local?.container.destroy();
    this.local = this.build(payload);
  }
}
