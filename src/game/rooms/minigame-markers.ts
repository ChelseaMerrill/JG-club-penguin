import {
  compileCssAnimation,
  sampleCssAnimation,
  sampleCssOpacity,
  type CompiledCssAnimation,
} from '../npcs/css-keyframes';

/**
 * The Phaser-free half of a Room's `RoomMinigameMarker`s (owner feedback
 * 2026-10-13, the LATAM Café/Disco Hall/Futebol Field): samples each
 * design-sourced animation `room-minigame-markers.ts` draws, the same
 * `css-keyframes.ts` reader `tank-fish.ts` uses for Town Center's betta.
 *
 * Every design call-out this prototype ports bobs with the exact same
 * `animateTransform` (`values="0 0;0 -6;0 0" dur="1.2s"
 * repeatCount="indefinite"`) -- the Café's "MATCH THE TREATS" bubble, the
 * Disco Hall's "SPIN IT · CARNAVAL PARADE" sign and the Futebol Field's "KICK
 * IT · PENALTY SHOOTOUT" callout all carry it verbatim -- so it's one shared
 * animation here, not data repeated on every `RoomMinigameMarker`.
 */
const CALLOUT_BOB: CompiledCssAnimation = compileCssAnimation({
  keyframes:
    '@keyframes minigameMarkerBob { 0%,100% { transform: translate(0,0); } 50% { transform: translate(0,-6px); } }',
  animation: 'minigameMarkerBob 1.2s linear infinite',
});

/** `glowPulse`'s own cache: a Room's several markers often share the same `(peakOpacity, periodMs)` pair. */
const glowAnimations = new Map<string, CompiledCssAnimation>();

/**
 * A marker's glow pulse, traced from the design's own `<animate
 * attributeName="opacity" values="0;PEAK;0" dur="PERIODs"
 * repeatCount="indefinite"/>`: SMIL's own default (no `keyTimes`, no
 * `calcMode`) is three evenly-spaced stops, linearly interpolated, which is
 * exactly what `css-keyframes.ts`'s `0%,100%`/`50%` stops reproduce.
 */
function glowPulse(peakOpacity: number, periodMs: number): CompiledCssAnimation {
  const key = `${peakOpacity}:${periodMs}`;
  let animation = glowAnimations.get(key);
  if (!animation) {
    animation = compileCssAnimation({
      keyframes: `@keyframes minigameMarkerGlow { 0%,100% { opacity: 0; } 50% { opacity: ${peakOpacity}; } }`,
      animation: `minigameMarkerGlow ${periodMs}ms linear infinite`,
    });
    glowAnimations.set(key, animation);
  }
  return animation;
}

/** A marker's glow opacity `elapsedMs` into the Room (0 at rest, matching `prefersReducedMotion()`'s static frame). */
export function sampleMarkerGlow(peakOpacity: number, periodMs: number, elapsedMs: number): number {
  return sampleCssOpacity(glowPulse(peakOpacity, periodMs), elapsedMs);
}

/** A marker's callout bob offset, Stage px, `elapsedMs` into the Room (0 at rest). */
export function sampleMarkerCalloutBob(elapsedMs: number): number {
  return sampleCssAnimation(CALLOUT_BOB, elapsedMs).f;
}

/**
 * The Futebol Field ball's own bounce (owner feedback 2026-10-13), traced
 * from the design's `<animateTransform attributeName="transform"
 * type="translate" values="0 0;0 -34;0 0" dur=".9s" keyTimes="0;.5;1"
 * calcMode="spline" keySplines=".3 0 .6 1;.6 0 .3 1"
 * repeatCount="indefinite"/>`: SMIL's two keySplines (up, then down) are
 * mirror images of each other, approximated here by one shared
 * `cubic-bezier(.3,0,.6,1)` for the whole cycle (`css-keyframes.ts` applies
 * one easing function per animation, not per segment) -- close enough to
 * read as the same bounce, a documented approximation rather than a second
 * animation engine.
 */
const ballBounceAnimations = new Map<string, CompiledCssAnimation>();

function ballBounce(heightPx: number, periodMs: number): CompiledCssAnimation {
  const key = `${heightPx}:${periodMs}`;
  let animation = ballBounceAnimations.get(key);
  if (!animation) {
    animation = compileCssAnimation({
      keyframes: `@keyframes minigameBallBounce { 0%,100% { transform: translate(0,0); } 50% { transform: translate(0,-${heightPx}px); } }`,
      animation: `minigameBallBounce ${periodMs}ms cubic-bezier(.3,0,.6,1) infinite`,
    });
    ballBounceAnimations.set(key, animation);
  }
  return animation;
}

/**
 * The ball's own ground shadow, squashing in sync with the bounce (the
 * design's `<ellipse ...><animate attributeName="rx" values="REST;SQUASHED;
 * REST" dur="SAME .9s" repeatCount="indefinite"/></ellipse>`, no easing
 * specified -- SMIL's own linear default): modelled as a `scaleX` track (1 at
 * rest, `squashedRx / restRx` at the midpoint) so `sampleCssAnimation` can
 * read it the same way as every other transform here.
 */
const shadowSquashAnimations = new Map<string, CompiledCssAnimation>();

function shadowSquash(restRx: number, squashedRx: number, periodMs: number): CompiledCssAnimation {
  const key = `${restRx}:${squashedRx}:${periodMs}`;
  let animation = shadowSquashAnimations.get(key);
  if (!animation) {
    const scale = squashedRx / restRx;
    animation = compileCssAnimation({
      keyframes: `@keyframes minigameBallShadow { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(${scale}); } }`,
      animation: `minigameBallShadow ${periodMs}ms linear infinite`,
    });
    shadowSquashAnimations.set(key, animation);
  }
  return animation;
}

/**
 * The two small "valve" dots on the ball's own tread, spinning a full turn
 * with the design's `<animateTransform attributeName="transform"
 * type="rotate" values="0 855 546;360 855 546" dur="1.8s"
 * repeatCount="indefinite"/>` -- the only one of these four tracks whose
 * period is independent of the bounce's own `.9s`.
 */
const BALL_VALVES_SPIN: CompiledCssAnimation = compileCssAnimation({
  keyframes:
    '@keyframes minigameBallValves { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }',
  animation: 'minigameBallValves 1.8s linear infinite',
});

export interface MarkerBallPose {
  /** Stage px, negative is up (0 at rest, on the ground). */
  dy: number;
  /** The shadow's own horizontal scale (1 at rest, narrower at the bounce's peak). */
  shadowScaleX: number;
  /** The ball's pattern rotation, degrees (the design's valve-dot spin). */
  valveRotationDeg: number;
}

/** A `RoomMinigameMarkerBall`'s pose `elapsedMs` into the Room (the design's rest frame at `elapsedMs = 0`). */
export function sampleMarkerBall(
  ball: {
    bounceHeight: number;
    bouncePeriodMs: number;
    shadow: { rx: number; squashedRx: number };
  },
  elapsedMs: number,
): MarkerBallPose {
  const bounce = sampleCssAnimation(ballBounce(ball.bounceHeight, ball.bouncePeriodMs), elapsedMs);
  const shadow = sampleCssAnimation(
    shadowSquash(ball.shadow.rx, ball.shadow.squashedRx, ball.bouncePeriodMs),
    elapsedMs,
  );
  const valves = sampleCssAnimation(BALL_VALVES_SPIN, elapsedMs);
  return {
    dy: bounce.f,
    shadowScaleX: shadow.a,
    valveRotationDeg: (Math.atan2(valves.b, valves.a) * 180) / Math.PI,
  };
}

export interface SoccerBallPattern {
  /** The black centre pentagon. */
  centre: { x: number; y: number }[];
  /** The five black patches around the rim, each already clipped to the ball's edge. */
  rimPatches: { x: number; y: number }[][];
  /** The five seams joining each centre-pentagon corner to its rim patch. */
  seams: { from: { x: number; y: number }; to: { x: number; y: number } }[];
}

/**
 * A classic black-and-white soccer ball's pattern for a ball of `radius`,
 * centred on (0,0) (owner request, 2026-10-13: the design's own ball, one
 * pentagon and two valve dots, "just looks like a white ball with 3 dots").
 * A centre pentagon, a seam from each of its corners out to a rim patch, and
 * five rim pentagons, each clipped to the ball's edge by pulling any corner
 * that falls outside the ball back onto it.
 */
export function soccerBallPattern(radius: number): SoccerBallPattern {
  const pentagon = (cx: number, cy: number, size: number, turn: number) =>
    [0, 1, 2, 3, 4].map((i) => {
      const angle = turn + (i * 2 * Math.PI) / 5;
      return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
    });
  const toEdge = (point: { x: number; y: number }) => {
    const distance = Math.hypot(point.x, point.y);
    return distance <= radius
      ? point
      : { x: (point.x / distance) * radius, y: (point.y / distance) * radius };
  };
  const up = -Math.PI / 2;
  const centre = pentagon(0, 0, radius * 0.36, up);
  const rimPatches: SoccerBallPattern['rimPatches'] = [];
  const seams: SoccerBallPattern['seams'] = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = up + (i * 2 * Math.PI) / 5;
    const cx = radius * 0.98 * Math.cos(angle);
    const cy = radius * 0.98 * Math.sin(angle);
    // Each rim patch points back at the centre, so a flat side faces outward.
    const patch = pentagon(cx, cy, radius * 0.34, angle + Math.PI).map(toEdge);
    rimPatches.push(patch);
    // Its first corner is the one pointing at the centre pentagon.
    seams.push({ from: centre[i]!, to: patch[0]! });
  }
  return { centre, rimPatches, seams };
}
