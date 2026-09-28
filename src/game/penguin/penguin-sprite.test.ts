// @vitest-environment jsdom
// Phaser reads `window` at import time, so this file needs a DOM environment.
import { GameObjects, type Scene } from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK } from '../../contracts';
import type { BodyMotionTweenConfig } from './motion';
import { CEILING_FURNITURE_DEPTH, depthForTile } from '../rooms/iso';
import {
  BUBBLE_ANCHOR_Y,
  createPenguin,
  nameTagText,
  PENGUIN_OVERLAY_NAME,
  PLAYER_PENGUIN_SCALE,
} from './penguin-sprite';

// `createPenguin` builds real Phaser game objects, which need a booted game.
// These fakes stand in for the few Phaser classes it constructs, so its
// tween cleanup can be checked against a fake scene (#68 review fix 3).
vi.mock('phaser', () => {
  class FakeObject {
    angle = 0;
    x: number;
    y: number;
    visible = true;
    depth = 0;
    name = '';
    list: unknown[];
    width = 0;
    height = 0;
    private readonly handlers = new Map<string, () => void>();
    constructor(_scene: unknown, x = 0, y = 0, children: unknown[] = []) {
      this.x = x;
      this.y = y;
      this.list = children;
    }
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
    setDepth(depth: number) {
      this.depth = depth;
      return this;
    }
    setName(name: string) {
      this.name = name;
      return this;
    }
    setOrigin() {
      return this;
    }
    setScale() {
      return this;
    }
    setTexture() {
      return this;
    }
    setFlipX() {
      return this;
    }
    setVisible(on: boolean) {
      this.visible = on;
      return this;
    }
    setText() {
      return this;
    }
    clear() {
      return this;
    }
    lineStyle() {
      return this;
    }
    fillStyle() {
      return this;
    }
    fillEllipse() {
      return this;
    }
    strokeEllipse() {
      return this;
    }
    fillCircle() {
      return this;
    }
    fillRoundedRect() {
      return this;
    }
    once(event: string, handler: () => void) {
      this.handlers.set(event, handler);
      return this;
    }
    destroy() {
      this.handlers.get('destroy')?.();
    }
  }
  return {
    GameObjects: {
      Sprite: FakeObject,
      Graphics: FakeObject,
      Text: FakeObject,
      Container: FakeObject,
      Events: { DESTROY: 'destroy' },
    },
    Scenes: { Events: { POST_UPDATE: 'postupdate' } },
    Textures: { Events: { ADD_KEY: 'addtexture-' } },
  };
});

describe('nameTagText', () => {
  it('returns the name when it is not empty', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: 'Waddles' })).toBe('Waddles');
  });

  it('returns null for an empty name, so the tag is hidden with no placeholder (#75)', () => {
    expect(nameTagText({ ...DEFAULT_LOOK, name: '' })).toBeNull();
  });
});

describe('BUBBLE_ANCHOR_Y (#131 review fix)', () => {
  it('scales the sprite-top-edge term by PLAYER_PENGUIN_SCALE but not the fixed gap above it', () => {
    // Independently worked out from the design constants this formula is
    // built from (PENGUIN_ORIGIN.y = 120, PENGUIN_FRAME_PADDING_Y = 30) and
    // the locked #131 scale (0.58), rather than re-deriving the production
    // formula: -(120 + 30) * 0.58 - 10 = -97.
    expect(PLAYER_PENGUIN_SCALE).toBe(0.58);
    expect(BUBBLE_ANCHOR_Y).toBeCloseTo(-97, 5);
  });
});

describe('createPenguin body-motion cleanup (#68 review fix 3)', () => {
  interface FakeTween {
    config: BodyMotionTweenConfig;
    removed: boolean;
    remove(): void;
    isPendingRemove(): boolean;
    isRemoved(): boolean;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeScene() {
    const tweens: FakeTween[] = [];
    const listeners: Record<string, Set<() => void>> = {};
    const scene = {
      textures: {
        exists: () => true,
        addBase64: () => undefined,
        once: () => undefined,
        on: () => undefined,
        off: () => undefined,
      },
      time: { addEvent: () => ({ remove: () => undefined }) },
      tweens: {
        add(config: BodyMotionTweenConfig) {
          const tween: FakeTween = {
            config,
            removed: false,
            remove() {
              tween.removed = true;
            },
            isPendingRemove: () => false,
            isRemoved: () => tween.removed,
          };
          tweens.push(tween);
          return tween;
        },
        // Phaser drops a removed tween from its list on the manager's next update.
        getTweensOf: (target: unknown) =>
          tweens.filter((t) => !t.removed && t.config.targets === target),
      },
      add: {
        container: (x: number, y: number, children?: unknown[]) =>
          new (
            GameObjects.Container as unknown as new (
              scene: unknown,
              x: number,
              y: number,
              children?: unknown[],
            ) => GameObjects.Container
          )({} as Scene, x, y, children),
      },
      events: {
        on(event: string, handler: () => void) {
          (listeners[event] ??= new Set()).add(handler);
        },
        off(event: string, handler: () => void) {
          listeners[event]?.delete(handler);
        },
        emit(event: string) {
          for (const handler of listeners[event] ?? []) handler();
        },
      },
    };
    return { scene, tweens, listeners };
  }

  it('destroy() leaves no tween on the body-motion proxy', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { scene, tweens } = fakeScene();
    const penguin = createPenguin(scene as unknown as Scene, 0, 0, DEFAULT_LOOK);
    expect(tweens).toHaveLength(1);
    const proxy = tweens[0].config.targets;
    expect(scene.tweens.getTweensOf(proxy)).toHaveLength(1);
    expect(penguin.bodyMotionTweenCount()).toBe(1);

    penguin.walk();
    expect(scene.tweens.getTweensOf(proxy)).toHaveLength(1);

    penguin.destroy();
    expect(scene.tweens.getTweensOf(proxy)).toEqual([]);
    expect(tweens.every((t) => t.removed)).toBe(true);
  });

  it('a destroy fired on the container directly also leaves no tween', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { scene, tweens } = fakeScene();
    const penguin = createPenguin(scene as unknown as Scene, 0, 0, DEFAULT_LOOK);
    const proxy = tweens[0].config.targets;
    penguin.container.destroy();
    expect(scene.tweens.getTweensOf(proxy)).toEqual([]);
  });

  it('draws the name tag and chat bubble above the ceiling item, following the body (#161 review)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { scene, listeners } = fakeScene();
    const penguin = createPenguin(scene as unknown as Scene, 900, 325, {
      ...DEFAULT_LOOK,
      name: 'Waddles',
    });
    penguin.say('hello');
    // The body holds only the sprite and snow hat; the overlay holds the name
    // tag's pill and text and the bubble's pill and text. (Every fake here is
    // one class, so the split is checked by count.)
    expect(penguin.container.list).toHaveLength(2);
    expect(penguin.overlay.list).toHaveLength(4);
    expect(penguin.overlay.name).toBe(PENGUIN_OVERLAY_NAME);

    // The body keeps its Tile depth; the overlay follows it on POST_UPDATE (#135).
    const bodyDepth = depthForTile({ col: 11, row: 9 });
    penguin.container.setDepth(bodyDepth);
    penguin.container.setPosition(1000, 400);
    scene.events.emit('postupdate');

    expect(penguin.container.depth).toBe(bodyDepth);
    expect(bodyDepth).toBeLessThan(CEILING_FURNITURE_DEPTH);
    expect(penguin.overlay.depth).toBeGreaterThan(CEILING_FURNITURE_DEPTH);
    expect({ x: penguin.overlay.x, y: penguin.overlay.y }).toEqual({ x: 1000, y: 400 });

    // Even the farthest Tile's tag stays above the ceiling item.
    penguin.container.setDepth(depthForTile({ col: 0, row: 0 }));
    scene.events.emit('postupdate');
    expect(penguin.overlay.depth).toBeGreaterThan(CEILING_FURNITURE_DEPTH);

    penguin.destroy();
    expect(listeners.postupdate?.size ?? 0).toBe(0);
  });
});
