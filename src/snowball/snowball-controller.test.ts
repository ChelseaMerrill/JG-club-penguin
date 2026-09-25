import { describe, expect, it, vi } from 'vitest';
import type { Tile } from '../contracts';
import {
  createSnowballController,
  type SnowballController,
  type SnowballRoomChannel,
  type SnowballView,
} from './snowball-controller';
import { SNOW_HAT_MS, SNOWBALL_FLIGHT_MS, type ScreenPoint } from './snowball-rules';

type ThrowPayload = { playerId: string; throwId: string; target: Tile };
type HitPayload = { playerId: string; throwId: string; targetId: string };
type RoomChangeHandler = (roomId: string | null) => void;

/** A manually-driven fake timer (no real wall-clock or vitest fake-timer interplay). */
function createManualTimer() {
  let nextId = 1;
  const scheduled: Array<{ id: number; delay: number; cb: () => void }> = [];
  return {
    scheduled,
    setTimeout: ((cb: () => void, delay?: number) => {
      const id = nextId++;
      scheduled.push({ id, delay: delay ?? 0, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((id: unknown) => {
      const index = scheduled.findIndex((entry) => entry.id === id);
      if (index !== -1) scheduled.splice(index, 1);
    }) as typeof clearTimeout,
    /** Fires every timer currently scheduled at exactly `delay`, in schedule order. */
    fireDelay(delay: number): void {
      let index = scheduled.findIndex((entry) => entry.delay === delay);
      while (index !== -1) {
        const [entry] = scheduled.splice(index, 1);
        entry.cb();
        index = scheduled.findIndex((e) => e.delay === delay);
      }
    },
  };
}

function clockFrom(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** A fake `SnowballRoomChannel`: records sends and lets the test drive incoming events. */
function createFakeChannel() {
  const throwHandlers = new Set<(payload: ThrowPayload) => void>();
  const hitHandlers = new Set<(payload: HitPayload) => void>();
  const roomChangeHandlers = new Set<RoomChangeHandler>();
  const throwSends: ThrowPayload[] = [];
  const hitSends: HitPayload[] = [];
  let throwSendResult = true;

  return {
    throwSends,
    hitSends,
    setThrowSendResult(result: boolean): void {
      throwSendResult = result;
    },
    emitThrow(payload: ThrowPayload): void {
      for (const handler of throwHandlers) handler(payload);
    },
    emitHit(payload: HitPayload): void {
      for (const handler of hitHandlers) handler(payload);
    },
    emitRoomChange(roomId: string | null): void {
      for (const handler of roomChangeHandlers) handler(roomId);
    },
    channel: {
      async send(type: 'snowball:throw' | 'snowball:hit', payload: unknown) {
        if (type === 'snowball:throw') {
          throwSends.push(payload as ThrowPayload);
          return throwSendResult;
        }
        hitSends.push(payload as HitPayload);
        return true;
      },
      on(type: 'snowball:throw' | 'snowball:hit', handler: (payload: never) => void) {
        if (type === 'snowball:throw') {
          throwHandlers.add(handler as (payload: ThrowPayload) => void);
          return () => throwHandlers.delete(handler as (payload: ThrowPayload) => void);
        }
        hitHandlers.add(handler as (payload: HitPayload) => void);
        return () => hitHandlers.delete(handler as (payload: HitPayload) => void);
      },
      onRoomChange(handler: RoomChangeHandler) {
        roomChangeHandlers.add(handler);
        return () => roomChangeHandlers.delete(handler);
      },
    } as unknown as SnowballRoomChannel,
  };
}

/**
 * A fake channel whose `send('snowball:throw', ...)` doesn't resolve until
 * the test calls `resolve()`, so a test can trigger a second click, a Room
 * change, or `stop()` while the send is still in flight.
 */
function createDeferredChannel() {
  const roomChangeHandlers = new Set<RoomChangeHandler>();
  const throwSends: ThrowPayload[] = [];
  let resolveSend: ((ok: boolean) => void) | null = null;

  return {
    throwSends,
    emitRoomChange(roomId: string | null): void {
      for (const handler of roomChangeHandlers) handler(roomId);
    },
    resolve(ok: boolean): void {
      resolveSend?.(ok);
      resolveSend = null;
    },
    channel: {
      send(_type: 'snowball:throw', payload: unknown) {
        throwSends.push(payload as ThrowPayload);
        return new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        });
      },
      on() {
        return () => {};
      },
      onRoomChange(handler: RoomChangeHandler) {
        roomChangeHandlers.add(handler);
        return () => roomChangeHandlers.delete(handler);
      },
    } as unknown as SnowballRoomChannel,
  };
}

/** A fake `SnowballView`: fixed points per playerId/Tile, recording every call. */
function createFakeView(): {
  view: SnowballView;
  remotePoints: Map<string, ScreenPoint | null>;
  shownIds: string[];
  calls: {
    remotePoint: string[];
    drawArc: Array<{ throwId: string; from: ScreenPoint; to: ScreenPoint; durationMs: number }>;
    showSplat: Array<{ throwId: string; point: ScreenPoint }>;
    setRemoteSnowHat: Array<{ playerId: string; on: boolean }>;
    setLocalSnowHat: boolean[];
  };
} {
  const remotePoints = new Map<string, ScreenPoint | null>();
  const shownIds: string[] = [];
  const calls = {
    remotePoint: [] as string[],
    drawArc: [] as Array<{
      throwId: string;
      from: ScreenPoint;
      to: ScreenPoint;
      durationMs: number;
    }>,
    showSplat: [] as Array<{ throwId: string; point: ScreenPoint }>,
    setRemoteSnowHat: [] as Array<{ playerId: string; on: boolean }>,
    setLocalSnowHat: [] as boolean[],
  };

  const view: SnowballView = {
    localPoint(): ScreenPoint {
      return { x: 0, y: 0 };
    },
    remotePoint(playerId: string): ScreenPoint | null {
      calls.remotePoint.push(playerId);
      return remotePoints.get(playerId) ?? null;
    },
    shownRemoteIds(): readonly string[] {
      return shownIds;
    },
    tileToPoint(tile: Tile): ScreenPoint {
      return { x: tile.col * 100, y: tile.row * 100 };
    },
    drawArc(throwId, from, to, durationMs): void {
      calls.drawArc.push({ throwId, from, to, durationMs });
    },
    showSplat(throwId, point): void {
      calls.showSplat.push({ throwId, point });
    },
    setRemoteSnowHat(playerId, on): void {
      calls.setRemoteSnowHat.push({ playerId, on });
    },
    setLocalSnowHat(on): void {
      calls.setLocalSnowHat.push(on);
    },
  };

  return { view, remotePoints, shownIds, calls };
}

const LOCAL_ID = 'local-1';

function createController(
  fakeChannel: ReturnType<typeof createFakeChannel> | ReturnType<typeof createDeferredChannel>,
  fakeView: ReturnType<typeof createFakeView>,
  extra: Partial<{
    now: () => number;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    generateThrowId: () => string;
  }> = {},
): SnowballController {
  return createSnowballController({
    channel: fakeChannel.channel,
    view: fakeView.view,
    playerId: LOCAL_ID,
    ...extra,
  });
}

describe('createSnowballController: throwAt', () => {
  it('reserves ammo, sends snowball:throw with a generated throwId, and draws the arc once send resolves true', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    const before = controller.ammo();
    const result = await controller.throwAt({ col: 2, row: 3 });

    expect(result).toBe(true);
    expect(controller.ammo().count).toBe(before.count - 1);
    expect(fakeChannel.throwSends).toHaveLength(1);
    expect(fakeChannel.throwSends[0]!.target).toEqual({ col: 2, row: 3 });
    expect(fakeChannel.throwSends[0]!.throwId).toMatch(/^[A-Za-z0-9]{1,16}$/);
    expect(fakeView.calls.drawArc).toEqual([
      {
        throwId: fakeChannel.throwSends[0]!.throwId,
        from: { x: 0, y: 0 },
        to: { x: 200, y: 300 },
        durationMs: SNOWBALL_FLIGHT_MS,
      },
    ]);
  });

  it('returns false and sends nothing with 0 ammo', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      generateThrowId: () => 't1',
    });

    await controller.throwAt({ col: 0, row: 0 });
    await controller.throwAt({ col: 0, row: 0 });
    await controller.throwAt({ col: 0, row: 0 });
    expect(controller.ammo().count).toBe(0);

    const result = await controller.throwAt({ col: 0, row: 0 });

    expect(result).toBe(false);
    expect(fakeChannel.throwSends).toHaveLength(3);
  });

  it('refunds ammo and draws no arc when the send resolves false', async () => {
    const fakeChannel = createFakeChannel();
    fakeChannel.setThrowSendResult(false);
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const before = controller.ammo();

    const result = await controller.throwAt({ col: 1, row: 1 });

    expect(result).toBe(false);
    expect(controller.ammo().count).toBe(before.count);
    expect(fakeView.calls.drawArc).toHaveLength(0);
  });

  it('treats a rejected send like a false one: resolves false, refunds ammo, draws no arc', async () => {
    const base = createFakeChannel();
    const fakeChannel = {
      ...base,
      channel: {
        ...base.channel,
        send: () => Promise.reject(new Error('realtime send failed')),
      },
    };
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const before = controller.ammo();

    const result = await controller.throwAt({ col: 1, row: 1 });

    expect(result).toBe(false);
    expect(controller.ammo().count).toBe(before.count);
    expect(fakeView.calls.drawArc).toHaveLength(0);
  });

  it('A1: with 1 ammo, a second click while the first send is pending sends nothing; a false resolution refunds it', async () => {
    const deferred = createDeferredChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(deferred, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    // Drain the default capacity-3 bucket to 1 ammo with two throws, each
    // resolved immediately in turn.
    const first = controller.throwAt({ col: 0, row: 0 });
    deferred.resolve(true);
    await first;
    const second = controller.throwAt({ col: 0, row: 0 });
    deferred.resolve(true);
    await second;
    expect(controller.ammo().count).toBe(1);

    const pending = controller.throwAt({ col: 0, row: 0 });
    const secondClick = await controller.throwAt({ col: 0, row: 0 });

    expect(secondClick).toBe(false);
    expect(deferred.throwSends).toHaveLength(3); // 2 drained + 1 still pending
    expect(controller.ammo().count).toBe(0);

    deferred.resolve(false);
    const firstResult = await pending;

    expect(firstResult).toBe(false);
    expect(controller.ammo().count).toBe(1);
  });
});

describe('createSnowballController: onAmmoEmptied (#109)', () => {
  it('fires once the throw that empties a full bucket has been sent', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const emptied = vi.fn();
    controller.onAmmoEmptied(emptied);

    await controller.throwAt({ col: 0, row: 0 }); // 3 -> 2
    expect(emptied).not.toHaveBeenCalled();
    await controller.throwAt({ col: 0, row: 0 }); // 2 -> 1
    expect(emptied).not.toHaveBeenCalled();
    await controller.throwAt({ col: 0, row: 0 }); // 1 -> 0: the signal

    expect(emptied).toHaveBeenCalledTimes(1);
    expect(controller.ammo().count).toBe(0);
  });

  it('does not fire for a throw whose send is rejected and whose ammo is refunded', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const emptied = vi.fn();
    controller.onAmmoEmptied(emptied);

    await controller.throwAt({ col: 0, row: 0 }); // 3 -> 2, sent
    fakeChannel.setThrowSendResult(false);
    const result = await controller.throwAt({ col: 0, row: 0 }); // would be 2 -> 1, but rejected

    expect(result).toBe(false);
    expect(controller.ammo().count).toBe(2); // refunded, not left at 1
    expect(emptied).not.toHaveBeenCalled();
  });
});

describe('createSnowballController: hit detection (D3) and O3', () => {
  it('applies the hat to the nearest remote Player inside the landing ellipse and sends snowball:hit', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    fakeView.shownIds.push('other');
    fakeView.remotePoints.set('other', { x: 100, y: 5 }); // landing at (100, 0): inside the ellipse
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      now: clockFrom(0).now,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      generateThrowId: () => 'throw-1',
    });

    await controller.throwAt({ col: 1, row: 0 }); // tileToPoint -> (100, 0)
    timer.fireDelay(SNOWBALL_FLIGHT_MS);

    expect(fakeChannel.hitSends).toEqual([{ throwId: 'throw-1', targetId: 'other' }]);
    expect(fakeView.calls.setRemoteSnowHat).toEqual([{ playerId: 'other', on: true }]);
    expect(fakeView.calls.showSplat).toEqual([{ throwId: 'throw-1', point: { x: 100, y: 0 } }]);
    expect(controller.snowHats().get('other')).toEqual({ appliedAt: 0, until: SNOW_HAT_MS });
  });

  it('O3: with no shown remote Penguins, landing shows only a splat and sends no snowball:hit', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      generateThrowId: () => 'throw-1',
    });

    await controller.throwAt({ col: 1, row: 0 });
    timer.fireDelay(SNOWBALL_FLIGHT_MS);

    expect(fakeChannel.hitSends).toEqual([]);
    expect(fakeView.calls.showSplat).toEqual([{ throwId: 'throw-1', point: { x: 100, y: 0 } }]);
    expect(fakeView.calls.setRemoteSnowHat).toEqual([]);
    expect(controller.snowHats().size).toBe(0);
  });

  it('never queries a hit candidate outside shownRemoteIds (the local key is never a candidate, #53 v4 change 11)', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    fakeView.shownIds.push('other');
    fakeView.remotePoints.set('other', { x: 500, y: 500 }); // far outside the ellipse: no hit
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.throwAt({ col: 0, row: 0 });
    timer.fireDelay(SNOWBALL_FLIGHT_MS);

    expect(fakeView.calls.remotePoint).toEqual(['other']);
    expect(fakeView.calls.remotePoint).not.toContain(LOCAL_ID);
  });
});

describe('createSnowballController: snow hat expiry', () => {
  it('a snow hat expires SNOW_HAT_MS after it was applied', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    fakeView.shownIds.push('other');
    fakeView.remotePoints.set('other', { x: 0, y: 0 });
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      generateThrowId: () => 't1',
    });

    await controller.throwAt({ col: 0, row: 0 });
    timer.fireDelay(SNOWBALL_FLIGHT_MS);
    expect(controller.snowHats().has('other')).toBe(true);

    timer.fireDelay(SNOW_HAT_MS);

    expect(controller.snowHats().has('other')).toBe(false);
    expect(fakeView.calls.setRemoteSnowHat).toEqual([
      { playerId: 'other', on: true },
      { playerId: 'other', on: false },
    ]);
  });
});

describe('createSnowballController: receiver guards (D7)', () => {
  it('draws the arc for an incoming throw from a shown sender', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    fakeView.remotePoints.set('sender', { x: 10, y: 20 });
    const timer = createManualTimer();
    createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't1', target: { col: 1, row: 1 } });

    expect(fakeView.calls.drawArc).toEqual([
      {
        throwId: 't1',
        from: { x: 10, y: 20 },
        to: { x: 100, y: 100 },
        durationMs: SNOWBALL_FLIGHT_MS,
      },
    ]);
  });

  it('applies the local hat on a hit naming the local Player, once its throwId was remembered', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't1', target: { col: 0, row: 0 } });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't1', targetId: LOCAL_ID });

    expect(fakeView.calls.setLocalSnowHat).toEqual([true]);
  });

  it('drops a hit naming an unknown throwId', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitHit({ playerId: 'sender', throwId: 'never-thrown', targetId: LOCAL_ID });

    expect(fakeView.calls.setLocalSnowHat).toEqual([]);
  });

  it('drops a hit whose throwId was already consumed (reused, one hit per throw)', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't1', target: { col: 0, row: 0 } });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't1', targetId: LOCAL_ID });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't1', targetId: LOCAL_ID });

    expect(fakeView.calls.setLocalSnowHat).toEqual([true]);
  });

  it('drops a hit naming an unknown target (not local, not a shown remote Player)', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't1', target: { col: 0, row: 0 } });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't1', targetId: 'ghost-npc-slot' });

    expect(fakeView.calls.setLocalSnowHat).toEqual([]);
    expect(fakeView.calls.setRemoteSnowHat).toEqual([]);
  });

  it('a re-hit on the same target restarts the 10s snow hat', () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    const timer = createManualTimer();
    const clock = clockFrom(0);
    createController(fakeChannel, fakeView, {
      now: clock.now,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't1', target: { col: 0, row: 0 } });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't1', targetId: LOCAL_ID });
    clock.advance(9000);
    fakeChannel.emitThrow({ playerId: 'sender', throwId: 't2', target: { col: 0, row: 0 } });
    fakeChannel.emitHit({ playerId: 'sender', throwId: 't2', targetId: LOCAL_ID });

    // Only one hat-expiry timer remains: the restarted one, 10s out from t=9000.
    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0]!.delay).toBe(SNOW_HAT_MS);

    timer.fireDelay(SNOW_HAT_MS);

    expect(fakeView.calls.setLocalSnowHat).toEqual([true, true, false]);
  });
});

describe('createSnowballController: lifecycle (L1)', () => {
  it('a Room change during the 600ms flight sends no hit, applies no hat, and makes no further view calls', async () => {
    const deferred = createDeferredChannel();
    const fakeView = createFakeView();
    fakeView.shownIds.push('other');
    fakeView.remotePoints.set('other', { x: 0, y: 0 });
    const timer = createManualTimer();
    const controller = createController(deferred, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    const pending = controller.throwAt({ col: 0, row: 0 });
    deferred.resolve(true);
    await pending;
    expect(fakeView.calls.drawArc).toHaveLength(1);
    const callsBefore = JSON.parse(JSON.stringify(fakeView.calls)) as typeof fakeView.calls;

    deferred.emitRoomChange('other-room');
    timer.fireDelay(SNOWBALL_FLIGHT_MS);

    expect(fakeView.calls).toEqual(callsBefore);
    expect(deferred.throwSends).toHaveLength(1);
  });

  it('stop() clears all timers and further throws resolve false', async () => {
    const fakeChannel = createFakeChannel();
    const fakeView = createFakeView();
    fakeView.shownIds.push('other');
    fakeView.remotePoints.set('other', { x: 0, y: 0 });
    const timer = createManualTimer();
    const controller = createController(fakeChannel, fakeView, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.throwAt({ col: 0, row: 0 });
    expect(timer.scheduled.length).toBeGreaterThan(0);

    controller.stop();

    expect(timer.scheduled).toEqual([]);
    const result = await controller.throwAt({ col: 0, row: 0 });
    expect(result).toBe(false);
    expect(controller.snowHats().size).toBe(0);
  });
});
