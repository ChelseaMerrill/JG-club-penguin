import type { GameObjects, Scene } from 'phaser';
import type { HexColor } from '../../contracts';
import {
  sampleMarkerBall,
  sampleMarkerCalloutBob,
  sampleMarkerGlow,
  soccerBallPattern,
} from './minigame-markers';
import type { RoomMinigameMarker } from './room-definition';

/** The design's own near-black callout-pill text colour and bubble stroke (every call-out this prototype ports uses both verbatim). */
const CALLOUT_TEXT_COLOUR = '#161719';
const CALLOUT_STROKE_COLOUR = 0x0c4b5f;
/** The design's own ball fill/outline colours (`Latam Futebol Field.dc.html`'s ball `<g>`), also the patches' colour. */
const BALL_FILL_COLOUR = 0xf4f4f4;
const BALL_OUTLINE_COLOUR = 0x161719;
const BALL_SHADOW_COLOUR = 0x000000;
const BALL_SHADOW_ALPHA = 0.35;

export interface RoomMinigameMarkersOptions {
  /** Under reduced motion every marker stays at the design's own rest frame: glow off, callout/ball still. */
  reducedMotion: boolean;
}

function colourToNumber(colour: HexColor): number {
  return Number.parseInt(colour.slice(1), 16);
}

/** One `RoomMinigameMarker`'s live Phaser objects, built once and moved/faded every frame by `apply()`. */
interface MarkerVisual {
  spec: RoomMinigameMarker;
  glow: GameObjects.Graphics;
  callout?: { container: GameObjects.Container; restX: number; restY: number };
  ball?: {
    body: GameObjects.Container;
    valves: GameObjects.Container;
    shadow: GameObjects.Graphics;
  };
  /** The last frame's own sampled pose, for `debug()` (`window.__roomDebug.minigameMarkers`, e2e-only). */
  lastPose: MinigameMarkerDebugPose;
}

/** One marker's live pose, for e2e assertions that an animation is actually advancing (`RoomMinigameMarkers.debug()`). */
export interface MinigameMarkerDebugPose {
  glowAlpha: number;
  calloutDy: number | null;
  ballDy: number | null;
}

/**
 * Draws a Room's `minigameMarkers` (owner feedback 2026-10-13): the LATAM
 * Café's "MATCH THE TREATS" bubble over Sander Nonaka's register, the Disco
 * Hall's small animated turntable highlight (replacing the oversized baked-in
 * "SPIN IT · CARNAVAL PARADE" sign) and the Futebol Field's bouncing Penalty
 * Kick ball. `RoomScene` builds one for a Room with `minigameMarkers`, calls
 * `update` each frame and `destroy` on shutdown -- the same lifecycle
 * `RoomTankFish`/`RoomDiscoFloor` use.
 *
 * Each marker is purely decorative: the click that opens its minigame's NPC
 * dialog still goes through that Room's own `hotspots`/NPC click handling
 * (`main.ts`), the same way the Disco Hall's `disco-turntable` hotspot and
 * the Futebol Field's `penalty-kick-ball` hotspot already work -- this class
 * never listens for a click itself.
 */
export class RoomMinigameMarkers {
  private elapsedMs = 0;
  private readonly visuals: MarkerVisual[] = [];

  constructor(
    scene: Scene,
    markers: readonly RoomMinigameMarker[],
    private readonly options: RoomMinigameMarkersOptions,
  ) {
    for (const marker of markers) this.visuals.push(this.build(scene, marker));
    this.apply();
  }

  update(deltaMs: number): void {
    if (this.options.reducedMotion) return;
    this.elapsedMs += deltaMs;
    this.apply();
  }

  destroy(): void {
    for (const visual of this.visuals) {
      visual.glow.destroy();
      visual.callout?.container.destroy();
      visual.ball?.body.destroy();
      visual.ball?.shadow.destroy();
    }
    this.visuals.length = 0;
  }

  private build(scene: Scene, spec: RoomMinigameMarker): MarkerVisual {
    const glow = scene.add.graphics().setDepth(spec.depth);
    glow.fillStyle(colourToNumber(spec.glow.color), 1);
    glow.fillEllipse(
      spec.anchor.x + spec.glow.dx,
      spec.anchor.y + spec.glow.dy,
      spec.glow.rx * 2,
      spec.glow.ry * 2,
    );
    glow.setAlpha(0);

    let callout: MarkerVisual['callout'];
    if (spec.callout) {
      const { text, color, width, height } = spec.callout;
      const restX = spec.anchor.x + spec.callout.dx;
      const restY = spec.anchor.y + spec.callout.dy;
      const pointerHeight = height * 0.4;

      const pill = scene.add.graphics();
      const fillColour = colourToNumber(color);
      pill.fillStyle(fillColour, 1);
      pill.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
      pill.fillTriangle(
        -pointerHeight / 2,
        height / 2,
        pointerHeight / 2,
        height / 2,
        0,
        height / 2 + pointerHeight,
      );
      pill.lineStyle(3, CALLOUT_STROKE_COLOUR, 1);
      pill.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

      const label = scene.add
        .text(0, 0, text, {
          fontFamily: 'Anton, sans-serif',
          fontSize: `${Math.round(height * 0.47)}px`,
          color: CALLOUT_TEXT_COLOUR,
        })
        .setOrigin(0.5, 0.5)
        .setLetterSpacing(2);

      const container = scene.add.container(restX, restY, [pill, label]).setDepth(spec.depth);
      callout = { container, restX, restY };
    }

    let ball: MarkerVisual['ball'];
    if (spec.ball) {
      const { radius } = spec.ball;
      const body = scene.add.graphics();
      body.fillStyle(BALL_FILL_COLOUR, 1);
      body.fillCircle(0, 0, radius);

      // A classic soccer ball's patches and seams (owner request,
      // 2026-10-13), in their own container so they spin with the design's
      // valve-dot rotation while the white body and outline stay put.
      const { centre, rimPatches, seams } = soccerBallPattern(radius);
      const patches = scene.add.graphics();
      patches.lineStyle(Math.max(1, radius / 14), BALL_OUTLINE_COLOUR, 1);
      for (const seam of seams) patches.lineBetween(seam.from.x, seam.from.y, seam.to.x, seam.to.y);
      patches.fillStyle(BALL_OUTLINE_COLOUR, 1);
      patches.fillPoints(centre, true);
      for (const patch of rimPatches) patches.fillPoints(patch, true);
      const valves = scene.add.container(0, 0, [patches]);

      // The outline last, over the rim patches' clipped edges.
      const outline = scene.add.graphics();
      outline.lineStyle(3, BALL_OUTLINE_COLOUR, 1);
      outline.strokeCircle(0, 0, radius);

      const bodyContainer = scene.add
        .container(spec.anchor.x, spec.anchor.y, [body, valves, outline])
        .setDepth(spec.depth);

      const shadow = scene.add.graphics().setDepth(spec.depth - 0.001);

      ball = { body: bodyContainer, valves, shadow };
    }

    return { spec, glow, callout, ball, lastPose: { glowAlpha: 0, calloutDy: null, ballDy: null } };
  }

  /** `window.__roomDebug.minigameMarkers` (e2e-only): each marker's last-sampled pose, by id. */
  debug(): Record<string, MinigameMarkerDebugPose> {
    return Object.fromEntries(this.visuals.map((visual) => [visual.spec.id, visual.lastPose]));
  }

  private apply(): void {
    for (const visual of this.visuals) {
      const { spec } = visual;
      const glowAlpha = sampleMarkerGlow(spec.glow.peakOpacity, spec.glow.periodMs, this.elapsedMs);
      visual.glow.setAlpha(glowAlpha);
      visual.lastPose.glowAlpha = glowAlpha;

      if (visual.callout) {
        const dy = sampleMarkerCalloutBob(this.elapsedMs);
        visual.callout.container.setPosition(visual.callout.restX, visual.callout.restY + dy);
        visual.lastPose.calloutDy = dy;
      }

      if (visual.ball && spec.ball) {
        const pose = sampleMarkerBall(spec.ball, this.elapsedMs);
        visual.ball.body.setPosition(spec.anchor.x, spec.anchor.y + pose.dy);
        visual.ball.valves.setAngle(pose.valveRotationDeg);
        visual.lastPose.ballDy = pose.dy;

        const { dx, dy, rx, ry } = spec.ball.shadow;
        visual.ball.shadow.clear();
        visual.ball.shadow.fillStyle(BALL_SHADOW_COLOUR, BALL_SHADOW_ALPHA);
        visual.ball.shadow.fillEllipse(
          spec.anchor.x + dx,
          spec.anchor.y + dy,
          rx * 2 * pose.shadowScaleX,
          ry * 2,
        );
      }
    }
  }
}
