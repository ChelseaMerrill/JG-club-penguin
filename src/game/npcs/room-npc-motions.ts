import { GameObjects, Textures, type Scene } from 'phaser';
import type { NpcMotionSpec, NpcPropLayer } from '../../npcs/npc-motions';
import { penguinFeetOrigin } from '../penguin/render-svg';
import type { GridOrigin, ScreenPoint } from '../rooms/iso';
import { ensureSvgTexture } from '../svg-texture';
import { decomposeAffine, type Affine } from './css-keyframes';
import {
  createNpcMotion,
  type NpcMotion,
  type NpcPauseTarget,
  type NpcPropPose,
} from './npc-motion';
import { prefersReducedMotion, type NpcSprite } from './npc-sprite';
import { renderNpcPropSvg } from './render-npc-svg';

/** Phaser's always-present built-in placeholder texture (as `npc-sprite.ts` uses). */
const PLACEHOLDER_TEXTURE_KEY = '__DEFAULT';

/** One NPC standing in the Room, as `RoomScene.drawNpcs` built it. */
export interface RoomNpcActor {
  npcId: string;
  sprite: NpcSprite;
  /** Its invisible click target, kept `zoneOffsetY` above the feet. */
  zone: GameObjects.Zone;
  zoneOffsetY: number;
  /** Its slot tile's Stage point, where it rests. */
  rest: ScreenPoint;
}

/** `window.__roomDebug.npcs[npcId]` (#113). */
export interface NpcMotionDebugInfo {
  x: number;
  y: number;
  moving: boolean;
  paused: boolean;
}

interface PropView {
  container: GameObjects.Container;
  children: PropView[];
}

interface Entry {
  actor: RoomNpcActor;
  motion: NpcMotion | null;
  props: PropView[];
}

function applyAffine(target: GameObjects.Container, m: Affine): void {
  const { x, y, rotation, scaleX, scaleY } = decomposeAffine(m);
  target.setPosition(x, y);
  target.setRotation(rotation);
  target.setScale(scaleX, scaleY);
}

function applyProps(views: PropView[], poses: NpcPropPose[]): void {
  views.forEach((view, index) => {
    const pose = poses[index];
    if (!pose) return;
    applyAffine(view.container, pose.matrix);
    applyProps(view.children, pose.children);
  });
}

/**
 * Plays a Room's NPC motions (#113) on the Phaser objects `RoomScene`
 * built: each frame it advances every NPC's `NpcMotion` and moves its
 * sprite (figure, name tag, speech bubble), click target and depth to the
 * sampled pose, and transforms the figure and any prop layers in place.
 * NPCs without a designed motion, and every NPC under reduced motion, are
 * only tracked (for `debug()`), never moved. Client-side only: nothing
 * here touches Presence.
 */
export class RoomNpcMotions implements NpcPauseTarget {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly scene: Scene,
    private readonly origin: GridOrigin,
  ) {}

  add(actor: RoomNpcActor, spec: NpcMotionSpec | undefined): void {
    const motion = createNpcMotion(spec, actor.rest, this.origin, {
      reducedMotion: prefersReducedMotion(),
    });
    const props =
      motion && spec?.props
        ? spec.props.map((layer, index) =>
            this.buildProp(layer, actor.sprite.figure, `${actor.npcId}:${index}`),
          )
        : [];
    const entry: Entry = { actor, motion, props };
    this.entries.set(actor.npcId, entry);
    this.apply(entry);
  }

  update(deltaMs: number): void {
    for (const entry of this.entries.values()) {
      if (!entry.motion) continue;
      entry.motion.advance(deltaMs);
      this.apply(entry);
    }
  }

  roams(npcId: string): boolean {
    return this.entries.get(npcId)?.motion?.roams ?? false;
  }

  pause(npcId: string): void {
    this.entries.get(npcId)?.motion?.pause();
  }

  resume(npcId: string): void {
    this.entries.get(npcId)?.motion?.resume();
  }

  /** Where the NPC's feet are right now (its slot point when it doesn't move). */
  point(npcId: string): ScreenPoint | undefined {
    const entry = this.entries.get(npcId);
    if (!entry) return undefined;
    return entry.motion ? entry.motion.pose().point : entry.actor.rest;
  }

  debug(): Record<string, NpcMotionDebugInfo> {
    const result: Record<string, NpcMotionDebugInfo> = {};
    for (const [npcId, entry] of this.entries) {
      const pose = entry.motion?.pose();
      const point = pose?.point ?? entry.actor.rest;
      result[npcId] = {
        x: point.x,
        y: point.y,
        moving: pose?.moving ?? false,
        paused: entry.motion?.paused ?? false,
      };
    }
    return result;
  }

  /** Forgets every NPC; their Phaser objects (props included) go with the sprites `RoomScene` destroys. */
  destroy(): void {
    this.entries.clear();
  }

  private apply(entry: Entry): void {
    const { motion, actor } = entry;
    if (!motion) return;
    const pose = motion.pose();
    actor.sprite.setPoint(pose.point.x, pose.point.y, pose.depth);
    actor.zone.setPosition(pose.point.x, pose.point.y + actor.zoneOffsetY);
    actor.zone.setDepth(pose.depth);
    if (pose.figure) applyAffine(actor.sprite.figure, pose.figure);
    applyProps(entry.props, pose.props);
  }

  /** A prop layer's sprite (anchored at the feet like the figure) inside its own transformable container. */
  private buildProp(layer: NpcPropLayer, parent: GameObjects.Container, id: string): PropView {
    const scene = this.scene;
    const key = `npc-prop:${id}`;
    ensureSvgTexture(scene.textures, key, () => renderNpcPropSvg(layer.svg));

    const origin = penguinFeetOrigin();
    const sprite = new GameObjects.Sprite(scene, 0, 0, PLACEHOLDER_TEXTURE_KEY);
    sprite.setOrigin(origin.x, origin.y);
    if (scene.textures.exists(key)) {
      sprite.setTexture(key);
    } else {
      // The same pending-decode guard as `npc-sprite.ts`: a teardown before
      // the texture decodes drops the listener instead of leaking it.
      let destroyed = false;
      const listener = (): void => {
        if (!destroyed) sprite.setTexture(key);
      };
      scene.textures.once(Textures.Events.ADD_KEY + key, listener);
      sprite.once(GameObjects.Events.DESTROY, () => {
        destroyed = true;
        scene.textures.off(Textures.Events.ADD_KEY + key, listener);
      });
    }

    const container = new GameObjects.Container(scene, 0, 0, [sprite]);
    parent.add(container);
    const children = (layer.children ?? []).map((child, index) =>
      this.buildProp(child, container, `${id}.${index}`),
    );
    return { container, children };
  }
}
