import { GameObjects, Textures, type Scene, type Time } from 'phaser';
import { DEFAULT_FACING, type Facing, type PenguinLook } from '../../contracts';
import { penguinLookHash } from './look-hash';
import { PLAYER_PENGUIN_SCALE } from './player-penguin-scale';
import { PENGUIN_FRAME_MS, PENGUIN_FRAMES, type PenguinAnim } from './poses';
import { PENGUIN_FRAME_PADDING_Y, PENGUIN_ORIGIN, penguinFeetOrigin } from './render-svg';
import { ensurePenguinTextures, penguinTextureKey } from './texture';

export { PLAYER_PENGUIN_SCALE } from './player-penguin-scale';

const NAME_TAG_BG = 0x00bdff;
const NAME_TAG_TEXT_COLOR = '#161719';
// design/Penguin Creator.dc.html line 70: `font: 700 15px 'Libre Franklin', sans-serif`.
const NAME_TAG_FONT_FAMILY = 'Libre Franklin, sans-serif';
const NAME_TAG_FONT_WEIGHT = '700';
const NAME_TAG_FONT_SIZE = '15px';
// design/Penguin Creator.dc.html line 70: `padding:6px 16px`.
const NAME_TAG_PADDING_X = 16;
const NAME_TAG_PADDING_Y = 6;
// Small gap below the feet anchor before the name tag starts.
const NAME_TAG_GAP = 8;

// Chat speech bubble (#44 review fix F10): the exact per-Room speech-bubble
// markup (a `sayJory` bubble) in `design/Room 01 Town Center.dc.html` line 45
// is `<rect ... fill="#F4F4F4"/>` with
// `<text font-family="Libre Franklin, sans-serif" font-weight="700"
// font-size="13" fill="#161719">`. Its background is `#F4F4F4` (a very light
// grey, not literal `#FFFFFF`), matching this file's design_handoff README
// paraphrase ("white rounded pills") closely enough that this ticket adopts
// this room's literal SVG value rather than the paraphrase's pure white.
// Font-size is adjusted from `14px` to the design's exact `13px`; padding
// isn't independently specified by the design (only the pill's overall
// width/height for one specific string), so it stays as previously tuned.
const BUBBLE_BG = 0xf4f4f4;
const BUBBLE_TEXT_COLOR = '#161719';
const BUBBLE_FONT_FAMILY = 'Libre Franklin, sans-serif';
const BUBBLE_FONT_WEIGHT = '700';
const BUBBLE_FONT_SIZE = '13px';
const BUBBLE_PADDING_X = 14;
const BUBBLE_PADDING_Y = 8;
const BUBBLE_MAX_WIDTH = 260;
// Gap above the sprite's own top edge, a fixed screen-pixel gap that must
// not shrink with the sprite (#131 review fix): only the top-edge term
// (measured off the sprite's own unscaled frame size) scales.
const BUBBLE_GAP = 10;
// The sprite's top edge sits at `-(PENGUIN_ORIGIN.y + PENGUIN_FRAME_PADDING_Y)`
// in container space, regardless of frame size, since that's exactly what the
// feet-anchor origin fraction cancels out to. Scaled by PLAYER_PENGUIN_SCALE
// (#131) so it shrinks with the smaller figure; BUBBLE_GAP is added
// afterwards, unscaled, so the visual gap above the head stays constant.
// Exported (unlike the other module-private tuning constants above) so
// `penguin-sprite.test.ts` can assert the scale is applied to the right term
// without booting a Phaser scene (#131 review fix).
export const BUBBLE_ANCHOR_Y =
  -(PENGUIN_ORIGIN.y + PENGUIN_FRAME_PADDING_Y) * PLAYER_PENGUIN_SCALE - BUBBLE_GAP;

// Snow hat (#53 D4): a transient 10 s effect on a hit Penguin, never a `Hat`
// of the Penguin look. Drawn as the design's HUD-SNOWBALL splat mound (a
// wide ellipse topped by three lumps, `#F4F4F4`), sat on the head: the
// frame's unpadded top edge, `PENGUIN_ORIGIN.y` above the feet anchor.
// These geometry constants are all in the sprite's own unscaled frame
// units; the `snowHat` Graphics object below is scaled (and its position
// scaled) by `PLAYER_PENGUIN_SCALE` as a whole (#131 review fix) so the
// outline stroke scales with it too, rather than each constant being
// hand-scaled (which left the 2px stroke full-size on a shrunk mound).
const SNOW_HAT_COLOR = 0xf4f4f4;
const SNOW_HAT_OUTLINE = 0x0c4b5f;
const SNOW_HAT_Y = -PENGUIN_ORIGIN.y + 14;
const SNOW_HAT_WIDTH = 60;
const SNOW_HAT_HEIGHT = 24;
const SNOW_HAT_LUMP_LEFT_X = -20;
const SNOW_HAT_LUMP_LEFT_Y = 8;
const SNOW_HAT_LUMP_LEFT_R = 6;
const SNOW_HAT_LUMP_RIGHT_X = 18;
const SNOW_HAT_LUMP_RIGHT_Y = 9;
const SNOW_HAT_LUMP_RIGHT_R = 7;
const SNOW_HAT_LUMP_CENTER_Y = 14;
const SNOW_HAT_LUMP_CENTER_R = 5;

/** Phaser's always-present built-in placeholder texture. */
const PLACEHOLDER_TEXTURE_KEY = '__DEFAULT';

export interface Penguin {
  readonly container: GameObjects.Container;
  idle(): void;
  walk(): void;
  /**
   * Plays `anim` immediately, replacing whatever idle/walk anim was showing
   * (#47's Emote picker). Unlike `idle()`/`walk()`, this takes an arbitrary
   * `PenguinAnim` (e.g. one of the four Emote-only poses); the caller
   * managing anim state (`RoomScene`'s Emote handling, `room-penguin-view.ts`
   * for remote Penguins) decides when to return to `idle()`/`walk()`.
   */
  play(anim: PenguinAnim): void;
  setFacing(facing: Facing): void;
  setLook(look: PenguinLook): void;
  /** Shows a chat speech bubble above the Penguin's head, or clears it (`null`) (#44). */
  say(text: string | null): void;
  /** Draws or removes the transient #53 snow hat on the head. */
  setSnowHat(on: boolean): void;
  /** Whether the snow hat is drawn right now (the hat child's `visible`). */
  hasSnowHat(): boolean;
  destroy(): void;
}

/** Optional initial state for `createPenguin` (#31 review fix 4). */
export interface PenguinInitialState {
  facing?: Facing;
  anim?: PenguinAnim;
}

/**
 * The Penguin's name-tag text, or `null` to hide the tag (text and pill)
 * entirely. An empty name is never shown as a placeholder in the World: it
 * hides the tag rather than falling back to `UNNAMED_PENGUIN` (#75). Pure
 * and exported so it's unit-testable without booting a Phaser scene.
 */
export function nameTagText(look: Pick<PenguinLook, 'name'>): string | null {
  return look.name === '' ? null : look.name;
}

/**
 * Builds a Phaser container for `look` at world position `(x, y)`: the
 * animated figure sprite, anchored at its feet, plus a Libre Franklin
 * name-tag pill below it showing `look.name` (#31 D7). The tag is hidden
 * entirely when the name is empty (`nameTagText` returns `null`): an unnamed
 * Penguin never shows a placeholder in the World (#75).
 *
 * Registers `look`'s textures via `ensurePenguinTextures` and starts on
 * `PLACEHOLDER_TEXTURE_KEY` (Phaser's built-in placeholder texture, always
 * present), switching to the real frame once its texture has decoded.
 *
 * `state` sets the Penguin's starting facing (default `DEFAULT_FACING`) and
 * animation (default `look.emote`), applied immediately rather than only
 * taking effect on a later `setFacing`/`idle`/`walk` call (#31 review fix 4).
 */
export function createPenguin(
  scene: Scene,
  x: number,
  y: number,
  look: PenguinLook,
  state?: PenguinInitialState,
): Penguin {
  const origin = penguinFeetOrigin();

  let currentLook = look;
  let currentHash = penguinLookHash(look);
  let currentAnim: PenguinAnim = state?.anim ?? look.emote;
  let currentFrame = 0;
  let facing: Facing = state?.facing ?? DEFAULT_FACING;
  let destroyed = false;
  let frameTimer: Time.TimerEvent | null = null;
  // At most one pending `ADD_KEY` listener at a time (#31 review fix 5):
  // tracks the key/callback pair so a later `applyFrame` call (a new anim or
  // frame requested before the previous texture decoded) removes the stale
  // listener instead of leaving it registered.
  let pendingKey: string | null = null;
  let pendingListener: (() => void) | null = null;

  ensurePenguinTextures(scene, look);

  const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
  sprite.setOrigin(origin.x, origin.y);
  // #131: shrinks the sprite to the design's own scale, around its
  // feet-anchor origin above -- Phaser scales a GameObject's display size
  // around its fractional origin, so the feet stay pinned at (x, y).
  sprite.setScale(PLAYER_PENGUIN_SCALE);
  sprite.setFlipX(facing === 'left');

  const pill = new GameObjects.Graphics(scene);
  const nameText = new GameObjects.Text(scene, 0, NAME_TAG_GAP + NAME_TAG_PADDING_Y, '', {
    fontFamily: NAME_TAG_FONT_FAMILY,
    fontStyle: NAME_TAG_FONT_WEIGHT,
    fontSize: NAME_TAG_FONT_SIZE,
    color: NAME_TAG_TEXT_COLOR,
  });
  nameText.setOrigin(0.5, 0);

  // Chat speech bubble (#44): hidden until the first `say(text)`. Phaser's
  // `Text` never interprets its string as markup, so an unsafe message (e.g.
  // `<script>...`) always renders as the literal characters.
  const bubblePill = new GameObjects.Graphics(scene);
  const bubbleText = new GameObjects.Text(scene, 0, BUBBLE_ANCHOR_Y - BUBBLE_PADDING_Y, '', {
    fontFamily: BUBBLE_FONT_FAMILY,
    fontStyle: BUBBLE_FONT_WEIGHT,
    fontSize: BUBBLE_FONT_SIZE,
    color: BUBBLE_TEXT_COLOR,
    align: 'center',
    // `useAdvancedWrap` wraps mid-word when a single word (e.g. a 120-char
    // string with no spaces, chat's own max length) is wider than the pill,
    // rather than overflowing it (#44 review fix F10).
    wordWrap: { width: BUBBLE_MAX_WIDTH - BUBBLE_PADDING_X * 2, useAdvancedWrap: true },
  });
  bubbleText.setOrigin(0.5, 1);
  bubblePill.setVisible(false);
  bubbleText.setVisible(false);

  const snowHat = new GameObjects.Graphics(scene);
  // Scale the whole Graphics object (#131 review fix), not each hand-scaled
  // constant above, so the 2px outline stroke shrinks with the mound too.
  snowHat.setScale(PLAYER_PENGUIN_SCALE);
  snowHat.lineStyle(2, SNOW_HAT_OUTLINE, 1);
  snowHat.fillStyle(SNOW_HAT_COLOR, 1);
  snowHat.fillEllipse(0, SNOW_HAT_Y, SNOW_HAT_WIDTH, SNOW_HAT_HEIGHT);
  snowHat.strokeEllipse(0, SNOW_HAT_Y, SNOW_HAT_WIDTH, SNOW_HAT_HEIGHT);
  snowHat.fillCircle(SNOW_HAT_LUMP_LEFT_X, SNOW_HAT_Y - SNOW_HAT_LUMP_LEFT_Y, SNOW_HAT_LUMP_LEFT_R);
  snowHat.fillCircle(
    SNOW_HAT_LUMP_RIGHT_X,
    SNOW_HAT_Y - SNOW_HAT_LUMP_RIGHT_Y,
    SNOW_HAT_LUMP_RIGHT_R,
  );
  snowHat.fillCircle(0, SNOW_HAT_Y - SNOW_HAT_LUMP_CENTER_Y, SNOW_HAT_LUMP_CENTER_R);
  snowHat.setVisible(false);

  const container = scene.add.container(x, y, [
    sprite,
    snowHat,
    pill,
    nameText,
    bubblePill,
    bubbleText,
  ]);

  function clearPendingListener(): void {
    if (pendingKey !== null && pendingListener !== null) {
      scene.textures.off(Textures.Events.ADD_KEY + pendingKey, pendingListener);
    }
    pendingKey = null;
    pendingListener = null;
  }

  function stopFrameTimer(): void {
    frameTimer?.remove();
    frameTimer = null;
  }

  // A `destroy` fired directly on `container` (bypassing the `destroy()`
  // returned below) must still stop the frame timer and drop the pending
  // listener (#31 review fix 5).
  container.once(GameObjects.Events.DESTROY, () => {
    destroyed = true;
    clearPendingListener();
    stopFrameTimer();
  });

  function redrawNameTag(): void {
    const text = nameTagText(currentLook);
    pill.clear();
    if (text === null) {
      nameText.setText('');
      nameText.setVisible(false);
      pill.setVisible(false);
      return;
    }
    nameText.setVisible(true);
    pill.setVisible(true);
    nameText.setText(text);
    const width = nameText.width + NAME_TAG_PADDING_X * 2;
    const height = nameText.height + NAME_TAG_PADDING_Y * 2;
    pill.fillStyle(NAME_TAG_BG, 1);
    pill.fillRoundedRect(-width / 2, NAME_TAG_GAP, width, height, height / 2);
  }
  redrawNameTag();

  function redrawBubble(text: string | null): void {
    if (text === null) {
      bubblePill.setVisible(false);
      bubbleText.setVisible(false);
      bubbleText.setText('');
      bubblePill.clear();
      return;
    }
    bubbleText.setText(text);
    bubbleText.setVisible(true);
    bubblePill.setVisible(true);
    const width = Math.min(bubbleText.width, BUBBLE_MAX_WIDTH) + BUBBLE_PADDING_X * 2;
    const height = bubbleText.height + BUBBLE_PADDING_Y * 2;
    bubblePill.clear();
    bubblePill.fillStyle(BUBBLE_BG, 1);
    bubblePill.fillRoundedRect(-width / 2, BUBBLE_ANCHOR_Y - height, width, height, height / 2);
  }

  function applyFrame(): void {
    const key = penguinTextureKey(currentHash, currentAnim, currentFrame);
    clearPendingListener();
    if (scene.textures.exists(key)) {
      sprite.setTexture(key);
      return;
    }
    // The texture hasn't decoded yet (`addBase64` is async); pick it up once
    // it has.
    const listener = (): void => {
      if (pendingKey === key) {
        pendingKey = null;
        pendingListener = null;
      }
      if (!destroyed) sprite.setTexture(key);
    };
    pendingKey = key;
    pendingListener = listener;
    scene.textures.once(Textures.Events.ADD_KEY + key, listener);
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
    play(anim: PenguinAnim) {
      play(anim);
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
    say(text: string | null) {
      redrawBubble(text);
    },
    setSnowHat(on: boolean) {
      if (!destroyed) snowHat.setVisible(on);
    },
    hasSnowHat() {
      return !destroyed && snowHat.visible;
    },
    destroy() {
      destroyed = true;
      clearPendingListener();
      stopFrameTimer();
      container.destroy();
    },
  };
}
