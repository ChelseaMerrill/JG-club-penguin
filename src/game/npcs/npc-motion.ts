import type { NpcMotionSpec, NpcPropLayer } from '../../npcs/npc-motions';
import { PENGUIN_ORIGIN } from '../penguin/render-svg';
import {
  depthForTile,
  TILE_HEIGHT,
  TILE_WIDTH,
  type GridOrigin,
  type ScreenPoint,
} from '../rooms/iso';
import {
  compileCssAnimation,
  IDENTITY,
  multiplyAffine,
  sampleCssAnimation,
  sampleCssOpacity,
  transformPoint,
  type Affine,
  type CompiledCssAnimation,
} from './css-keyframes';

/**
 * The Phaser-free heart of #113's NPC motions: one NPC's clock, pause state
 * and per-frame pose, sampled from its Room design's own keyframes
 * (`../../npcs/npc-motions.ts`). `room-npc-motions.ts` applies each pose to
 * the NPC's Phaser objects; nothing here touches Phaser, so it is unit
 * tested directly.
 */

/** A prop layer's transform (in its parent's space, feet-relative) and its nested layers'. */
export interface NpcPropPose {
  matrix: Affine;
  /**
   * The layer's own opacity from its design keyframes, 1 without any
   * (owner request, 2026-09-30, Track D); a nested layer's multiplies with
   * its parent's, as CSS/Phaser group opacity does.
   */
  alpha: number;
  children: NpcPropPose[];
}

export interface NpcMotionPose {
  /** Where the NPC's feet are on the Stage right now. */
  point: ScreenPoint;
  /** `depthForTile` of the (fractional) tile under `point`, the same rule Penguins sort by. */
  depth: number;
  /** True while the NPC is walking its path (not paused, and it has one). */
  moving: boolean;
  /** The whole figure's in-place transform, relative to the feet; `null` without one. */
  figure: Affine | null;
  /**
   * The Stage-level transform of the figure plus its name tag (#150),
   * relative to the NPC's rest point, where its unscaled `body` container's
   * origin sits; `null` without one.
   */
  stage: Affine | null;
  props: NpcPropPose[];
}

interface CompiledProp {
  animation: CompiledCssAnimation | null;
  children: CompiledProp[];
}

/** The figure's feet (its sprite origin) in the design's 120x130 figure viewBox. */
const FEET = PENGUIN_ORIGIN;

/** Re-expresses a figure-viewBox transform relative to the feet, where the sprite's origin sits. */
function feetRelative(m: Affine): Affine {
  return multiplyAffine(multiplyAffine({ ...IDENTITY, e: -FEET.x, f: -FEET.y }, m), {
    ...IDENTITY,
    e: FEET.x,
    f: FEET.y,
  });
}

/** Re-expresses a Stage-space transform relative to `rest`, where the NPC's `body` origin sits (#150). */
function restRelative(m: Affine, rest: ScreenPoint): Affine {
  return multiplyAffine(multiplyAffine({ ...IDENTITY, e: -rest.x, f: -rest.y }, m), {
    ...IDENTITY,
    e: rest.x,
    f: rest.y,
  });
}

function compileProp(layer: NpcPropLayer): CompiledProp {
  return {
    animation: layer.motion ? compileCssAnimation(layer.motion) : null,
    children: (layer.children ?? []).map(compileProp),
  };
}

function poseProp(prop: CompiledProp, elapsedMs: number): NpcPropPose {
  return {
    matrix: prop.animation ? feetRelative(sampleCssAnimation(prop.animation, elapsedMs)) : IDENTITY,
    alpha: prop.animation ? sampleCssOpacity(prop.animation, elapsedMs) : 1,
    children: prop.children.map((child) => poseProp(child, elapsedMs)),
  };
}

/**
 * The fractional tile whose centre is `point` (the inverse of
 * `tileToScreen`, unfloored), so an NPC between tiles sorts between them.
 */
function fractionalTile(point: ScreenPoint, origin: GridOrigin): { col: number; row: number } {
  const colMinusRow = (point.x - origin.x) / (TILE_WIDTH / 2);
  const colPlusRow = (point.y - origin.y - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2);
  return { col: (colPlusRow + colMinusRow) / 2, row: (colPlusRow - colMinusRow) / 2 };
}

export class NpcMotion {
  readonly roams: boolean;
  private readonly path: CompiledCssAnimation | null;
  private readonly figure: CompiledCssAnimation | null;
  private readonly stage: CompiledCssAnimation | null;
  private readonly props: CompiledProp[];
  /** Drives the path; frozen while paused. */
  private pathMs = 0;
  /** Drives in-place motions; never paused. */
  private inPlaceMs = 0;
  private isPaused = false;

  constructor(
    spec: NpcMotionSpec,
    private readonly rest: ScreenPoint,
    private readonly origin: GridOrigin,
  ) {
    this.path = spec.path ? compileCssAnimation(spec.path) : null;
    this.figure = spec.figure ? compileCssAnimation(spec.figure) : null;
    this.stage = spec.stage ? compileCssAnimation(spec.stage) : null;
    this.props = (spec.props ?? []).map(compileProp);
    this.roams = this.path !== null;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  advance(deltaMs: number): void {
    this.inPlaceMs += deltaMs;
    if (!this.isPaused) this.pathMs += deltaMs;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  pose(): NpcMotionPose {
    const offset = this.path
      ? transformPoint(sampleCssAnimation(this.path, this.pathMs), { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const point = { x: this.rest.x + offset.x, y: this.rest.y + offset.y };
    return {
      point,
      depth: depthForTile(fractionalTile(point, this.origin)),
      moving: this.roams && !this.isPaused,
      figure: this.figure ? feetRelative(sampleCssAnimation(this.figure, this.inPlaceMs)) : null,
      stage: this.stage
        ? restRelative(sampleCssAnimation(this.stage, this.inPlaceMs), this.rest)
        : null,
      props: this.props.map((prop) => poseProp(prop, this.inPlaceMs)),
    };
  }
}

/**
 * The NPC's motion standing at `rest` (its slot tile's Stage point), or
 * `null` when it has none to play: no designed motion, or the Player
 * prefers reduced motion (the NPC then stands still at its slot, #113
 * resolved decision 3).
 */
export function createNpcMotion(
  spec: NpcMotionSpec | undefined,
  rest: ScreenPoint,
  origin: GridOrigin,
  options: { reducedMotion: boolean },
): NpcMotion | null {
  if (!spec || options.reducedMotion) return null;
  if (!spec.path && !spec.figure && !spec.stage && !spec.props?.length) return null;
  return new NpcMotion(spec, rest, origin);
}

/** What `NpcClickPause` needs from the Room's NPC motions. */
export interface NpcPauseTarget {
  roams(npcId: string): boolean;
  pause(npcId: string): void;
  resume(npcId: string): void;
}

/**
 * #113 resolved decision 1: clicking a roaming NPC pauses it where it is
 * until its dialog closes. It resumes early if the Penguin's walk to it
 * ends without the dialog opening (the Player re-routed, the walk was
 * dropped, or another overlay refused the dialog), or when a different NPC
 * is clicked. `RoomScene` feeds it clicks, dialog open/close events, and
 * once a frame whether that NPC's arrival callback is still pending.
 */
export class NpcClickPause {
  private current: { npcId: string; dialogOpen: boolean } | null = null;

  constructor(private readonly target: NpcPauseTarget) {}

  clicked(npcId: string): void {
    const previous = this.current;
    if (previous && previous.npcId !== npcId) {
      this.target.resume(previous.npcId);
      this.current = null;
    }
    if (!this.target.roams(npcId)) return;
    this.target.pause(npcId);
    this.current = { npcId, dialogOpen: previous?.npcId === npcId && previous.dialogOpen };
  }

  dialogOpened(npcId: string): void {
    if (this.current?.npcId === npcId) this.current.dialogOpen = true;
  }

  dialogClosed(npcId: string): void {
    if (this.current?.npcId !== npcId) return;
    this.current = null;
    this.target.resume(npcId);
  }

  settle(state: { arrivalPending: boolean }): void {
    const current = this.current;
    if (!current || current.dialogOpen || state.arrivalPending) return;
    this.current = null;
    this.target.resume(current.npcId);
  }
}
