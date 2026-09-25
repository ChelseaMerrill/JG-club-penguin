import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK,
  UNNAMED_PENGUIN,
  type Facing,
  type PenguinLook,
  type PresencePayload,
} from '../../contracts';
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
  /** How many times `moveTo` has been called (#43 fix F1's regression check). */
  moveToCalls: number;
  /** How many times `setFacing` has been called (#43 fix F1's regression check). */
  setFacingCalls: number;
  /** How many times `walk` has been called: a re-routed walk must call it once, not restart it per step (#43 fix F2). */
  walkCalls: number;
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
 * Honours `placePenguinsIn`'s real `PlacedPenguin` contract (#43 fix F3):
 * `moveTo`, a new `step`, and `destroy` each cut an in-flight `step` short,
 * resolving its promise early without landing it on its target tile —
 * exactly the mechanism that let a stray `moveTo` mid-walk snap a walker
 * back and skip a tile before fix F1.
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
  } = {},
) {
  const stage = createFakeStage();
  const view = new RoomPenguinView({ search: options.search ?? '', now: options.now });
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
      { look: PEBBLE, point: { x: 700, y: 475 }, depth: 8003, facing: 'left', destroyed: false },
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
      { look: renamed, point: { x: 1050, y: 450 }, depth: 7006, facing: 'left', destroyed: false },
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

  it('name-tags an unnamed Penguin as UNNAMED_PENGUIN', () => {
    const { stage, view } = attachedView();

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.live()[0].look.name).toBe(UNNAMED_PENGUIN);
  });

  it('masks every name tag, including on an update, under ?masknames', () => {
    const { stage, view } = attachedView({ search: '?debug&masknames' });

    view.upsert(payload());
    view.upsert(payload({ look: { ...PEBBLE, name: 'Waddles' } }));
    view.showLocal(payload({ playerId: 'player-a', look: { ...PEBBLE, name: '' } }));

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

    it('an upsert mid-step touches only the look: the step still lands on the very next tile (#43 fix F1)', async () => {
      const { stage, view } = attachedView();
      view.upsert(payload({ tile: { col: 5, row: 5 }, facing: 'right' }));

      view.walkTo('player-b', { col: 5, row: 8 });
      const penguin = stage.live()[0];
      const moveToCallsBeforeUpsert = penguin.moveToCalls;
      const setFacingCallsBeforeUpsert = penguin.setFacingCalls;
      expect(stage.pendingStepCount()).toBe(1);

      // A Presence sync arrives mid-step (today's bug: this used to call
      // `moveTo`/`setFacing`, which cuts the in-flight step short and
      // snaps the Penguin back, so the *next* step then skips a tile).
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

    it("re-paths a walkTo received mid-step from the landed tile, at that one step's boundary, not after the old path ends (#43 fix F2)", async () => {
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

    it('cancels the walk on remove: destroy resolves the in-flight step early, harmlessly (#43 fix F3)', async () => {
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

    it('cancels the walk on clear: destroy resolves the in-flight step early, harmlessly (#43 fix F3)', async () => {
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

    it('defers to Presence only after the settle window elapses', () => {
      const clock = createClock(0);
      const { stage, view } = attachedView({ now: clock.now });
      view.upsert(payload({ tile: { col: 5, row: 5 } }));

      // Walks one tile, so it "just arrived" (at t = 0) once this resolves.
      view.walkTo('player-b', { col: 5, row: 6 });
      return stage.resolveNextStep().then(() => {
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
    });
  });
});
