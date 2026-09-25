import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type Facing, type PenguinLook, type PresencePayload } from '../../contracts';
import { MASKED_NAME } from '../../ui/mask-names';
import type { WalkableGrid } from '../movement/pathfinding';
import { TILE_STEP_MS } from '../movement/speed';
import type { ScreenPoint } from './iso';
import { RoomPenguinView, type PlacedPenguin } from './room-penguin-view';

/** What the fake stage (standing in for Phaser) currently shows for one Penguin. */
interface ShownPenguin {
  look: PenguinLook;
  point: ScreenPoint;
  depth: number;
  facing: Facing;
  anim: 'idle' | 'walk';
  destroyed: boolean;
  /** How many times `moveTo` has been called; must stay 0 mid-step, since a Presence upsert can never cut a walk short (#43 D4). */
  moveToCalls: number;
  /** How many times `setFacing` has been called; must stay 0 mid-step, for the same reason as `moveToCalls` (#43 D4). */
  setFacingCalls: number;
  /** How many times `walk` has been called: a re-routed walk must call it once, not restart it per step (#43 D3). */
  walkCalls: number;
  bubble: string | null;
}

/** One `step()` call the fake stage recorded, with a manual resolver. */
interface StepCall {
  point: ScreenPoint;
  durationMs: number;
  depthAt: (t: number) => number;
  resolve: () => void;
}

/**
 * A fake rendering stage: records every Penguin placed on it and its
 * current state. `step()` never resolves on its own — tests drive it
 * tile by tile with `resolveNextStep()`, simulating the tween the real
 * `placePenguinsIn` runs completing.
 *
 * Honours `placePenguinsIn`'s real `PlacedPenguin` contract (#43): `moveTo`,
 * a new `step`, and `destroy` each cut an in-flight `step` short, resolving
 * its promise early without landing it on its target tile — the mechanism a
 * stray `moveTo` mid-walk must never trigger, since that would snap a
 * walker back and skip a tile.
 */
function createFakeStage() {
  const placed: ShownPenguin[] = [];
  const pendingSteps: StepCall[] = [];
  const stepCalls: StepCall[] = [];

  const place = (
    look: PenguinLook,
    point: ScreenPoint,
    depth: number,
    facing: Facing,
  ): PlacedPenguin => {
    const shown: ShownPenguin = {
      look,
      point,
      depth,
      facing,
      anim: 'idle',
      destroyed: false,
      moveToCalls: 0,
      setFacingCalls: 0,
      walkCalls: 0,
      bubble: null,
    };
    placed.push(shown);

    // Set only while a `step()` promise is unsettled; cuts it short (without
    // landing it on its target) exactly as the real `stopActiveStep` does.
    let interruptPendingStep: (() => void) | null = null;

    return {
      setLook: (next) => {
        shown.look = next;
      },
      setFacing: (next) => {
        shown.setFacingCalls += 1;
        shown.facing = next;
      },
      moveTo: (nextPoint, nextDepth) => {
        interruptPendingStep?.();
        shown.moveToCalls += 1;
        shown.point = nextPoint;
        shown.depth = nextDepth;
      },
      walk: () => {
        shown.anim = 'walk';
        shown.walkCalls += 1;
      },
      idle: () => {
        shown.anim = 'idle';
      },
      step: (nextPoint, durationMs, depthAt) => {
        interruptPendingStep?.();
        return new Promise<void>((resolve) => {
          let settled = false;
          const call: StepCall = {
            point: nextPoint,
            durationMs,
            depthAt,
            resolve: () => {
              if (settled) return;
              settled = true;
              shown.point = nextPoint;
              shown.depth = depthAt(1);
              const index = pendingSteps.indexOf(call);
              if (index !== -1) pendingSteps.splice(index, 1);
              interruptPendingStep = null;
              resolve();
            },
          };
          interruptPendingStep = () => {
            if (settled) return;
            settled = true;
            const index = pendingSteps.indexOf(call);
            if (index !== -1) pendingSteps.splice(index, 1);
            interruptPendingStep = null;
            resolve();
          };
          pendingSteps.push(call);
          stepCalls.push(call);
        });
      },
      say: (text) => {
        shown.bubble = text;
      },
      destroy: () => {
        interruptPendingStep?.();
        shown.destroyed = true;
      },
    };
  };

  return {
    place,
    placed,
    stepCalls,
    live: () => placed.filter((p) => !p.destroyed),
    pendingStepCount: () => pendingSteps.length,
    /** Resolves the oldest still-pending `step()` call and flushes its continuation. */
    async resolveNextStep(): Promise<void> {
      const next = pendingSteps.shift();
      if (!next) throw new Error('no pending step to resolve');
      next.resolve();
      // Let the view's `await placed.step(...)` continuation run.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

/** A mutable clock for the Presence-vs-walk settle window (#43 D4). */
function createClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/**
 * A fake clock that also drives the D4 settle-window recheck timer (#43
 * D4): `advance` moves the clock forward and fires any timer whose delay has
 * elapsed, exactly like `setTimeout`/`clearTimeout` would, but on a manually
 * driven clock instead of real wall time.
 */
function createFakeTimerClock(start = 0) {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { fireAt: number; handler: () => void }>();

  return {
    now: () => time,
    setTimeout: (handler: () => void, ms: number): number => {
      const id = nextId++;
      timers.set(id, { fireAt: time + ms, handler });
      return id;
    },
    clearTimeout: (id: number): void => {
      timers.delete(id);
    },
    advance: (ms: number): void => {
      time += ms;
      for (const [id, timer] of [...timers.entries()]) {
        if (timer.fireAt <= time) {
          timers.delete(id);
          timer.handler();
        }
      }
    },
    pendingTimerCount: (): number => timers.size,
  };
}

// Town Center's grid origin (tile {0,0}'s north corner).
const TOWN_CENTER_ORIGIN = { x: 800, y: 250 };
// Dev Pit-style second origin, to prove a Room switch re-projects.
const OTHER_ORIGIN = { x: 700, y: 200 };

function fullyWalkable(size = 12): boolean[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => true));
}
const FULLY_WALKABLE = fullyWalkable();

const PEBBLE: PenguinLook = { ...DEFAULT_LOOK, name: 'Pebble', body: '#E8483B' };

function payload(overrides: Partial<PresencePayload> = {}): PresencePayload {
  return {
    playerId: 'player-b',
    look: PEBBLE,
    tile: { col: 3, row: 5 },
    facing: 'right',
    ...overrides,
  };
}

function attachedView(
  options: {
    search?: string;
    walkable?: WalkableGrid;
    now?: () => number;
    setTimeout?: (handler: () => void, ms: number) => number;
    clearTimeout?: (handle: number) => void;
  } = {},
) {
  const stage = createFakeStage();
  const view = new RoomPenguinView({
    search: options.search ?? '',
    now: options.now,
    setTimeout: options.setTimeout,
    clearTimeout: options.clearTimeout,
  });
  view.attach(stage.place, TOWN_CENTER_ORIGIN, options.walkable ?? FULLY_WALKABLE);
  return { stage, view };
}

describe('RoomPenguinView', () => {
  it('shows a remote Penguin standing on the centre of its tile, with its look and facing', () => {
    const { stage, view } = attachedView();

    view.upsert(payload({ facing: 'left' }));

    // Tile {3,5}: north corner (800 + (3-5)*50, 250 + 8*25) = (700, 450),
    // centre 25px lower. Screen row 8, col 3 sorts at depth 8003.
    expect(stage.live()).toMatchObject([
      {
        look: PEBBLE,
        point: { x: 700, y: 475 },
        depth: 8003,
        facing: 'left',
        destroyed: false,
        bubble: null,
      },
    ]);
  });

  it('updates an already-shown Penguin in place instead of placing a second one', () => {
    const { stage, view } = attachedView();
    const renamed: PenguinLook = { ...PEBBLE, name: 'Waddles', body: '#3A4046', emote: 'DANCE' };

    view.upsert(payload());
    view.upsert(payload({ look: renamed, tile: { col: 6, row: 1 }, facing: 'left' }));

    // Tile {6,1}: north corner (800 + 5*50, 250 + 7*25) = (1050, 425).
    expect(stage.placed).toHaveLength(1);
    expect(stage.live()).toMatchObject([
      {
        look: renamed,
        point: { x: 1050, y: 450 },
        depth: 7006,
        facing: 'left',
        destroyed: false,
        bubble: null,
      },
    ]);
  });

  it('destroys a removed Penguin and ignores a Player it never showed', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.upsert(payload({ playerId: 'player-c', tile: { col: 4, row: 4 } }));

    view.remove('player-b');
    view.remove('never-shown');

    expect(stage.live().map((p) => p.point)).toEqual([{ x: 800, y: 475 }]);
  });

  it('clears every remote Penguin and the local Penguin', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));

    view.clear();

    expect(stage.placed).toHaveLength(2);
    expect(stage.live()).toEqual([]);
  });

  it('does not draw a remote Penguin whose payload has an empty name (#75)', () => {
    const { stage, view } = attachedView();

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('hides an already-shown Penguin that goes nameless, rather than showing it blank (#75)', () => {
    const { stage, view } = attachedView();
    view.upsert(payload());

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.live()).toEqual([]);
    expect(stage.placed).toHaveLength(1);
  });

  it('never draws a nameless local Penguin either (#75)', () => {
    const { stage, view } = attachedView();

    view.showLocal(payload({ playerId: 'player-a', look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('does not draw a nameless Penguin even under ?masknames (review round 1)', () => {
    const { stage, view } = attachedView({ search: '?masknames' });

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('masks every name tag, including on an update, under ?masknames', () => {
    const { stage, view } = attachedView({ search: '?debug&masknames' });

    view.upsert(payload());
    view.upsert(payload({ look: { ...PEBBLE, name: 'Waddles' } }));
    view.showLocal(payload({ playerId: 'player-a', look: { ...PEBBLE, name: 'Ada' } }));

    expect(stage.live().map((p) => p.look.name)).toEqual([MASKED_NAME, MASKED_NAME]);
    expect(stage.live()[0].look.body).toBe(PEBBLE.body);
  });

  it('re-shows every Penguin in the entered Room once the scene restarts for it', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));

    // The old scene's display list (and these Penguins) is torn down by Phaser.
    view.detach();
    view.upsert(payload({ playerId: 'player-c', tile: { col: 1, row: 1 } }));
    view.remove('player-b');
    const nextStage = createFakeStage();
    view.attach(nextStage.place, OTHER_ORIGIN, FULLY_WALKABLE);

    // Against origin (700, 200): tile {1,1} centre (700, 275); tile {4,4} centre (700, 425).
    expect(nextStage.live().map((p) => p.point)).toEqual([
      { x: 700, y: 425 },
      { x: 700, y: 275 },
    ]);
    expect(stage.live().filter((p) => p.destroyed)).toEqual([]);
  });

  describe('walkTo (#43)', () => {
    it('ignores an unknown playerId', () => {
      const { stage, view } = attachedView();

      view.walkTo('never-shown', { col: 1, row: 1 });

      expect(stage.placed).toHaveLength(0);
    });

    it('is a no-op when the target is already the shown tile and nothing is walking', () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 3, row: 3 } }));

      view.walkTo('player-b', { col: 3, row: 3 });

      expect(stage.pendingStepCount()).toBe(0);
      expect(view.debugRemotePenguins()).toEqual([
        {
          playerId: 'player-b',
          tile: { col: 3, row: 3 },
          moving: false,
          placedTile: { col: 3, row: 3 },
        },
      ]);
    });

    it('walks tile by tile at TILE_STEP_MS, facing and playing WALK, then idles on arrival', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      view.walkTo('player-b', { col: 5, row: 8 });

      // Moving immediately (before any step resolves), and the walk anim plays.
      expect(view.debugRemotePenguins()).toEqual([
        {
          playerId: 'player-b',
          tile: { col: 5, row: 5 },
          moving: true,
          placedTile: { col: 5, row: 5 },
          walkStartedAt: expect.any(Number),
        },
      ]);
      expect(stage.live()[0].anim).toBe('walk');
      expect(stage.pendingStepCount()).toBe(1);
      const firstStep = stage.stepCalls[0];
      expect(firstStep.durationMs).toBe(TILE_STEP_MS);
      // Row increases, column steady: the step moves screen x backward, so
      // it faces left (matches `facingForStep`'s own documented rule).
      expect(stage.live()[0].facing).toBe('left');
      // Tile {5,6}: corner (800 + (5-6)*50, 250 + 11*25) = (750, 525), centre (750, 550).
      expect(firstStep.point).toEqual({ x: 750, y: 550 });
      // depthAt sorts the in-flight tween between tile {5,5} (depth 10005)
      // and tile {5,6} (depth 11005): halfway through is 10505.
      expect(firstStep.depthAt(0)).toBe(10005);
      expect(firstStep.depthAt(1)).toBe(11005);
      expect(firstStep.depthAt(0.5)).toBe(10505);

      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 5, row: 6 },
        moving: true,
      });

      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 5, row: 7 },
        moving: true,
      });

      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0]).toEqual({
        playerId: 'player-b',
        tile: { col: 5, row: 8 },
        moving: false,
        placedTile: { col: 5, row: 5 },
        walkStartedAt: expect.any(Number),
      });
      expect(stage.live()[0].anim).toBe('idle');
      // Tile {5,8}: corner (800 - 150, 250 + 325) = (650, 575), centre (650, 600).
      expect(stage.live()[0].point).toEqual({ x: 650, y: 600 });
    });

    it('an upsert mid-step touches only the look: the step still lands on the very next tile (#43 D4)', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 }, facing: 'right' }));

      view.walkTo('player-b', { col: 5, row: 8 });
      const penguin = stage.live()[0];
      const moveToCallsBeforeUpsert = penguin.moveToCalls;
      const setFacingCallsBeforeUpsert = penguin.setFacingCalls;
      expect(stage.pendingStepCount()).toBe(1);

      // A Presence sync arrives mid-step: it must never call
      // `moveTo`/`setFacing` directly, since either would cut the in-flight
      // step short and snap the Penguin back, skipping the next tile.
      view.upsert(
        payload({
          tile: { col: 0, row: 0 },
          facing: 'left',
          look: { ...PEBBLE, name: 'Synced' },
        }),
      );

      expect(penguin.moveToCalls).toBe(moveToCallsBeforeUpsert);
      expect(penguin.setFacingCalls).toBe(setFacingCallsBeforeUpsert);
      expect(penguin.look.name).toBe('Synced');
      // Still exactly one step pending: the upsert never cut it short.
      expect(stage.pendingStepCount()).toBe(1);

      await stage.resolveNextStep();

      // The step landed cleanly on tile {5,6} — not skipped, not snapped back.
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 5, row: 6 },
        moving: true,
      });
      expect(penguin.point).toEqual({ x: 750, y: 550 });
    });

    it("re-paths a walkTo received mid-step from the landed tile, at that one step's boundary, not after the old path ends (#43 D3)", async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      view.walkTo('player-b', { col: 5, row: 8 }); // straight path down column 5
      expect(stage.pendingStepCount()).toBe(1);

      // A re-route arrives mid-step, toward a target whose own path
      // diverges immediately from the original path once re-planned from
      // the landed tile: queued, not applied immediately.
      view.walkTo('player-b', { col: 8, row: 6 });
      expect(stage.pendingStepCount()).toBe(1);

      await stage.resolveNextStep(); // lands on {5,6}: re-paths right here

      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 5, row: 6 },
        moving: true,
      });
      // The very next step already heads toward the re-route's own path
      // ({5,6} -> {6,6}), not toward the old path's {5,7}.
      expect(stage.pendingStepCount()).toBe(1);
      const reroutedStep = stage.stepCalls[stage.stepCalls.length - 1];
      // Tile {6,6}: corner (800 + 0, 250 + 12*25) = (800, 550), centre (800, 575).
      expect(reroutedStep.point).toEqual({ x: 800, y: 575 });

      await stage.resolveNextStep(); // -> {6,6}
      await stage.resolveNextStep(); // -> {7,6}
      await stage.resolveNextStep(); // -> {8,6}: arrived

      expect(view.debugRemotePenguins()[0]).toEqual({
        playerId: 'player-b',
        tile: { col: 8, row: 6 },
        moving: false,
        placedTile: { col: 5, row: 5 },
        walkStartedAt: expect.any(Number),
      });
      // The walk animation never restarted/flickered across the re-route.
      expect(stage.live()[0].walkCalls).toBe(1);
    });

    it('places an unreachable target directly, with no walk animation', () => {
      const unwalkableTarget = fullyWalkable();
      unwalkableTarget[9][9] = false;
      const { stage, view } = attachedView({ walkable: unwalkableTarget });
      view.upsert(payload({ tile: { col: 0, row: 0 } }));

      view.walkTo('player-b', { col: 9, row: 9 });

      expect(stage.pendingStepCount()).toBe(0);
      expect(stage.live()[0].anim).toBe('idle');
      // Tile {9,9}: corner (800, 250 + 450) = (800, 700), centre (800, 725).
      expect(stage.live()[0].point).toEqual({ x: 800, y: 725 });
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 9, row: 9 },
        moving: false,
      });
    });

    it('cancels the walk on remove: destroy resolves the in-flight step early, harmlessly (#43)', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));
      view.walkTo('player-b', { col: 5, row: 8 });
      expect(stage.pendingStepCount()).toBe(1);

      view.remove('player-b');

      // `destroy` (the real `PlacePenguin` contract) cuts the in-flight step
      // short: nothing is left pending, and the cut-short resolution is
      // harmless since the walk itself was already torn down.
      expect(stage.pendingStepCount()).toBe(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(stage.live()).toEqual([]);
      expect(view.debugRemotePenguins()).toEqual([]);
    });

    it('cancels the walk on clear: destroy resolves the in-flight step early, harmlessly (#43)', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));
      view.walkTo('player-b', { col: 5, row: 8 });
      expect(stage.pendingStepCount()).toBe(1);

      view.clear();

      expect(stage.pendingStepCount()).toBe(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(stage.live()).toEqual([]);
      expect(view.debugRemotePenguins()).toEqual([]);
    });

    it('detach mid-walk drops the walk and remembers its final target as the shown tile', () => {
      const { view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));
      view.walkTo('player-b', { col: 5, row: 8 });
      expect(view.debugRemotePenguins()[0].moving).toBe(true);

      view.detach();

      const nextStage = createFakeStage();
      view.attach(nextStage.place, OTHER_ORIGIN, FULLY_WALKABLE);

      expect(view.debugRemotePenguins()[0]).toEqual({
        playerId: 'player-b',
        tile: { col: 5, row: 8 },
        moving: false,
        placedTile: { col: 5, row: 8 },
        walkStartedAt: expect.any(Number),
      });
      // Against origin (700, 200): tile {5,8} centre = (700 + (5-8)*50, 200 + 13*25 + 25)
      // = (550, 550).
      expect(nextStage.live()[0].point).toEqual({ x: 550, y: 550 });
    });

    it("detach with a queued re-route pending remembers its target, not the active path's end (#43 D3)", () => {
      const { view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 } }));
      view.walkTo('player-b', { col: 5, row: 8 }); // active path ends at {5,8}
      view.walkTo('player-b', { col: 8, row: 6 }); // queued while the first step is in flight
      expect(view.debugRemotePenguins()[0].moving).toBe(true);

      view.detach();

      const nextStage = createFakeStage();
      view.attach(nextStage.place, OTHER_ORIGIN, FULLY_WALKABLE);

      // The queued re-route's own target, not {5,8} (the path in flight when
      // it queued), is where this walk was actually headed.
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 8, row: 6 },
        moving: false,
      });
    });

    it('a remove -> upsert -> walkTo for the same id within one task keeps the old walk from touching the new one (#43 D3)', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ playerId: 'player-b', tile: { col: 5, row: 5 } }));
      view.walkTo('player-b', { col: 5, row: 8 });
      expect(stage.pendingStepCount()).toBe(1);

      // All synchronous, in one task: `remove`'s `destroy` resolves the old
      // walk's in-flight step early, but its stale continuation is only a
      // microtask — it hasn't run yet by the time the id is walking again.
      view.remove('player-b');
      view.upsert(payload({ playerId: 'player-b', tile: { col: 0, row: 0 } }));
      view.walkTo('player-b', { col: 0, row: 2 });

      // Let the old walk's stale continuation run; it must not advance the
      // brand-new walk it no longer owns.
      await Promise.resolve();
      await Promise.resolve();

      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 0, row: 0 },
        moving: true,
      });
      expect(stage.pendingStepCount()).toBe(1);

      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0]).toMatchObject({
        tile: { col: 0, row: 1 },
        moving: true,
      });

      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0]).toEqual({
        playerId: 'player-b',
        tile: { col: 0, row: 2 },
        moving: false,
        placedTile: { col: 0, row: 0 },
        walkStartedAt: expect.any(Number),
      });
    });
  });

  describe('Presence vs. walk (#43 D4)', () => {
    it('upsert during a walk updates only the look, never the shown tile/facing', () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 }, facing: 'right' }));
      view.walkTo('player-b', { col: 5, row: 8 });

      const relookedLook: PenguinLook = { ...PEBBLE, name: 'Relooked' };
      view.upsert(payload({ tile: { col: 0, row: 0 }, facing: 'left', look: relookedLook }));

      expect(stage.live()[0].look).toEqual(relookedLook);
      expect(stage.live()[0].point).toEqual({ x: 800, y: 525 }); // still tile {5,5}'s point
      expect(view.debugRemotePenguins()[0].tile).toEqual({ col: 5, row: 5 });
    });

    it('defers to Presence only after the settle window elapses', async () => {
      const clock = createClock(0);
      const { stage, view } = attachedView({ now: clock.now });
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      // Walks one tile, so it "just arrived" (at t = 0) once this resolves.
      view.walkTo('player-b', { col: 5, row: 6 });
      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0].moving).toBe(false);

      // Within the 1500ms settle window: look updates, tile does not.
      clock.advance(500);
      const duringSettle: PenguinLook = { ...PEBBLE, name: 'DuringSettle' };
      view.upsert(payload({ tile: { col: 9, row: 9 }, look: duringSettle }));
      expect(stage.live()[0].look).toEqual(duringSettle);
      expect(view.debugRemotePenguins()[0].tile).toEqual({ col: 5, row: 6 });

      // Past the settle window: a differing Presence tile wins.
      clock.advance(1100); // total 1600ms since arrival
      const afterSettle: PenguinLook = { ...PEBBLE, name: 'AfterSettle' };
      view.upsert(payload({ tile: { col: 9, row: 9 }, look: afterSettle }));
      expect(view.debugRemotePenguins()[0].tile).toEqual({ col: 9, row: 9 });
      // Tile {9,9}: corner (800, 700), centre (800, 725).
      expect(stage.live()[0].point).toEqual({ x: 800, y: 725 });
    });

    it('applies a differing Presence tile once the settle window elapses with no intervening upsert (#43 D4)', async () => {
      const clock = createFakeTimerClock(0);
      const { stage, view } = attachedView({
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
      });
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      view.walkTo('player-b', { col: 5, row: 6 });
      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0].moving).toBe(false);

      // A stale Presence payload lands within the settle window: deferred,
      // same as the upsert-driven check above.
      view.upsert(payload({ tile: { col: 9, row: 9 } }));
      expect(view.debugRemotePenguins()[0].tile).toEqual({ col: 5, row: 6 });

      // No further upsert ever arrives; the scheduled recheck itself applies
      // the still-differing Presence tile once the settle window elapses.
      clock.advance(1500);

      expect(view.debugRemotePenguins()[0].tile).toEqual({ col: 9, row: 9 });
      // Tile {9,9}: corner (800, 700), centre (800, 725).
      expect(stage.live()[0].point).toEqual({ x: 800, y: 725 });
    });

    it('cancels the pending settle recheck as soon as a new walk starts (#43 D4)', async () => {
      const clock = createFakeTimerClock(0);
      const { stage, view } = attachedView({
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
      });
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      view.walkTo('player-b', { col: 5, row: 6 });
      await stage.resolveNextStep();
      expect(view.debugRemotePenguins()[0].moving).toBe(false);
      // The just-finished walk scheduled its own settle recheck.
      expect(clock.pendingTimerCount()).toBe(1);

      // A brand-new walk starting must drop that timer immediately, not
      // merely once (and if) the new walk itself later ends and schedules
      // its own: were the stale timer left pending, it could fire mid-walk
      // and misapply Presence before this walk even finishes.
      view.walkTo('player-b', { col: 5, row: 7 });
      expect(clock.pendingTimerCount()).toBe(0);
    });
  });

  it('says (and clears) a chat bubble above a shown remote Penguin, ignoring a Player not shown (#44)', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));

    expect(view.say('player-b', 'hello there')).toBe(true);
    expect(view.say('never-shown', 'ignored')).toBe(false);

    expect(stage.live()[0].bubble).toBe('hello there');

    expect(view.say('player-b', null)).toBe(true);

    expect(stage.live()[0].bubble).toBeNull();
  });

  it('says (and clears) a chat bubble above the local Penguin (#44)', () => {
    const { stage, view } = attachedView();
    view.showLocal(payload({ playerId: 'player-a' }));

    expect(view.sayLocal('hi')).toBe(true);

    expect(stage.live()[0].bubble).toBe('hi');

    expect(view.sayLocal(null)).toBe(true);

    expect(stage.live()[0].bubble).toBeNull();
  });

  it('sayLocal is a no-op (returns false) while the local Penguin is not shown', () => {
    const { view } = attachedView();

    expect(view.sayLocal('hi')).toBe(false);
  });

  it('notifies onBubbleChange(playerId, null) when a remote Penguin is removed (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hello there');

    view.remove('player-b');

    expect(changes).toEqual([['player-b', null]]);
  });

  it('notifies onBubbleChange(playerId, null) for every shown Penguin on clear() (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));
    view.say('player-b', 'hi');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.clear();

    expect(changes).toEqual(
      expect.arrayContaining([
        ['player-b', null],
        ['player-a', null],
      ]),
    );
  });

  it('notifies onBubbleChange(playerId, null) for every placed Penguin on detach() (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hi');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.detach();

    expect(changes).toEqual([['player-b', null]]);
  });

  it('clears a shown chat bubble and notifies onBubbleChange when a Penguin goes nameless (review round 1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hello there');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.upsert(payload({ playerId: 'player-b', look: { ...PEBBLE, name: '' } }));

    expect(changes).toEqual([['player-b', null]]);
    expect(view.say('player-b', 'still there?')).toBe(false);
  });

  it('never notifies onBubbleChange for a Player never shown', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.remove('never-shown');

    expect(changes).toEqual([]);
  });
});
