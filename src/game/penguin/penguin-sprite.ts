import { GameObjects, Textures, type Scene, type Time } from 'phaser';
import { DEFAULT_FACING, UNNAMED_PENGUIN, type Facing, type PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { PENGUIN_FRAME_MS, PENGUIN_FRAMES, type PenguinAnim } from './poses';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_ORIGIN,
} from './render-svg';
import { ensurePenguinTextures, penguinTextureKey } from './texture';

const NAME_TAG_BG = 0x00bdff;
const NAME_TAG_TEXT_COLOR = '#161719';
const NAME_TAG_PADDING_X = 10;
const NAME_TAG_PADDING_Y = 5;
// Small gap below the feet anchor before the name tag starts.
const NAME_TAG_GAP = 8;

export interface Penguin {
  readonly container: GameObjects.Container;
  idle(): void;
  walk(): void;
  setFacing(facing: Facing): void;
  setLook(look: PenguinLook): void;
  destroy(): void;
}

/**
 * Builds a Phaser container for `look` at world position `(x, y)`: the
 * animated figure sprite, anchored at its feet, plus a Libre Franklin
 * name-tag pill below it showing `look.name || UNNAMED_PENGUIN` (#31 D7).
 *
 * Registers `look`'s textures via `ensurePenguinTextures` and starts on
 * `__DEFAULT` (Phaser's built-in placeholder texture, always present),
 * switching to the real frame once its texture has decoded.
 */
export function createPenguin(scene: Scene, x: number, y: number, look: PenguinLook): Penguin {
  const originX = (PENGUIN_ORIGIN.x + PENGUIN_FRAME_PADDING) / PENGUIN_FRAME_WIDTH;
  const originY = (PENGUIN_ORIGIN.y + PENGUIN_FRAME_PADDING) / PENGUIN_FRAME_HEIGHT;

  let currentLook = look;
  let currentHash = penguinLookHash(look);
  let currentAnim: PenguinAnim = look.emote;
  let currentFrame = 0;
  let facing: Facing = DEFAULT_FACING;
  let destroyed = false;
  let frameTimer: Time.TimerEvent | null = null;

  ensurePenguinTextures(scene, look);

  const sprite = new GameObjects.Sprite(scene, 0, 0, '__DEFAULT');
  sprite.setOrigin(originX, originY);

  const pill = new GameObjects.Graphics(scene);
  const nameText = new GameObjects.Text(scene, 0, NAME_TAG_GAP + NAME_TAG_PADDING_Y, '', {
    fontFamily: 'Libre Franklin, sans-serif',
    fontStyle: '700',
    fontSize: '13px',
    color: NAME_TAG_TEXT_COLOR,
  });
  nameText.setOrigin(0.5, 0);

  const container = scene.add.container(x, y, [sprite, pill, nameText]);

  function redrawNameTag(): void {
    nameText.setText(currentLook.name || UNNAMED_PENGUIN);
    const width = nameText.width + NAME_TAG_PADDING_X * 2;
    const height = nameText.height + NAME_TAG_PADDING_Y * 2;
    pill.clear();
    pill.fillStyle(NAME_TAG_BG, 1);
    pill.fillRoundedRect(-width / 2, NAME_TAG_GAP, width, height, height / 2);
  }
  redrawNameTag();

  function applyFrame(): void {
    const key = penguinTextureKey(currentHash, currentAnim, currentFrame);
    if (scene.textures.exists(key)) {
      sprite.setTexture(key);
      return;
    }
    // The texture hasn't decoded yet (`addBase64` is async); pick it up once
    // it has, but only if this frame is still the one requested by then (the
    // anim/frame may have advanced past it in the meantime).
    scene.textures.once(Textures.Events.ADD_KEY + key, () => {
      if (destroyed) return;
      if (penguinTextureKey(currentHash, currentAnim, currentFrame) === key) {
        sprite.setTexture(key);
      }
    });
  }

  function stopFrameTimer(): void {
    frameTimer?.remove();
    frameTimer = null;
  }

  function play(anim: PenguinAnim): void {
    stopFrameTimer();
    currentAnim = anim;
    currentFrame = 0;
    applyFrame();
    const frameCount = PENGUIN_FRAMES[anim];
    if (frameCount <= 1) return;
    frameTimer = scene.time.addEvent({
      delay: PENGUIN_FRAME_MS[anim],
      loop: true,
      callback: () => {
        currentFrame = (currentFrame + 1) % frameCount;
        applyFrame();
      },
    });
  }

  play(currentAnim);

  return {
    container,
    idle() {
      play(currentLook.emote);
    },
    walk() {
      play('WALK');
    },
    setFacing(next: Facing) {
      facing = next;
      sprite.setFlipX(facing === 'left');
    },
    setLook(next: PenguinLook) {
      const wasWalking = currentAnim === 'WALK';
      currentLook = next;
      currentHash = penguinLookHash(next);
      ensurePenguinTextures(scene, next);
      redrawNameTag();
      play(wasWalking ? 'WALK' : next.emote);
    },
    destroy() {
      destroyed = true;
      stopFrameTimer();
      container.destroy();
    },
  };
}
