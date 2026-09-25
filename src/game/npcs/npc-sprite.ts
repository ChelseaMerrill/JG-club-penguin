import { GameObjects, Textures, type Scene, type Time, type Tweens } from 'phaser';
import type { NpcMotionSpec } from '../../npcs/npc-motions';
import type { NpcBubbleLine, NpcDefinition } from '../../npcs/npcs';
import { penguinFeetOrigin } from '../penguin/render-svg';
import { NPC_BUBBLE_LAYER } from '../rooms/iso';
import {
  SPEECH_BUBBLE_MAX_TEXT_WIDTH,
  SPEECH_BUBBLE_PADDING_X,
  SPEECH_BUBBLE_PADDING_Y,
} from './bubble-geometry';
import { bubbleSchedule } from './bubble-schedule';
import { NAMEPLATE_HEIGHT, npcBob, npcLayout } from './npc-layout';
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
// their own Room design, not a single guessed universal style. Where it sits
// (above the head, #113) comes from `npc-layout.ts`.
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

// Speech bubble: a white rounded pill with dark text and a small pointer,
// per the same Room designs' idle speech-bubble markup (`<rect rx="8"
// height="30">` plus a 12 px wide, 8 px tall tail polygon starting 1 px
// inside the pill).
const SPEECH_BUBBLE_BG = 0xf4f4f4;
const SPEECH_BUBBLE_TEXT_COLOR = '#161719';
const SPEECH_BUBBLE_FONT_FAMILY = 'Libre Franklin, sans-serif';
const SPEECH_BUBBLE_FONT_WEIGHT = '700';
const SPEECH_BUBBLE_FONT_SIZE = '13px';
const SPEECH_BUBBLE_RADIUS = 8;
const SPEECH_BUBBLE_POINTER_HALF_WIDTH = 6;
const SPEECH_BUBBLE_POINTER_TOP_INSET = 1;
const SPEECH_BUBBLE_POINTER_HEIGHT = 8;
const SPEECH_BUBBLE_FADE_MS = 250;

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
 * `penguinFeetOrigin`, drawn at the Room design's scale), its idle bob
 * (skipped under reduced motion, for a `still` NPC, or for one whose
 * designed motion replaces it), and a nameplate above
 * its head showing `npc.tagName`. Scale, nameplate, bubble and bob all come
 * from `npc-layout.ts` (#113).
 *
 * The idle speech bubble (#36 round-1 review item 3) is a *separate* pair of
 * Phaser objects added directly to `scene`, not to this container, at depth
 * `NPC_BUBBLE_LAYER + depth` (`iso.ts`'s shared top-layer constant, also used
 * by `RoomScene`'s own Snowball layer -- #36 round-2 review item 3) -- a
 * dedicated top layer so no NPC's own figure (nor any other NPC's, however it
 * sorts by tile) ever paints over a bubble, while bubbles themselves still
 * sort nearer-over-farther by depth. It sits just above the nameplate and
 * cycles through `npc.idleLines` with a per-line alpha fade, timed by
 * `bubbleSchedule()`; `periodS: 0` (or reduced motion) shows `idleLines[0]`
 * statically instead of cycling.
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
  const layout = npcLayout(npc);

  const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
  sprite.setOrigin(origin.x, origin.y);

  let spriteDestroyed = false;
  const key = ensureNpcTexture(scene, npc, {
    omitProp: motion?.replaceFigureProp === true,
    omitRestPose: motion?.replaceFigureRestPose === true,
  });
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

  // Nameplate, above the head.
  const isHuman = npc.kind === 'human';
  const nameBg = isHuman ? NAME_TAG_HUMAN_BG : NAME_TAG_PENGUIN_BG;
  const nameBorder = isHuman ? NAME_TAG_HUMAN_BORDER : NAME_TAG_PENGUIN_BORDER;
  const nameTextColor = isHuman ? NAME_TAG_HUMAN_TEXT_COLOR : NAME_TAG_PENGUIN_TEXT_COLOR;

  const namePill = new GameObjects.Graphics(scene);
  const nameText = new GameObjects.Text(
    scene,
    0,
    layout.nameplateTopY + NAMEPLATE_HEIGHT / 2,
    npc.tagName,
    {
      fontFamily: NAME_TAG_FONT_FAMILY,
      fontStyle: NAME_TAG_FONT_WEIGHT,
      fontSize: NAME_TAG_FONT_SIZE,
      color: nameTextColor,
    },
  );
  nameText.setOrigin(0.5, 0.5);
  const nameWidth = nameText.width + NAME_TAG_PADDING_X * 2;
  namePill.fillStyle(nameBg, 1);
  namePill.fillRoundedRect(
    -nameWidth / 2,
    layout.nameplateTopY,
    nameWidth,
    NAMEPLATE_HEIGHT,
    NAMEPLATE_HEIGHT / 2,
  );
  namePill.lineStyle(NAME_TAG_BORDER_WIDTH, nameBorder, 1);
  namePill.strokeRoundedRect(
    -nameWidth / 2,
    layout.nameplateTopY,
    nameWidth,
    NAMEPLATE_HEIGHT,
    NAMEPLATE_HEIGHT / 2,
  );

  // The designs draw the figure at `layout.scale` (an `<svg viewBox="0 0 120
  // 130">` scaled down), with its in-place motions and moving parts inside
  // that viewBox. So `figure` (the layer `room-npc-motions.ts` transforms and
  // parents prop layers under) sits inside a `scaled` wrapper: a designed
  // motion stays in figure units, as in the designs, and props shrink with
  // the figure. The idle bob moves `scaled`, in Stage px.
  const figure = new GameObjects.Container(scene, 0, 0, [sprite]);
  const scaled = new GameObjects.Container(scene, 0, 0, [figure]);
  scaled.setScale(layout.scale);
  const container = scene.add.container(x, y, [scaled, namePill, nameText]);
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

  // Bubble geometry is laid out relative to the NPC's feet (just above its
  // nameplate, from `npc-layout.ts`), then placed at its current point, so a
  // roaming NPC (#113) carries its bubble along.
  const bubbleX = npc.bubbleOffsetX ?? 0;
  const bubbleBottomY = layout.bubbleBottomY + (npc.bubbleOffsetY ?? 0);
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
    const tailTopY = bubbleBottomY - SPEECH_BUBBLE_POINTER_TOP_INSET;

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
      tailTopY,
      tailX + SPEECH_BUBBLE_POINTER_HALF_WIDTH,
      tailTopY,
      tailX,
      tailTopY + SPEECH_BUBBLE_POINTER_HEIGHT,
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
    const { firstShowMs, visibleMs, periodMs } = bubbleSchedule(line);
    const gapMs = periodMs - visibleMs;

    const showThenScheduleNext = (): void => {
      layoutBubble(line.text);
      fadeBubble(1, SPEECH_BUBBLE_FADE_MS);
      lineTimers.push(
        scene.time.delayedCall(visibleMs, () => {
          fadeBubble(0, SPEECH_BUBBLE_FADE_MS);
          lineTimers.push(scene.time.delayedCall(gapMs, showThenScheduleNext));
        }),
      );
    };

    lineTimers.push(scene.time.delayedCall(firstShowMs, showThenScheduleNext));
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

  // The designs' idle bob moves the figure only; the nameplate stays put. A
  // designed motion (#113) replaces it: those NPCs' tracks already carry
  // the design's own bob where it has one.
  let bobTween: Tweens.Tween | null = null;
  const bob = npcBob(npc, { designedMotion: hasDesignedMotion });
  if (bob && !reducedMotion) {
    bobTween = scene.tweens.add({
      targets: scaled,
      y: -bob.distance,
      duration: bob.periodMs / 2,
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
