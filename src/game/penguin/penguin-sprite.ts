import { GameObjects, Scenes, Textures, type Scene, type Time } from 'phaser';
import { DEFAULT_FACING, type Facing, type PenguinLook } from '../../contracts';
import { NPC_BUBBLE_LAYER } from '../rooms/iso';
import { penguinLookHash } from './look-hash';
import { createBodyMotion, penguinMotionFor, prefersReducedMotion } from './motion';
import { PLAYER_PENGUIN_SCALE } from './player-penguin-scale';
import { PENGUIN_FRAME_MS, PENGUIN_FRAMES, type PenguinAnim } from './poses';
import { PENGUIN_FRAME_PADDING_Y, PENGUIN_ORIGIN, penguinFeetOrigin } from './render-svg';
import { ensurePenguinTextures, penguinTextureKey, usesNeutralBody } from './texture';

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

// Nicole's coffee (#141): a lidded paper cup with a JG-cyan sleeve, held at
// the right flipper while the local Penguin carries it. Unscaled frame
// units, like the snow hat; the Graphics object is scaled as a whole.
const CUP_X = 46;
const CUP_TOP_Y = -86;
const CUP_HEIGHT = 36;
const CUP_TOP_HALF_WIDTH = 14;
const CUP_BOTTOM_HALF_WIDTH = 11;
const CUP_COLOR = 0xf4f4f4;
const CUP_SLEEVE_COLOR = 0x00bdff;
const CUP_LID_COLOR = 0x3b2a20;
const CUP_OUTLINE = 0x0c4b5f;

/** Phaser's always-present built-in placeholder texture. */
const PLACEHOLDER_TEXTURE_KEY = '__DEFAULT';

/**
 * The name of every Penguin's overlay container (its name tag and chat
 * bubble), so `RoomScene`'s Penguin-container counts can skip it.
 */
export const PENGUIN_OVERLAY_NAME = 'penguin-overlay';

/**
 * The depth a Penguin's name tag and chat bubble draw at, for a body at
 * `bodyDepth` (#135, #161 review, milliehime): the NPC bubbles' own top
 * layer, `NPC_BUBBLE_LAYER + depth`, so a tag or bubble is never drawn under
 * the ceiling item (`iso.ts`'s `CEILING_FURNITURE_DEPTH`) or any Room object,
 * while tags and bubbles still sort nearer-over-farther among themselves.
 */
export function penguinOverlayDepth(bodyDepth: number): number {
  return NPC_BUBBLE_LAYER + bodyDepth;
}

export interface Penguin {
  /** The body (sprite and snow hat): callers position and depth-sort this. */
  readonly container: GameObjects.Container;
  /**
   * The name tag and chat bubble, a separate top-layer container (like an
   * NPC's bubble) that follows `container`'s position, visibility and depth
   * every frame, at `penguinOverlayDepth(container.depth)`.
   */
  readonly overlay: GameObjects.Container;
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
  /** Draws or removes #141's coffee cup in the flipper. */
  setCarriedCup(on: boolean): void;
  /** Whether the coffee cup is drawn right now. */
  hasCarriedCup(): boolean;
  /**
   * Test support (#68 D3): how many tweens are running on this Penguin's
   * body motion. 1 while an anim with a body motion plays (or while the body
   * eases back to neutral after one), 0 otherwise (and always 0 under
   * reduced motion); anything more is a leaked tween.
   */
  bodyMotionTweenCount(): number;
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
  // #68 D5: read once, when the Penguin is built. With reduced motion the
  // Penguin keeps today's baked two-frame swap exactly: no tween, no
  // `:neutral` textures, no sway. An OS change applies to the next Penguin
  // built, e.g. on the next Room entry.
  const bodyMotion = !prefersReducedMotion();
  const textureOptions = { bodyMotion };

  ensurePenguinTextures(scene, look, facing, textureOptions);

  const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
  sprite.setOrigin(origin.x, origin.y);
  // #131: shrinks the sprite to the design's own scale, around its
  // feet-anchor origin above -- Phaser scales a GameObject's display size
  // around its fractional origin, so the feet stay pinned at (x, y).
  sprite.setScale(PLAYER_PENGUIN_SCALE);

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

  const cup = new GameObjects.Graphics(scene);
  cup.setScale(PLAYER_PENGUIN_SCALE);
  const cupBottomY = CUP_TOP_Y + CUP_HEIGHT;
  const cupBody = [
    { x: CUP_X - CUP_TOP_HALF_WIDTH, y: CUP_TOP_Y },
    { x: CUP_X + CUP_TOP_HALF_WIDTH, y: CUP_TOP_Y },
    { x: CUP_X + CUP_BOTTOM_HALF_WIDTH, y: cupBottomY },
    { x: CUP_X - CUP_BOTTOM_HALF_WIDTH, y: cupBottomY },
  ];
  cup.fillStyle(CUP_COLOR, 1);
  cup.fillPoints(cupBody, true);
  cup.fillStyle(CUP_SLEEVE_COLOR, 1);
  cup.fillRect(CUP_X - CUP_TOP_HALF_WIDTH + 2, CUP_TOP_Y + 11, CUP_TOP_HALF_WIDTH * 2 - 4, 13);
  cup.lineStyle(2, CUP_OUTLINE, 1);
  cup.strokePoints(cupBody, true);
  cup.fillStyle(CUP_LID_COLOR, 1);
  cup.fillRect(CUP_X - CUP_TOP_HALF_WIDTH - 2, CUP_TOP_Y - 6, CUP_TOP_HALF_WIDTH * 2 + 4, 6);
  cup.strokeRect(CUP_X - CUP_TOP_HALF_WIDTH - 2, CUP_TOP_Y - 6, CUP_TOP_HALF_WIDTH * 2 + 4, 6);
  cup.setVisible(false);

  // #68 D3: the figure's tilt, lift and (WADDLE's) sideways sway, tweened on
  // the sprite, the snow hat and the cup only -- never the container (so the
  // Penguin's position and Tile never move), the name tag or the bubble.
  const motionProxy = { phase: 0, blend: 0 };
  const motion = createBodyMotion(scene.tweens, [sprite, snowHat, cup], motionProxy);

  const container = scene.add.container(x, y, [sprite, snowHat, cup]);
  // #161 review (milliehime): the name tag and chat bubble live in their own
  // top-layer container, not the body's, so the ceiling item (which hangs
  // above every Tile depth) never draws over them. The body keeps its own
  // Tile depth ordering; the overlay copies its position, visibility and
  // depth on POST_UPDATE (#135 review fix), after `scene.update` and tweens
  // have run but before `Systems.render` sorts the display list by depth, so
  // the overlay's depth takes effect the same frame instead of one frame late.
  const overlay = scene.add.container(x, y, [pill, nameText, bubblePill, bubbleText]);
  overlay.setName(PENGUIN_OVERLAY_NAME);
  function syncOverlay(): void {
    overlay.setPosition(container.x, container.y);
    overlay.setVisible(container.visible);
    overlay.setDepth(penguinOverlayDepth(container.depth));
  }
  syncOverlay();
  scene.events.on(Scenes.Events.POST_UPDATE, syncOverlay);

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
    motion.stop(false);
    scene.events.off(Scenes.Events.POST_UPDATE, syncOverlay);
    overlay.destroy();
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
    const key = penguinTextureKey(
      currentHash,
      currentAnim,
      currentFrame,
      facing,
      usesNeutralBody(currentAnim, bodyMotion),
    );
    // Captured now, alongside `key`, rather than read from the outer
    // `facing` closure variable inside the (possibly-async) callback below
    // (#147): a later `setFacing`/`applyFrame` call can advance `facing`
    // again before this key's texture decodes, and the flip must always
    // match the facing baked into whichever texture is actually on screen,
    // not whatever `facing` happens to hold when the callback fires.
    const flipped = facing === 'left';
    clearPendingListener();
    if (scene.textures.exists(key)) {
      sprite.setTexture(key);
      sprite.setFlipX(flipped);
      // #68: mirror the body motion with the texture that's on screen.
      motion.setFlipped(flipped);
      return;
    }
    // The texture hasn't decoded yet (`addBase64` is async); pick it up once
    // it has. The flip is applied together with the texture swap so the
    // previous facing's frame never shows flipped for the new facing (#147
    // review fix): its own lettering was baked for the old facing, and
    // flipping it early mirrors it backwards until the new texture lands.
    const listener = (): void => {
      if (pendingKey === key) {
        pendingKey = null;
        pendingListener = null;
      }
      if (!destroyed) {
        sprite.setTexture(key);
        sprite.setFlipX(flipped);
        motion.setFlipped(flipped);
      }
    };
    pendingKey = key;
    pendingListener = listener;
    scene.textures.once(Textures.Events.ADD_KEY + key, listener);
  }

  function play(anim: PenguinAnim): void {
    stopFrameTimer();
    // No `motion.stop()` here: resetting the pose to neutral would snap the
    // body mid-sway. `motion.start` below replaces the tween and blends from
    // wherever the body is now into the next anim (or back to neutral).
    currentAnim = anim;
    currentFrame = 0;
    applyFrame();
    const frameCount = PENGUIN_FRAMES[anim];
    if (frameCount > 1) {
      frameTimer = scene.time.addEvent({
        delay: PENGUIN_FRAME_MS[anim],
        loop: true,
        callback: () => {
          currentFrame = (currentFrame + 1) % frameCount;
          applyFrame();
        },
      });
    }
    // Started alongside the frame timer, so a two-pose motion reaches its
    // second keyframe as the timer swaps to frame 1 (#68 D3). Under reduced
    // motion nothing ever moves the body, so it stays at neutral.
    if (bodyMotion) motion.start(penguinMotionFor(anim));
  }

  play(currentAnim);

  return {
    container,
    overlay,
    idle() {
      play(currentLook.emote);
    },
    walk() {
      // #68 D4a: `RoomScene.advanceStep` calls this on every Tile step. While
      // WALK is already playing, restarting it would reset the frame timer
      // (so a long walk never reached frame 1) and the body tween.
      if (currentAnim === 'WALK') return;
      play('WALK');
    },
    play(anim: PenguinAnim) {
      play(anim);
    },
    setFacing(next: Facing) {
      // #147: a left-facing frame's texture bakes counter-mirrored lettering
      // (`render-svg.ts`'s `renderLettering`), so switching facing must swap
      // the sprite's *texture* (via `applyFrame`), not just flip it -- the
      // flip alone would mirror the already-corrected lettering right back
      // into reading backwards. The flip itself is applied inside
      // `applyFrame`, together with whichever texture actually lands.
      //
      // Early-return when the facing hasn't changed (#147 review fix):
      // `RoomScene.advanceStep` calls `setFacing` on every walk step, even
      // while walking straight in one direction across several tiles, so
      // without this guard every step re-hashes `currentLook` and re-runs 16
      // `exists` checks (`ensurePenguinTextures`) for a texture set already
      // in use.
      if (next === facing) return;
      facing = next;
      ensurePenguinTextures(scene, currentLook, facing, textureOptions);
      applyFrame();
    },
    setLook(next: PenguinLook) {
      const wasWalking = currentAnim === 'WALK';
      currentLook = next;
      currentHash = penguinLookHash(next);
      ensurePenguinTextures(scene, next, facing, textureOptions);
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
    setCarriedCup(on: boolean) {
      if (!destroyed) cup.setVisible(on);
    },
    hasCarriedCup() {
      return !destroyed && cup.visible;
    },
    bodyMotionTweenCount() {
      // A removed tween stays in Phaser's list, already stopped, until the
      // manager's next update; only a tween still running counts, so a
      // tween that was never removed (a leak) shows up and a finished one
      // doesn't.
      return scene.tweens
        .getTweensOf(motionProxy)
        .filter((tween) => !tween.isPendingRemove() && !tween.isRemoved()).length;
    },
    destroy() {
      destroyed = true;
      clearPendingListener();
      stopFrameTimer();
      motion.stop(false);
      container.destroy();
    },
  };
}
