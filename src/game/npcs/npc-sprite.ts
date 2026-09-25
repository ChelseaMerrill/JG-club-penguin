import { GameObjects, Textures, type Scene, type Time, type Tweens } from 'phaser';
import type { NpcMotionSpec } from '../../npcs/npc-motions';
import type { NpcBubbleLine, NpcDefinition } from '../../npcs/npcs';
import { penguinFeetOrigin } from '../penguin/render-svg';
import { NPC_BUBBLE_LAYER } from '../rooms/iso';
import { SPEECH_BUBBLE_MAX_TEXT_WIDTH, SPEECH_BUBBLE_PADDING_X } from './bubble-geometry';
import { ensureNpcTexture } from './texture';

/** Phaser's always-present built-in placeholder texture (matches #31's own sprite). */
const PLACEHOLDER_TEXTURE_KEY = '__DEFAULT';

// Nameplate (#36 round-1 review item 5): 20px tall, `#00BDFF`-stroked. Human
// NPCs use the design's light pill (every one of Town Center's/Dev Pit's own
// nameplates, e.g. `design/Room 02 Dev Pit.dc.html`'s "Ian" tag: `fill=
// "#F4F4F4" stroke="#00BDFF"`, text `fill="#161719"`). Penguin-kind
// background NPCs use the design's own dark pill instead (e.g. "Front Desk"/
// "Kevin": `fill="#161719" stroke="#0C4B5F"`, text `fill="#F4F4F4"`) --
// matching #31's own Penguin name tag palette. Both are traced directly from
// their own Room design, not a single guessed universal style.
const NAME_TAG_HEIGHT = 20;
const NAME_TAG_BORDER_WIDTH = 2;
const NAME_TAG_HUMAN_BG = 0xf4f4f4;
const NAME_TAG_HUMAN_BORDER = 0x00bdff;
const NAME_TAG_HUMAN_TEXT_COLOR = '#161719';
const NAME_TAG_PENGUIN_BG = 0x161719;
const NAME_TAG_PENGUIN_BORDER = 0x0c4b5f;
const NAME_TAG_PENGUIN_TEXT_COLOR = '#F4F4F4';
const NAME_TAG_FONT_FAMILY = 'Libre Franklin, sans-serif';
const NAME_TAG_FONT_WEIGHT = '700';
const NAME_TAG_FONT_SIZE = '12px';
const NAME_TAG_PADDING_X = 10;
const NAME_TAG_GAP = 6;

// Speech bubble: a white rounded pill with dark text and a small pointer,
// per the same Room designs' idle speech-bubble markup.
const SPEECH_BUBBLE_BG = 0xf4f4f4;
const SPEECH_BUBBLE_TEXT_COLOR = '#161719';
const SPEECH_BUBBLE_FONT_FAMILY = 'Libre Franklin, sans-serif';
const SPEECH_BUBBLE_FONT_WEIGHT = '700';
const SPEECH_BUBBLE_FONT_SIZE = '13px';
const SPEECH_BUBBLE_PADDING_Y = 8;
const SPEECH_BUBBLE_RADIUS = 8;
const SPEECH_BUBBLE_POINTER_HALF_WIDTH = 6;
const SPEECH_BUBBLE_POINTER_HEIGHT = 8;
const SPEECH_BUBBLE_GAP = 14;
const SPEECH_BUBBLE_FADE_MS = 250;

/**
 * Approximate design-space head-top y (the figure's head circle sits around
 * y=15-40 in the shared 0-130 box) minus `PENGUIN_ORIGIN.y` (120, the
 * feet-anchor): the local-space y offset, relative to the sprite's own feet
 * anchor, the speech bubble floats above (#36 D2, matching the Room designs'
 * own bubble-above-head placement).
 */
const HEAD_TOP_OFFSET_Y = -105;

/**
 * The shared visible-window fraction every Room design's own `say` bubble
 * animation uses (`@keyframes say { 0%,4% {0} 7%,26% {1} 29%,100% {0} }` in
 * `design/Room 02 Dev Pit.dc.html`/`design/Room 05 Roof Deck.dc.html`):
 * visible from 7% to 26% of each line's own period. Town Center's per-NPC
 * custom keyframes (`sayDarrin`, `saySyd`, `sayJon`) are converted to an
 * equivalent `delayS` under this same window when `npcs.ts` computes them,
 * so this one constant pair drives every NPC's cycle (#36 round-1 review
 * item 2/3b).
 */
const BUBBLE_WINDOW_START_FRACTION = 0.07;
const BUBBLE_WINDOW_DURATION_FRACTION = 0.19;

const BOB_DISTANCE = 6;
const BOB_DURATION_MS = 900;

export interface NpcSprite {
  readonly container: GameObjects.Container;
  /**
   * The figure (and any #113 prop layers) inside `container`, with its own
   * origin at the feet: the layer a designed in-place motion transforms, so
   * the name tag below it stays upright, as in the Room designs.
   */
  readonly figure: GameObjects.Container;
  /** Moves the NPC (figure, name tag and speech bubble) to `(x, y)`, sorted at `depth` (#113). */
  setPoint(x: number, y: number, depth: number): void;
  destroy(): void;
}

export interface NpcSpriteOptions {
  /**
   * The NPC's designed motion (#113), when it has one: it replaces the idle
   * bob, and `replaceFigureProp` draws the figure without its own prop.
   * Ignored under reduced motion, which keeps today's still NPC.
   */
  motion?: NpcMotionSpec;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Builds a Phaser container for `npc` at world position `(x, y)`, depth-
 * sorted at `depth` (`depthForTile(tile)`, computed once by `RoomScene`):
 * its figure sprite (anchored at the feet, sharing #31's own frame math via
 * `penguinFeetOrigin`), a small idle bob tween (skipped under reduced
 * motion), and a nameplate below it showing `npc.tagName`.
 *
 * The idle speech bubble (#36 round-1 review item 3) is a *separate* pair of
 * Phaser objects added directly to `scene`, not to this container, at depth
 * `NPC_BUBBLE_LAYER + depth` (`iso.ts`'s shared top-layer constant, also used
 * by `RoomScene`'s own Snowball layer -- #36 round-2 review item 3) -- a
 * dedicated top layer so no NPC's own figure (nor any other NPC's, however it
 * sorts by tile) ever paints over a bubble, while bubbles themselves still
 * sort nearer-over-farther by depth. It cycles
 * through `npc.idleLines` with a per-line alpha fade, timed from each line's
 * own `periodS`/`delayS` (`npcs.ts`'s doc comment); `periodS: 0` (or
 * reduced motion) shows `idleLines[0]` statically instead of cycling.
 */
export function createNpcSprite(
  scene: Scene,
  x: number,
  y: number,
  npc: NpcDefinition,
  depth: number,
  options: NpcSpriteOptions = {},
): NpcSprite {
  const origin = penguinFeetOrigin();
  const reducedMotion = prefersReducedMotion();
  const motion = reducedMotion ? undefined : options.motion;
  const hasDesignedMotion = Boolean(motion?.path || motion?.figure || motion?.props?.length);

  const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
  sprite.setOrigin(origin.x, origin.y);

  let spriteDestroyed = false;
  const key = ensureNpcTexture(scene, npc, { omitProp: motion?.replaceFigureProp === true });
  if (scene.textures.exists(key)) {
    sprite.setTexture(key);
  } else {
    const listener = (): void => {
      if (!spriteDestroyed) sprite.setTexture(key);
    };
    scene.textures.once(Textures.Events.ADD_KEY + key, listener);
    // Guards against a restart/teardown mid-decode (#36 round-1 review item
    // 8, matching #31's own `penguin-sprite.ts` pending-listener cleanup): a
    // container `DESTROY` before the texture ever decodes must drop this
    // listener rather than let it fire `setTexture` on a dead Sprite later.
    sprite.once(GameObjects.Events.DESTROY, () => {
      spriteDestroyed = true;
      scene.textures.off(Textures.Events.ADD_KEY + key, listener);
    });
  }

  // Nameplate.
  const isHuman = npc.kind === 'human';
  const nameBg = isHuman ? NAME_TAG_HUMAN_BG : NAME_TAG_PENGUIN_BG;
  const nameBorder = isHuman ? NAME_TAG_HUMAN_BORDER : NAME_TAG_PENGUIN_BORDER;
  const nameTextColor = isHuman ? NAME_TAG_HUMAN_TEXT_COLOR : NAME_TAG_PENGUIN_TEXT_COLOR;

  const namePill = new GameObjects.Graphics(scene);
  const nameText = new GameObjects.Text(scene, 0, NAME_TAG_GAP + NAME_TAG_HEIGHT / 2, npc.tagName, {
    fontFamily: NAME_TAG_FONT_FAMILY,
    fontStyle: NAME_TAG_FONT_WEIGHT,
    fontSize: NAME_TAG_FONT_SIZE,
    color: nameTextColor,
  });
  nameText.setOrigin(0.5, 0.5);
  const nameWidth = nameText.width + NAME_TAG_PADDING_X * 2;
  namePill.fillStyle(nameBg, 1);
  namePill.fillRoundedRect(
    -nameWidth / 2,
    NAME_TAG_GAP,
    nameWidth,
    NAME_TAG_HEIGHT,
    NAME_TAG_HEIGHT / 2,
  );
  namePill.lineStyle(NAME_TAG_BORDER_WIDTH, nameBorder, 1);
  namePill.strokeRoundedRect(
    -nameWidth / 2,
    NAME_TAG_GAP,
    nameWidth,
    NAME_TAG_HEIGHT,
    NAME_TAG_HEIGHT / 2,
  );

  const figure = new GameObjects.Container(scene, 0, 0, [sprite]);
  const container = scene.add.container(x, y, [figure, namePill, nameText]);
  container.setDepth(depth);

  // --- Speech bubble: a separate top-layer pair, not a container child. ---
  // `scene.add.existing` is required here (unlike `sprite`/`namePill`/
  // `nameText` above, which `scene.add.container` already adds as its own
  // children): a `new GameObjects.X(scene, ...)` built directly, without
  // either `scene.add.existing` or an `add.*` factory call, is never part of
  // the Scene's display list and so never renders, however its depth/alpha/
  // position are set.
  const bubbleGraphics = scene.add.existing(new GameObjects.Graphics(scene));
  const bubbleText = scene.add.existing(
    new GameObjects.Text(scene, 0, 0, '', {
      fontFamily: SPEECH_BUBBLE_FONT_FAMILY,
      fontStyle: SPEECH_BUBBLE_FONT_WEIGHT,
      fontSize: SPEECH_BUBBLE_FONT_SIZE,
      color: SPEECH_BUBBLE_TEXT_COLOR,
      align: 'center',
      wordWrap: { width: SPEECH_BUBBLE_MAX_TEXT_WIDTH },
    }),
  );
  bubbleText.setOrigin(0.5, 0);
  bubbleGraphics.setDepth(NPC_BUBBLE_LAYER + depth);
  bubbleText.setDepth(NPC_BUBBLE_LAYER + depth);
  bubbleGraphics.setAlpha(0);
  bubbleText.setAlpha(0);

  // Bubble geometry is laid out relative to the NPC's feet, then placed at
  // its current point, so a roaming NPC (#113) carries its bubble along.
  const bubbleX = npc.bubbleOffsetX ?? 0;
  const bubbleBottomY = HEAD_TOP_OFFSET_Y + (npc.bubbleOffsetY ?? 0) - SPEECH_BUBBLE_GAP;
  let bubbleTextY = 0;
  let pointX = x;
  let pointY = y;

  function placeBubble(): void {
    bubbleGraphics.setPosition(pointX, pointY);
    bubbleText.setPosition(pointX + bubbleX, pointY + bubbleTextY);
  }

  function layoutBubble(text: string): void {
    bubbleText.setText(text);
    const bubbleWidth = bubbleText.width + SPEECH_BUBBLE_PADDING_X * 2;
    const bubbleHeight = bubbleText.height + SPEECH_BUBBLE_PADDING_Y * 2;
    const bubbleTopY = bubbleBottomY - bubbleHeight;

    // The tail points at the NPC's own x (local 0, unshifted by `bubbleOffsetX`),
    // not the bubble's own (possibly nudged) centre `bubbleX` (#36 round-2
    // review item 4): a Roof Deck vendor's or Dev Pit's nudged-apart bubble
    // otherwise drew its tail off in empty space rather than at its speaker.
    // Clamped inside the bubble's own bottom edge so the tail's base never
    // pokes out past a heavily-offset bubble's rounded corners.
    const tailMin = bubbleX - bubbleWidth / 2 + SPEECH_BUBBLE_POINTER_HALF_WIDTH;
    const tailMax = bubbleX + bubbleWidth / 2 - SPEECH_BUBBLE_POINTER_HALF_WIDTH;
    const tailX = Math.min(Math.max(0, tailMin), tailMax);

    bubbleGraphics.clear();
    bubbleGraphics.fillStyle(SPEECH_BUBBLE_BG, 1);
    bubbleGraphics.fillRoundedRect(
      bubbleX - bubbleWidth / 2,
      bubbleTopY,
      bubbleWidth,
      bubbleHeight,
      SPEECH_BUBBLE_RADIUS,
    );
    bubbleGraphics.fillTriangle(
      tailX - SPEECH_BUBBLE_POINTER_HALF_WIDTH,
      bubbleBottomY,
      tailX + SPEECH_BUBBLE_POINTER_HALF_WIDTH,
      bubbleBottomY,
      tailX,
      bubbleBottomY + SPEECH_BUBBLE_POINTER_HEIGHT,
    );
    bubbleTextY = bubbleTopY + SPEECH_BUBBLE_PADDING_Y;
    placeBubble();
  }

  let bubbleFadeTween: Tweens.Tween | null = null;
  function fadeBubble(alpha: number, durationMs: number): void {
    bubbleFadeTween?.stop();
    bubbleFadeTween = scene.tweens.add({
      targets: [bubbleGraphics, bubbleText],
      alpha,
      duration: durationMs,
      ease: 'Sine.easeInOut',
    });
  }

  const lineTimers: Time.TimerEvent[] = [];

  /** Schedules one idle line's own show/hide cycle (#36 round-1 review item 3b). */
  function scheduleLine(line: NpcBubbleLine): void {
    const periodMs = line.periodS * 1000;
    const windowStartMs = BUBBLE_WINDOW_START_FRACTION * periodMs;
    const windowDurationMs = BUBBLE_WINDOW_DURATION_FRACTION * periodMs;
    const gapMs = periodMs - windowDurationMs;
    // Normalizes the CSS-style (typically negative) `delayS` into "ms already
    // elapsed at load" within one period, then finds how long until this
    // line's own visible window next opens.
    const elapsedAtLoadMs = (((-line.delayS * 1000) % periodMs) + periodMs) % periodMs;
    let initialDelayMs = windowStartMs - elapsedAtLoadMs;
    if (initialDelayMs < 0) initialDelayMs += periodMs;

    const showThenScheduleNext = (): void => {
      layoutBubble(line.text);
      fadeBubble(1, SPEECH_BUBBLE_FADE_MS);
      lineTimers.push(
        scene.time.delayedCall(windowDurationMs, () => {
          fadeBubble(0, SPEECH_BUBBLE_FADE_MS);
          lineTimers.push(scene.time.delayedCall(gapMs, showThenScheduleNext));
        }),
      );
    };

    lineTimers.push(scene.time.delayedCall(initialDelayMs, showThenScheduleNext));
  }

  const isStaticDesign = npc.idleLines[0]?.periodS === 0;
  if (reducedMotion || isStaticDesign) {
    const firstLine = npc.idleLines[0];
    if (firstLine) {
      layoutBubble(firstLine.text);
      bubbleGraphics.setAlpha(1);
      bubbleText.setAlpha(1);
    }
  } else {
    for (const line of npc.idleLines) scheduleLine(line);
  }

  let bobTween: Tweens.Tween | null = null;
  if (!reducedMotion && !hasDesignedMotion) {
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
    figure,
    setPoint(nextX, nextY, nextDepth) {
      pointX = nextX;
      pointY = nextY;
      container.setPosition(nextX, nextY);
      container.setDepth(nextDepth);
      bubbleGraphics.setDepth(NPC_BUBBLE_LAYER + nextDepth);
      bubbleText.setDepth(NPC_BUBBLE_LAYER + nextDepth);
      placeBubble();
    },
    destroy() {
      bobTween?.stop();
      bubbleFadeTween?.stop();
      lineTimers.forEach((timer) => timer.remove());
      bubbleGraphics.destroy();
      bubbleText.destroy();
      container.destroy();
    },
  };
}
