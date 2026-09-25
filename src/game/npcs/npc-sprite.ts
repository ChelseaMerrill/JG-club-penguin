import { GameObjects, Textures, type Scene, type Tweens } from 'phaser';
import type { NpcDefinition } from '../../npcs/npcs';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_ORIGIN,
} from '../penguin/render-svg';
import { ensureNpcTexture } from './texture';

/** Phaser's always-present built-in placeholder texture (matches #31's own sprite). */
const PLACEHOLDER_TEXTURE_KEY = '__DEFAULT';

// Nameplate: a dark pill with a teal outline and light text, per every Room
// design's own NPC nameplate markup (`design/Room 02 Dev Pit.dc.html` and
// siblings) -- distinct from #31's own light-blue Penguin name tag.
const NAME_TAG_BG = 0x161719;
const NAME_TAG_BORDER = 0x0c4b5f;
const NAME_TAG_BORDER_WIDTH = 2;
const NAME_TAG_TEXT_COLOR = '#F4F4F4';
const NAME_TAG_FONT_FAMILY = 'Libre Franklin, sans-serif';
const NAME_TAG_FONT_WEIGHT = '700';
const NAME_TAG_FONT_SIZE = '12px';
const NAME_TAG_PADDING_X = 10;
const NAME_TAG_PADDING_Y = 4;
const NAME_TAG_GAP = 6;

// Speech bubble: a white rounded pill with dark text and a small pointer,
// per the same Room designs' idle speech-bubble markup.
const SPEECH_BUBBLE_BG = 0xf4f4f4;
const SPEECH_BUBBLE_TEXT_COLOR = '#161719';
const SPEECH_BUBBLE_FONT_FAMILY = 'Libre Franklin, sans-serif';
const SPEECH_BUBBLE_FONT_WEIGHT = '700';
const SPEECH_BUBBLE_FONT_SIZE = '13px';
const SPEECH_BUBBLE_PADDING_X = 10;
const SPEECH_BUBBLE_PADDING_Y = 8;
const SPEECH_BUBBLE_RADIUS = 8;
const SPEECH_BUBBLE_POINTER_HALF_WIDTH = 6;
const SPEECH_BUBBLE_POINTER_HEIGHT = 8;
const SPEECH_BUBBLE_GAP = 14;
const SPEECH_BUBBLE_MAX_TEXT_WIDTH = 200;

/**
 * Approximate design-space head-top y (the figure's head circle sits around
 * y=15-40 in the shared 0-130 box) minus `PENGUIN_ORIGIN.y` (120, the
 * feet-anchor): the local-space y offset, relative to the sprite's own feet
 * anchor, the speech bubble floats above (#36 D2, matching the Room designs'
 * own bubble-above-head placement).
 */
const HEAD_TOP_OFFSET_Y = -105;

const BOB_DISTANCE = 6;
const BOB_DURATION_MS = 900;

export interface NpcSprite {
  readonly container: GameObjects.Container;
  destroy(): void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Builds a Phaser container for `npc` at world position `(x, y)`: its figure
 * sprite (anchored at the feet, same frame math as #31's Penguin), a small
 * idle bob tween (skipped under reduced motion, matching #35's Creator
 * preview check), a dark nameplate below it, and a speech bubble with its
 * idle line above it (#36 D2). NPCs never walk, so there is only ever one
 * static frame -- no anim/frame timer the way #31's animated Penguin needs.
 */
export function createNpcSprite(scene: Scene, x: number, y: number, npc: NpcDefinition): NpcSprite {
  const originX = (PENGUIN_ORIGIN.x + PENGUIN_FRAME_PADDING_X) / PENGUIN_FRAME_WIDTH;
  const originY = (PENGUIN_ORIGIN.y + PENGUIN_FRAME_PADDING_Y) / PENGUIN_FRAME_HEIGHT;

  const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
  sprite.setOrigin(originX, originY);

  const key = ensureNpcTexture(scene, npc);
  if (scene.textures.exists(key)) {
    sprite.setTexture(key);
  } else {
    const listener = (): void => {
      sprite.setTexture(key);
    };
    scene.textures.once(Textures.Events.ADD_KEY + key, listener);
  }

  // Nameplate.
  const namePill = new GameObjects.Graphics(scene);
  const nameText = new GameObjects.Text(scene, 0, NAME_TAG_GAP + NAME_TAG_PADDING_Y, npc.name, {
    fontFamily: NAME_TAG_FONT_FAMILY,
    fontStyle: NAME_TAG_FONT_WEIGHT,
    fontSize: NAME_TAG_FONT_SIZE,
    color: NAME_TAG_TEXT_COLOR,
  });
  nameText.setOrigin(0.5, 0);
  const nameWidth = nameText.width + NAME_TAG_PADDING_X * 2;
  const nameHeight = nameText.height + NAME_TAG_PADDING_Y * 2;
  namePill.fillStyle(NAME_TAG_BG, 1);
  namePill.fillRoundedRect(-nameWidth / 2, NAME_TAG_GAP, nameWidth, nameHeight, nameHeight / 2);
  namePill.lineStyle(NAME_TAG_BORDER_WIDTH, NAME_TAG_BORDER, 1);
  namePill.strokeRoundedRect(-nameWidth / 2, NAME_TAG_GAP, nameWidth, nameHeight, nameHeight / 2);

  // Speech bubble, above the head.
  const bubbleGraphics = new GameObjects.Graphics(scene);
  const bubbleText = new GameObjects.Text(scene, 0, 0, npc.idleLine, {
    fontFamily: SPEECH_BUBBLE_FONT_FAMILY,
    fontStyle: SPEECH_BUBBLE_FONT_WEIGHT,
    fontSize: SPEECH_BUBBLE_FONT_SIZE,
    color: SPEECH_BUBBLE_TEXT_COLOR,
    align: 'center',
    wordWrap: { width: SPEECH_BUBBLE_MAX_TEXT_WIDTH },
  });
  bubbleText.setOrigin(0.5, 0);
  const bubbleWidth = bubbleText.width + SPEECH_BUBBLE_PADDING_X * 2;
  const bubbleHeight = bubbleText.height + SPEECH_BUBBLE_PADDING_Y * 2;
  const bubbleBottomY = HEAD_TOP_OFFSET_Y - SPEECH_BUBBLE_GAP;
  const bubbleTopY = bubbleBottomY - bubbleHeight;
  bubbleGraphics.fillStyle(SPEECH_BUBBLE_BG, 1);
  bubbleGraphics.fillRoundedRect(
    -bubbleWidth / 2,
    bubbleTopY,
    bubbleWidth,
    bubbleHeight,
    SPEECH_BUBBLE_RADIUS,
  );
  bubbleGraphics.fillTriangle(
    -SPEECH_BUBBLE_POINTER_HALF_WIDTH,
    bubbleBottomY,
    SPEECH_BUBBLE_POINTER_HALF_WIDTH,
    bubbleBottomY,
    0,
    bubbleBottomY + SPEECH_BUBBLE_POINTER_HEIGHT,
  );
  bubbleText.setPosition(0, bubbleTopY + SPEECH_BUBBLE_PADDING_Y);

  const container = scene.add.container(x, y, [
    sprite,
    namePill,
    nameText,
    bubbleGraphics,
    bubbleText,
  ]);

  let bobTween: Tweens.Tween | null = null;
  if (!prefersReducedMotion()) {
    bobTween = scene.tweens.add({
      targets: sprite,
      y: -BOB_DISTANCE,
      duration: BOB_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return {
    container,
    destroy() {
      bobTween?.stop();
      container.destroy();
    },
  };
}
