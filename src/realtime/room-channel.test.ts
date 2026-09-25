import { describe, expect, it, vi } from 'vitest';
import {
  createEmitter,
  DEFAULT_LOOK,
  PENGUIN_NAME_MAX,
  type Facing,
  type GameEventMap,
  type PenguinLook,
  type PresencePayload,
  type RoomBroadcastEvent,
  type TypedEmitter,
} from '../contracts';
import {
  createRoomChannel,
  parsePresencePayload,
  type RealtimeClientLike,
  type RemotePenguinView,
  type RoomChannelLike,
  type RoomChannelStatus,
  type SendablePayload,
} from './room-channel';

/** Flushes the microtask queue enough for the room channel's internal promise chains to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A manually-driven fake timer, so backoff tests are deterministic without
 * depending on real wall-clock time or vitest's fake-timer/microtask
 * interplay.
 */
function createManualTimer(): {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  scheduled: Array<{ id: number; delay: number }>;
  fireNext: () => void;
  fireDelay: (delay: number) => void;
} {
  let nextId = 1;
  const scheduled: Array<{ id: number; delay: number; cb: () => void }> = [];

  const fakeSetTimeout = ((cb: () => void, delay?: number) => {
    const id = nextId++;
    scheduled.push({ id, delay: delay ?? 0, cb });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  const fakeClearTimeout = ((id: unknown) => {
    const index = scheduled.findIndex((entry) => entry.id === id);
    if (index !== -1) scheduled.splice(index, 1);
  }) as typeof clearTimeout;

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    scheduled,
    fireNext(): void {
      const next = scheduled.shift();
      next?.cb();
    },
    fireDelay(delay: number): void {
      const index = scheduled.findIndex((entry) => entry.delay === delay);
      if (index === -1) throw new Error(`no timer scheduled with delay ${delay}`);
      const [entry] = scheduled.splice(index, 1);
      entry.cb();
    },
  };
}

/**
 * Mimics real `@supabase/realtime-js` channels closely enough to exercise
 * double registration: `onPresenceSync` / `onBroadcast` / `subscribe` each
 * *add* a listener rather than replacing one, and multiple registrations on
 * the same instance all fire.
 */
class FakeRoomChannel implements RoomChannelLike {
  trackCalls: PresencePayload[] = [];
  sendCalls: Array<{ event: RoomBroadcastEvent; payload: unknown }> = [];
  teardownCalls = 0;
  sendResult: 'ok' | 'timed out' | 'error' = 'ok';
  trackResult: 'ok' | 'timed out' | 'error' = 'ok';
  untrackResult: Promise<unknown> | null = null;
  /** Overrides the resolved `send` push status, e.g. with a never-settling promise. */
  sendImpl: (() => Promise<string>) | null = null;

  private readonly statusCbs: Array<(status: RoomChannelStatus) => void> = [];
  private readonly syncCbs: Array<() => void> = [];
  private readonly broadcastCbs = new Map<string, Array<(payload: unknown) => void>>();
  private state: Record<string, Array<Record<string, unknown>>> = {};

  constructor(
    public readonly name: string,
    public readonly presenceKey: string,
    private readonly log: string[],
  ) {}

  subscribe(cb: (status: RoomChannelStatus) => void): unknown {
    this.log.push(`subscribe:${this.name}`);
    this.statusCbs.push(cb);
    return undefined;
  }

  track(payload: PresencePayload): Promise<string> {
    this.log.push(`track:${this.name}`);
    this.trackCalls.push(payload);
    return Promise.resolve(this.trackResult);
  }

  untrack(): Promise<unknown> {
    this.log.push(`untrack:${this.name}`);
    return this.untrackResult ?? Promise.resolve();
  }

  presenceState(): Record<string, Array<Record<string, unknown>>> {
    return this.state;
  }

  onPresenceSync(cb: () => void): void {
    this.syncCbs.push(cb);
  }

  onBroadcast(event: RoomBroadcastEvent, cb: (payload: unknown) => void): void {
    const cbs = this.broadcastCbs.get(event) ?? [];
    cbs.push(cb);
    this.broadcastCbs.set(event, cbs);
  }

  send(event: RoomBroadcastEvent, payload: unknown): Promise<string> {
    this.log.push(`send:${this.name}`);
    this.sendCalls.push({ event, payload });
    if (this.sendImpl) return this.sendImpl();
    return Promise.resolve(this.sendResult);
  }

  teardown(): void {
    this.teardownCalls += 1;
  }

  emitStatus(status: RoomChannelStatus): void {
    for (const cb of this.statusCbs) cb(status);
  }

  setPresenceState(state: Record<string, Array<Record<string, unknown>>>): void {
    this.state = state;
    for (const cb of this.syncCbs) cb();
  }

  emitBroadcast(event: string, payload: unknown): void {
    for (const cb of this.broadcastCbs.get(event) ?? []) cb(payload);
  }
}

/** A never-settling promise, for proving a step does not block on it. */
function hang(): Promise<unknown> {
  return new Promise(() => {
    /* never resolves */
  });
}

/**
 * Fakes the `RealtimeClientLike` adapter contract (`supabase-realtime.ts`):
 * every `channel()` call hands back a fresh, joinable instance. The
 * realtime-js registry quirks behind that guarantee are faked and tested in
 * `supabase-realtime.test.ts`.
 */
class FakeClient implements RealtimeClientLike {
  log: string[] = [];
  channels: FakeRoomChannel[] = [];
  /** Shifted per `removeChannel` call; defaults to `'ok'` once exhausted. */
  removeChannelResults: Array<'ok' | 'timed out' | 'error'> = [];
  removeChannelImpl: ((ch: RoomChannelLike) => Promise<string>) | null = null;

  channel(name: string, opts: { presenceKey: string }): Promise<FakeRoomChannel> {
    this.log.push(`channel:${name}`);
    const ch = new FakeRoomChannel(name, opts.presenceKey, this.log);
    this.channels.push(ch);
    return Promise.resolve(ch);
  }

  removeChannel(ch: RoomChannelLike): Promise<string> {
    const fake = ch as FakeRoomChannel;
    this.log.push(`removeChannel:${fake.name}`);
    if (this.removeChannelImpl) return this.removeChannelImpl(ch);
    return Promise.resolve(this.removeChannelResults.shift() ?? 'ok');
  }
}

class FakeView implements RemotePenguinView {
  upsertCalls: PresencePayload[] = [];
  removeCalls: string[] = [];
  clearCalls = 0;

  upsert(p: PresencePayload): void {
    this.upsertCalls.push(p);
  }

  remove(playerId: string): void {
    this.removeCalls.push(playerId);
  }

  clear(): void {
    this.clearCalls += 1;
  }
}

/** `DEFAULT_LOOK` has an empty `name` (before the Creator is completed); most tests use a non-empty name so name handling stays visible. */
const NAMED_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: 'Buddy' };

function meta(
  playerId: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    playerId,
    look: NAMED_LOOK,
    tile: { col: 0, row: 0 },
    facing: 'left' satisfies Facing,
    ...overrides,
  };
}

function setup(): { client: FakeClient; events: TypedEmitter<GameEventMap>; view: FakeView } {
  const client = new FakeClient();
  const events = createEmitter<GameEventMap>();
  const view = new FakeView();
  return { client, events, view };
}

function createChannel(
  client: FakeClient,
  events: TypedEmitter<GameEventMap>,
  view: FakeView,
  playerId = 'me',
  look: PenguinLook = DEFAULT_LOOK,
  extra: Partial<{
    now: () => number;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    onError: (context: string, err: unknown) => void;
  }> = {},
) {
  return createRoomChannel({
    client,
    events,
    playerId,
    look,
    view,
    ...extra,
  });
}

/** Establishes presence for `otherId` so it is in `shownIds` (broadcasts are gated on it). */
function showOther(ch: FakeRoomChannel, otherId: string): void {
  ch.setPresenceState({ [otherId]: [meta(otherId)] });
}

describe('createRoomChannel', () => {
  it('runs leave (removeChannel) before the next enter creates its channel', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.log.length = 0;

    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 2, row: 2 } });
    await flush();

    expect(client.log).toEqual([
      'removeChannel:room:town-center',
      'channel:room:dev-pit',
      'subscribe:room:dev-pit',
    ]);
  });

  it('keeps removeChannel before the next channel() even when leave and enter fire back to back synchronously', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.log.length = 0;

    events.emit('room:leave', { roomId: 'town-center' });
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 2, row: 2 } });
    await flush();

    expect(client.log).toEqual([
      'removeChannel:room:town-center',
      'channel:room:dev-pit',
      'subscribe:room:dev-pit',
    ]);
  });

  it('uses the igloo key for the igloo room', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'igloo', entryTile: { col: 0, row: 0 } });
    await flush();

    expect(client.log).toContain('channel:room:igloo:me');
  });

  it('takes the last meta when a key has two presence entries (duplicate tab replaces the first)', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const ch = client.channels[0];
    const first = meta('other', { tile: { col: 1, row: 1 } });
    const last = meta('other', { tile: { col: 5, row: 5 } });
    ch.setPresenceState({ other: [first, last] });
    await flush();

    expect(view.upsertCalls).toEqual([last]);
  });

  it('never upserts the local player itself', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const ch = client.channels[0];
    ch.setPresenceState({ me: [meta('me')], other: [meta('other')] });
    await flush();

    expect(view.upsertCalls).toEqual([meta('other')]);
    expect(view.upsertCalls.some((p) => p.playerId === 'me')).toBe(false);
  });

  it('removes a previously shown Penguin whose key has left presence state', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const ch = client.channels[0];
    ch.setPresenceState({ other: [meta('other')] });
    await flush();
    expect(view.removeCalls).toEqual([]);

    ch.setPresenceState({});
    await flush();
    expect(view.removeCalls).toEqual(['other']);
  });

  it('drops an invalid payload (bad color, unknown enum, non-integer tile, or key/playerId mismatch)', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const ch = client.channels[0];
    ch.setPresenceState({
      badColor: [meta('badColor', { look: { ...DEFAULT_LOOK, body: 'not-a-hex' } })],
      badEnum: [meta('badEnum', { look: { ...DEFAULT_LOOK, hat: 'TOP HAT' } })],
      badTile: [meta('badTile', { tile: { col: 1.5, row: 0 } })],
      mismatched: [meta('someoneElse')],
    });
    await flush();

    expect(view.upsertCalls).toEqual([]);
  });

  it('ignores extra keys on an otherwise valid meta, such as supabase presence_ref', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const ch = client.channels[0];
    const withExtra = meta('other', { presence_ref: 'abc123' });
    ch.setPresenceState({ other: [withExtra] });
    await flush();

    expect(view.upsertCalls).toEqual([meta('other')]);
  });

  it('re-tracks on a second SUBSCRIBED (reconnect) and when the local look changes', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];

    expect(ch.trackCalls).toHaveLength(0);

    ch.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch.trackCalls).toHaveLength(1);

    ch.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch.trackCalls).toHaveLength(2);

    const newLook: PenguinLook = { ...DEFAULT_LOOK, name: 'Ada' };
    rc.setLook(newLook);
    await flush();
    expect(ch.trackCalls).toHaveLength(3);
    expect(ch.trackCalls[2].look).toEqual(newLook);
  });

  it('send is a no-op returning false when no channel is joined', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    const result = await rc.send('chat', { text: 'hi' });

    expect(result).toBe(false);
    expect(client.channels).toHaveLength(0);
  });

  it('send is a no-op returning false when the channel is not yet SUBSCRIBED', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const result = await rc.send('move', { target: { col: 1, row: 1 } });

    expect(result).toBe(false);
    expect(busSends(client.channels[0])).toEqual([]);
  });

  it('send stamps playerId, resolves true and forwards the event once a channel is joined', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].emitStatus('SUBSCRIBED');
    await flush();

    const result = await rc.send('move', { target: { col: 1, row: 1 } });

    expect(result).toBe(true);
    expect(busSends(client.channels[0])).toEqual([
      { event: 'move', payload: { playerId: 'me', target: { col: 1, row: 1 } } },
    ]);
  });

  it('send stamps sentAt from the injectable now(), and normalizes chat text', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      now: () => 12345,
    });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].emitStatus('SUBSCRIBED');
    await flush();

    const result = await rc.send('chat', { text: '  hi there  ' });

    expect(result).toBe(true);
    expect(busSends(client.channels[0])).toEqual([
      { event: 'chat', payload: { playerId: 'me', text: 'hi there', sentAt: 12345 } },
    ]);
  });

  it('send returns false and does not push an invalid outgoing event (out-of-range tile)', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].emitStatus('SUBSCRIBED');
    await flush();

    const result = await rc.send('move', { target: { col: 256, row: 0 } });

    expect(result).toBe(false);
    expect(busSends(client.channels[0])).toEqual([]);
  });

  it('send returns false when the underlying push status is not ok', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    ch.emitStatus('SUBSCRIBED');
    await flush();
    ch.sendResult = 'timed out';

    const result = await rc.send('move', { target: { col: 1, row: 1 } });

    expect(result).toBe(false);
  });

  it('dispatches valid broadcast events only from ids currently shown in Presence, dropping invalid and own-origin events', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    showOther(ch, 'other');
    await flush();

    const moveCalls: unknown[] = [];
    rc.on('move', (event) => moveCalls.push(event));

    ch.emitBroadcast('move', { playerId: 'other', target: { col: 3, row: 4 } });
    ch.emitBroadcast('move', { playerId: 'me', target: { col: 9, row: 9 } });
    ch.emitBroadcast('move', { playerId: 'other', target: { col: 'x', row: 4 } });
    ch.emitBroadcast('chat', { playerId: 'other', text: 'hi', sentAt: 1 });
    ch.emitBroadcast('move', { playerId: 'not-shown', target: { col: 1, row: 1 } });

    expect(moveCalls).toEqual([{ playerId: 'other', target: { col: 3, row: 4 } }]);
  });

  it('stops delivering to a bus handler after its unsubscribe runs', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    showOther(ch, 'other');
    await flush();

    const calls: unknown[] = [];
    const unsubscribe = rc.on('chat', (event) => calls.push(event));
    unsubscribe();

    ch.emitBroadcast('chat', { playerId: 'other', text: 'hi', sentAt: 1 });

    expect(calls).toEqual([]);
  });

  it('reports the current room and clears it on leave', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    expect(rc.currentRoom()).toBeNull();

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    expect(rc.currentRoom()).toBe('town-center');

    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    expect(rc.currentRoom()).toBeNull();
    expect(view.clearCalls).toBeGreaterThan(0);
  });

  it('onRoomChange fires the Room id after enter and null after leave, until unsubscribed', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);
    const calls: Array<string | null> = [];
    const unsubscribe = rc.onRoomChange((roomId) => calls.push(roomId));

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    events.emit('room:leave', { roomId: 'town-center' });
    await flush();

    expect(calls).toEqual(['town-center', null]);

    unsubscribe();
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
    await flush();
    expect(calls).toEqual(['town-center', null]);
  });

  it('stop() leaves the current room and unsubscribes from further room:enter events', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    await rc.stop();
    expect(client.log).toContain('removeChannel:room:town-center');

    client.log.length = 0;
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await flush();

    expect(client.log).toEqual([]);
  });

  it('stop() unsubscribes from room:enter before queueing the final leave, so an enter fired during stop does not join', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const stopPromise = rc.stop();
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await stopPromise;
    await flush();

    expect(client.channels.some((c) => c.name === 'room:dev-pit')).toBe(false);
  });

  it('an enter while a channel exists leaves it first', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.log.length = 0;

    // A second enter without an intervening leave (defensive case).
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await flush();

    expect(client.log).toEqual([
      'removeChannel:room:town-center',
      'channel:room:dev-pit',
      'subscribe:room:dev-pit',
    ]);
  });

  it('clears the view and resets state before removeChannel settles, and reports a throwing removeChannel via onError without wedging the queue', async () => {
    const { client, events, view } = setup();
    const onError = vi.fn();
    const rc = createChannel(client, events, view, 'me', DEFAULT_LOOK, { onError });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    let rejectRemove: (err: Error) => void = () => {};
    client.removeChannelImpl = () =>
      new Promise((_resolve, reject) => {
        rejectRemove = reject;
      });
    events.emit('room:leave', { roomId: 'town-center' });
    await flush();

    // The reset ran even though removeChannel is still pending (unresolved).
    expect(view.clearCalls).toBeGreaterThan(0);
    expect(rc.currentRoom()).toBeNull();

    const boom = new Error('boom');
    rejectRemove(boom);
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.any(String), boom);
    client.removeChannelImpl = null;

    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await flush();

    expect(client.channels.some((c) => c.name === 'room:dev-pit')).toBe(true);
  });

  it('a hanging untrack() does not block the next channel() call', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].untrackResult = hang();

    events.emit('room:leave', { roomId: 'town-center' });
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await flush();

    expect(client.channels.some((c) => c.name === 'room:dev-pit')).toBe(true);
    // untrack must never be called from the leave path at all.
    expect(client.log.some((entry) => entry.startsWith('untrack:'))).toBe(false);
  });

  it('a removeChannel that resolves a non-ok status tears the channel down, and the next join gets fresh, single-firing handlers that track on SUBSCRIBED', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch1 = client.channels[0];
    ch1.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch1.trackCalls).toHaveLength(1);

    client.removeChannelResults = ['timed out'];
    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    expect(ch1.teardownCalls).toBe(1);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch2 = client.channels[client.channels.length - 1];
    expect(ch2).not.toBe(ch1);

    ch2.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch2.trackCalls).toHaveLength(1);

    // The old (torn-down) channel's still-registered callback must be
    // inert: it should not cause another track on the new channel or any
    // effect at all.
    ch1.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch2.trackCalls).toHaveLength(1);
  });

  it('schedules a queued rejoin with 1s/2s/4s backoff capped at 10s on an unexpected CLOSED/CHANNEL_ERROR/TIMED_OUT, and resets once tracked', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch1 = client.channels[0];
    ch1.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch1.trackCalls).toHaveLength(1);

    ch1.emitStatus('CHANNEL_ERROR');
    await flush();
    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0].delay).toBe(1000);

    timer.fireNext();
    await flush();
    expect(client.log).toContain('removeChannel:room:town-center');
    const ch2 = client.channels[client.channels.length - 1];
    expect(ch2).not.toBe(ch1);

    ch2.emitStatus('TIMED_OUT');
    await flush();
    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0].delay).toBe(2000);

    timer.fireNext();
    await flush();
    const ch3 = client.channels[client.channels.length - 1];

    ch3.emitStatus('CLOSED');
    await flush();
    expect(timer.scheduled[0].delay).toBe(4000);

    timer.fireNext();
    await flush();
    const ch4 = client.channels[client.channels.length - 1];

    ch4.emitStatus('CHANNEL_ERROR');
    await flush();
    expect(timer.scheduled[0].delay).toBe(10000);

    timer.fireNext();
    await flush();
    const ch5 = client.channels[client.channels.length - 1];
    ch5.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch5.trackCalls).toHaveLength(1);
    expect(timer.scheduled).toHaveLength(0);

    // Backoff is reset: the next failure schedules 1s again.
    ch5.emitStatus('CHANNEL_ERROR');
    await flush();
    expect(timer.scheduled[0].delay).toBe(1000);
  });

  it('caps rendered remote Penguins at 50, preferring ids already shown, then key order', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];

    const firstBatch: Record<string, Array<Record<string, unknown>>> = {};
    for (let i = 0; i < 40; i++) {
      firstBatch[`p${i}`] = [meta(`p${i}`)];
    }
    ch.setPresenceState(firstBatch);
    await flush();
    expect(view.upsertCalls).toHaveLength(40);

    view.upsertCalls = [];
    const secondBatch: Record<string, Array<Record<string, unknown>>> = { ...firstBatch };
    for (let i = 40; i < 60; i++) {
      secondBatch[`p${i}`] = [meta(`p${i}`)];
    }
    ch.setPresenceState(secondBatch);
    await flush();

    expect(view.upsertCalls).toHaveLength(50);
    const shownNow = new Set(view.upsertCalls.map((p) => p.playerId));
    // All 40 previously-shown ids are preferred and kept.
    for (let i = 0; i < 40; i++) {
      expect(shownNow.has(`p${i}`)).toBe(true);
    }
    // Only the first 10 new ids (by key order) fill the remaining 10 slots.
    for (let i = 40; i < 50; i++) {
      expect(shownNow.has(`p${i}`)).toBe(true);
    }
    for (let i = 50; i < 60; i++) {
      expect(shownNow.has(`p${i}`)).toBe(false);
    }
  });

  it('in the igloo, joins and tracks but renders no remote Penguins and dispatches no broadcasts', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');
    const moveCalls: unknown[] = [];
    rc.on('move', (event) => moveCalls.push(event));

    events.emit('room:enter', { roomId: 'igloo', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    ch.emitStatus('SUBSCRIBED');
    await flush();

    expect(ch.trackCalls).toHaveLength(1);

    ch.setPresenceState({ other: [meta('other')] });
    await flush();
    expect(view.upsertCalls).toEqual([]);

    ch.emitBroadcast('move', { playerId: 'other', target: { col: 1, row: 1 } });
    expect(moveCalls).toEqual([]);
  });

  it('a reconnect rebuilds the same Room channel without clearing the view or firing onRoomChange', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    const rc = createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const roomChanges: Array<string | null> = [];
    rc.onRoomChange((roomId) => roomChanges.push(roomId));

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 4, row: 6 } });
    await flush();
    const ch1 = client.channels[0];
    ch1.emitStatus('SUBSCRIBED');
    showOther(ch1, 'other');
    await flush();
    const clearsBefore = view.clearCalls;

    ch1.emitStatus('CLOSED');
    timer.fireNext();
    await flush();

    const ch2 = client.channels[1];
    expect(ch2.name).toBe('room:town-center');
    expect(view.clearCalls).toBe(clearsBefore);
    expect(view.removeCalls).toEqual([]);
    expect(roomChanges).toEqual(['town-center']);
    expect(rc.currentRoom()).toBe('town-center');

    // The rebuilt channel re-tracks at the same tile.
    ch2.emitStatus('SUBSCRIBED');
    await flush();
    expect(ch2.trackCalls.map((p) => p.tile)).toEqual([{ col: 4, row: 6 }]);

    // Remote Penguins shown before the reconnect still receive broadcasts...
    const moves: unknown[] = [];
    rc.on('move', (payload) => moves.push(payload));
    ch2.emitBroadcast('move', { playerId: 'other', target: { col: 1, row: 2 } });
    expect(moves).toEqual([{ playerId: 'other', target: { col: 1, row: 2 } }]);

    // ...until the next sync reconciles them away.
    ch2.setPresenceState({});
    expect(view.removeCalls).toEqual(['other']);
  });

  it('a track() that does not resolve ok schedules a backoff rebuild of the same Room channel', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    const rc = createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const roomChanges: Array<string | null> = [];
    rc.onRoomChange((roomId) => roomChanges.push(roomId));

    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch1 = client.channels[0];
    ch1.trackResult = 'timed out';
    ch1.emitStatus('SUBSCRIBED');
    await flush();

    expect(timer.scheduled.map((t) => t.delay)).toEqual([1000]);

    timer.fireNext();
    await flush();
    expect(client.log).toContain('removeChannel:room:dev-pit');
    expect(client.channels).toHaveLength(2);
    expect(client.channels[1].name).toBe('room:dev-pit');
    expect(roomChanges).toEqual(['dev-pit']);
  });

  it('a track() that rejects is reported via onError and also schedules a rebuild', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    const onError = vi.fn();
    createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      onError,
    });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    const failure = new Error('socket gone');
    ch.track = () => Promise.reject(failure);
    ch.emitStatus('SUBSCRIBED');
    await flush();

    expect(onError).toHaveBeenCalledWith(expect.any(String), failure);
    expect(timer.scheduled).toHaveLength(1);
  });

  it('reports a throwing view via onError and keeps syncing', async () => {
    const { client, events, view } = setup();
    const onError = vi.fn();
    createChannel(client, events, view, 'me', DEFAULT_LOOK, { onError });
    const failure = new Error('render failed');
    view.upsert = () => {
      throw failure;
    };

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    showOther(client.channels[0], 'other');

    expect(onError).toHaveBeenCalledWith(expect.any(String), failure);
  });

  it('isSubscribed and onSubscribedChange follow the channel status, and go false on leave', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    const rc = createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const changes: boolean[] = [];
    rc.onSubscribedChange((subscribed) => changes.push(subscribed));

    expect(rc.isSubscribed()).toBe(false);
    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    expect(rc.isSubscribed()).toBe(false);

    client.channels[0].emitStatus('SUBSCRIBED');
    expect(rc.isSubscribed()).toBe(true);

    client.channels[0].emitStatus('CHANNEL_ERROR');
    expect(rc.isSubscribed()).toBe(false);
    timer.fireNext();
    await flush();
    client.channels[1].emitStatus('SUBSCRIBED');
    expect(rc.isSubscribed()).toBe(true);

    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    expect(rc.isSubscribed()).toBe(false);
    expect(changes).toEqual([true, false, true, false]);
  });
});

describe('parsePresencePayload', () => {
  it('accepts a valid meta and ignores extra keys', () => {
    const result = parsePresencePayload(meta('other', { presence_ref: 'abc' }));
    expect(result).toEqual(meta('other'));
  });

  it('rejects a meta with a non-hex color', () => {
    const result = parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, body: 'red' } }));
    expect(result).toBeNull();
  });

  it('rejects a meta with an out-of-enum hat', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_LOOK, hat: 'FEDORA' } }),
    );
    expect(result).toBeNull();
  });

  it('rejects a meta with a non-integer tile', () => {
    const result = parsePresencePayload(meta('other', { tile: { col: 1.2, row: 0 } }));
    expect(result).toBeNull();
  });

  it('rejects a meta with a tile out of the 0..255 range', () => {
    const result = parsePresencePayload(meta('other', { tile: { col: 256, row: 0 } }));
    expect(result).toBeNull();
  });

  it('rejects a meta whose playerId is over 64 characters', () => {
    const result = parsePresencePayload(meta('x'.repeat(65)));
    expect(result).toBeNull();
  });

  it(`keeps a name of exactly PENGUIN_NAME_MAX (${PENGUIN_NAME_MAX}) characters`, () => {
    const name = 'x'.repeat(16);
    const result = parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, name } }));
    expect(result?.look.name).toBe(name);
  });

  it('falls back to an empty name rather than dropping the Penguin, when the name is over PENGUIN_NAME_MAX', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_LOOK, name: 'x'.repeat(17) } }),
    );
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('');
  });

  it('keeps an empty name (the Creator has not been completed yet)', () => {
    const result = parsePresencePayload(meta('other', { look: DEFAULT_LOOK }));
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('');
  });

  it('measures the length after trimming, so a padded 16-character name is kept', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_LOOK, name: `  ${'y'.repeat(16)}  ` } }),
    );
    expect(result?.look.name).toBe('y'.repeat(16));
  });

  it('yields an empty name when only control/bidi/zero-width characters remain', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_LOOK, name: '\u200B\u200B\u202A' } }),
    );
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('');
  });

  it('strips control/bidi/zero-width characters from an otherwise valid name', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_LOOK, name: 'A\u200Bd\u202Aa' } }),
    );
    expect(result?.look.name).toBe('Ada');
  });

  it('counts code points rather than UTF-16 units, so 9 penguin emoji survive (review round 1)', () => {
    const name = '\uD83D\uDC27'.repeat(9);
    const result = parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, name } }));
    expect(result?.look.name).toBe(name);
  });

  it('rejects a facing that is not left or right', () => {
    expect(parsePresencePayload(meta('other', { facing: 's' }))).toBeNull();
    expect(parsePresencePayload(meta('other', { facing: 'right' }))).not.toBeNull();
  });

  it('rejects an out-of-enum emote, and accepts every idle emote from the contract', () => {
    expect(
      parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, emote: 'SNOWBALL' } })),
    ).toBeNull();
    expect(
      parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, emote: 'SIT' } })),
    ).not.toBeNull();
  });

  it("accepts the design's lowercase hex swatch", () => {
    expect(
      parsePresencePayload(meta('other', { look: { ...DEFAULT_LOOK, body: '#3a4046' } })),
    ).not.toBeNull();
  });

  it('builds a fresh look object, dropping unknown keys the payload look carried', () => {
    const result = parsePresencePayload(
      meta('other', {
        look: { ...DEFAULT_LOOK, name: 'Ada', evil: 'proto-pollution' },
      }),
    );
    expect(result?.look).toEqual({ ...DEFAULT_LOOK, name: 'Ada' });
    expect(result?.look).not.toHaveProperty('evil');
  });

  it('rejects a non-object', () => {
    expect(parsePresencePayload(null)).toBeNull();
    expect(parsePresencePayload('nope')).toBeNull();
  });
});

describe('SendablePayload typing', () => {
  it('accepts a move without playerId and a chat without playerId/sentAt (compile-time check)', () => {
    const move: SendablePayload<'move'> = { target: { col: 0, row: 0 } };
    const chat: SendablePayload<'chat'> = { text: 'hi' };
    // @ts-expect-error the channel stamps playerId itself
    const spoofed: SendablePayload<'move'> = { playerId: 'x', target: { col: 0, row: 0 } };
    expect(move.target).toEqual({ col: 0, row: 0 });
    expect(chat.text).toBe('hi');
    expect(spoofed).toBeDefined();
  });
});

/** Enters Town Center and marks its channel SUBSCRIBED (tracked 'ok'). */
async function joinTownCenter(
  client: FakeClient,
  events: TypedEmitter<GameEventMap>,
): Promise<FakeRoomChannel> {
  events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
  await flush();
  const ch = client.channels[client.channels.length - 1];
  ch.emitStatus('SUBSCRIBED');
  await flush();
  return ch;
}

/** Sends on the public Room bus, leaving out the channel's own hello/bye. */
function busSends(ch: FakeRoomChannel): FakeRoomChannel['sendCalls'] {
  return ch.sendCalls.filter((c) => !c.event.startsWith('presence:'));
}

function sendsOf(ch: FakeRoomChannel, event: RoomBroadcastEvent): unknown[] {
  return ch.sendCalls.filter((c) => c.event === event).map((c) => c.payload);
}

describe('presence hello/bye fast path', () => {
  it('shows a remote Penguin from a hello before any Presence sync, and dispatches its moves', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    const moves: unknown[] = [];
    rc.on('move', (m) => moves.push(m));

    ch.emitBroadcast('presence:hello', meta('other', { tile: { col: 3, row: 2 } }));
    ch.emitBroadcast('move', { playerId: 'other', target: { col: 5, row: 5 } });

    expect(view.upsertCalls).toEqual([
      { playerId: 'other', look: NAMED_LOOK, tile: { col: 3, row: 2 }, facing: 'left' },
    ]);
    expect(moves).toEqual([{ playerId: 'other', target: { col: 5, row: 5 } }]);
  });

  it('sends a hello with the full payload after every acknowledged track, and none after an unacknowledged one', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me', NAMED_LOOK);
    const ch = await joinTownCenter(client, events);

    expect(sendsOf(ch, 'presence:hello')).toEqual([
      { playerId: 'me', look: NAMED_LOOK, tile: { col: 0, row: 0 }, facing: 'right' },
    ]);

    const ada: PenguinLook = { ...NAMED_LOOK, name: 'Ada' };
    rc.setLook(ada);
    await flush();
    rc.setTile({ col: 7, row: 8 }, 'left');
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toEqual([
      { playerId: 'me', look: NAMED_LOOK, tile: { col: 0, row: 0 }, facing: 'right' },
      { playerId: 'me', look: ada, tile: { col: 0, row: 0 }, facing: 'right' },
      { playerId: 'me', look: ada, tile: { col: 7, row: 8 }, facing: 'left' },
    ]);

    ch.trackResult = 'timed out';
    rc.setTile({ col: 1, row: 1 });
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(3);
  });

  it('sends no hello in the igloo, and ignores hellos there', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    events.emit('room:enter', { roomId: 'igloo', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];
    ch.emitStatus('SUBSCRIBED');
    await flush();

    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();

    expect(ch.trackCalls).toHaveLength(1);
    expect(ch.sendCalls).toEqual([]);
    expect(view.upsertCalls).toEqual([]);
  });

  it('replies once with its own hello to a hello from a Penguin not shown yet', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me', NAMED_LOOK);
    const ch = await joinTownCenter(client, events);
    const ownHello = {
      playerId: 'me',
      look: NAMED_LOOK,
      tile: { col: 0, row: 0 },
      facing: 'right',
    };

    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toEqual([ownHello, ownHello]);

    // Already shown: no second reply.
    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(2);

    // Shown via Presence first: no reply either.
    ch.setPresenceState({ synced: [meta('synced')] });
    ch.emitBroadcast('presence:hello', meta('synced'));
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(2);
  });

  it('drops an invalid hello and never shows its own playerId', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);

    ch.emitBroadcast('presence:hello', meta('other', { tile: { col: 1.5, row: 0 } }));
    ch.emitBroadcast('presence:hello', meta('me'));
    ch.emitBroadcast('presence:hello', { playerId: 'other' });
    await flush();

    expect(view.upsertCalls).toEqual([]);
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(1);
  });

  it('respects the 50 remote Penguin cap for a hello, and does not reply to one it cannot show', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    const state: Record<string, Array<Record<string, unknown>>> = {};
    for (let i = 0; i < 50; i++) state[`p${i}`] = [meta(`p${i}`)];
    ch.setPresenceState(state);
    const upserts = view.upsertCalls.length;

    ch.emitBroadcast('presence:hello', meta('p50'));
    await flush();

    expect(view.upsertCalls).toHaveLength(upserts);
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(1);
  });

  it('rate-limits hello replies to one per sender per 2 s, using the injectable clock', async () => {
    const { client, events, view } = setup();
    let t = 10_000;
    createChannel(client, events, view, 'me', NAMED_LOOK, { now: () => t });
    const ch = await joinTownCenter(client, events);

    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(2);

    ch.emitBroadcast('presence:bye', { playerId: 'other' });
    t += 1999;
    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();
    expect(view.upsertCalls.filter((p) => p.playerId === 'other')).toHaveLength(2);
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(2);

    ch.emitBroadcast('presence:bye', { playerId: 'other' });
    t += 1;
    ch.emitBroadcast('presence:hello', meta('other'));
    await flush();
    expect(sendsOf(ch, 'presence:hello')).toHaveLength(3);
  });

  it('keeps a hinted Penguin missing from sync for a 5 s grace after its last hello, then lets sync win', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    let t = 0;
    createChannel(client, events, view, 'me', NAMED_LOOK, {
      now: () => t,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const ch = await joinTownCenter(client, events);

    ch.emitBroadcast('presence:hello', meta('other'));
    t = 1000;
    ch.setPresenceState({});
    expect(view.removeCalls).toEqual([]);

    // A newer hello restarts the grace.
    t = 3000;
    ch.emitBroadcast('presence:hello', meta('other'));
    t = 7999;
    ch.setPresenceState({});
    expect(view.removeCalls).toEqual([]);

    // Grace expiry needs no further sync to remove the Penguin.
    t = 8000;
    expect(timer.scheduled).toHaveLength(1);
    timer.fireNext();
    expect(view.removeCalls).toEqual(['other']);
    expect(timer.scheduled).toEqual([]);
  });

  it('prefers the hinted look over a lagging sync during the grace', async () => {
    const { client, events, view } = setup();
    let t = 0;
    createChannel(client, events, view, 'me', NAMED_LOOK, { now: () => t });
    const ch = await joinTownCenter(client, events);
    const ada: PenguinLook = { ...NAMED_LOOK, name: 'Ada' };
    ch.setPresenceState({ other: [meta('other')] });

    ch.emitBroadcast('presence:hello', meta('other', { look: ada }));
    t = 100;
    ch.setPresenceState({ other: [meta('other')] });

    expect(view.upsertCalls[view.upsertCalls.length - 1].look).toEqual(ada);
  });

  it('a bye removes the Penguin, and a lagging sync with the same presence_ref does not re-add it until it drops out', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    const moves: unknown[] = [];
    rc.on('move', (m) => moves.push(m));
    const stale = { other: [meta('other', { presence_ref: 'r1' })] };
    ch.setPresenceState(stale);
    const upserts = view.upsertCalls.length;

    ch.emitBroadcast('presence:bye', { playerId: 'other' });
    expect(view.removeCalls).toEqual(['other']);

    ch.setPresenceState(stale);
    ch.emitBroadcast('move', { playerId: 'other', target: { col: 1, row: 1 } });
    expect(view.upsertCalls).toHaveLength(upserts);
    expect(moves).toEqual([]);

    // Once it drops out of sync, a later listing shows it again.
    ch.setPresenceState({});
    ch.setPresenceState(stale);
    expect(view.upsertCalls).toHaveLength(upserts + 1);
    expect(view.removeCalls).toEqual(['other']);
  });

  it('a different presence_ref or a new hello un-departs a Penguin', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    ch.setPresenceState({
      a: [meta('a', { presence_ref: 'a1' })],
      b: [meta('b', { presence_ref: 'b1' })],
    });
    ch.emitBroadcast('presence:bye', { playerId: 'a' });
    ch.emitBroadcast('presence:bye', { playerId: 'b' });
    view.upsertCalls = [];

    ch.emitBroadcast('presence:hello', meta('b'));
    ch.setPresenceState({
      a: [meta('a', { presence_ref: 'a2' })],
      b: [meta('b', { presence_ref: 'b1' })],
    });

    expect(new Set(view.upsertCalls.map((p) => p.playerId))).toEqual(new Set(['a', 'b']));
    expect(view.removeCalls).toEqual(['a', 'b']);
  });

  it('a bye from a Penguin only hinted so far suppresses its lagging Presence join', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);

    ch.emitBroadcast('presence:hello', meta('other'));
    ch.emitBroadcast('presence:bye', { playerId: 'other' });
    const upserts = view.upsertCalls.length;
    ch.setPresenceState({ other: [meta('other', { presence_ref: 'r1' })] });

    expect(view.upsertCalls).toHaveLength(upserts);
    expect(view.removeCalls).toEqual(['other']);
  });

  it('drops an invalid bye', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    showOther(ch, 'other');

    ch.emitBroadcast('presence:bye', { playerId: '' });
    ch.emitBroadcast('presence:bye', { playerId: 'x'.repeat(65) });
    ch.emitBroadcast('presence:bye', 'other');

    expect(view.removeCalls).toEqual([]);
  });

  it('never dispatches hello or bye to on() listeners', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');
    const ch = await joinTownCenter(client, events);
    const received: unknown[] = [];
    // Bypass the public typing to prove the runtime guarantee too.
    const untypedOn = rc.on as unknown as (type: string, h: (p: unknown) => void) => () => void;
    untypedOn('presence:hello', (p) => received.push(p));
    untypedOn('presence:bye', (p) => received.push(p));

    ch.emitBroadcast('presence:hello', meta('other'));
    ch.emitBroadcast('presence:bye', { playerId: 'other' });

    expect(received).toEqual([]);
  });

  it('sends a bye before removeChannel on a Room leave and on stop(), only while joined', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');
    const ch1 = await joinTownCenter(client, events);
    client.log.length = 0;

    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    expect(client.log).toEqual(['send:room:town-center', 'removeChannel:room:town-center']);
    expect(sendsOf(ch1, 'presence:bye')).toEqual([{ playerId: 'me' }]);

    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
    await flush();
    const unjoined = client.channels[1];
    events.emit('room:leave', { roomId: 'dev-pit' });
    await flush();
    expect(unjoined.sendCalls).toEqual([]);

    const ch3 = await joinTownCenter(client, events);
    await rc.stop();
    expect(sendsOf(ch3, 'presence:bye')).toEqual([{ playerId: 'me' }]);
  });

  it('a reconnect rebuild sends no bye', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const ch1 = await joinTownCenter(client, events);

    ch1.trackResult = 'error';
    ch1.emitStatus('SUBSCRIBED');
    await flush();
    timer.fireDelay(1000);
    await flush();

    expect(client.channels).toHaveLength(2);
    expect(sendsOf(ch1, 'presence:bye')).toEqual([]);
  });

  it('a leave whose bye never settles still progresses after 300 ms', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    createChannel(client, events, view, 'me', DEFAULT_LOOK, {
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const ch = await joinTownCenter(client, events);
    ch.sendImpl = () => hang() as Promise<string>;

    events.emit('room:leave', { roomId: 'town-center' });
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
    await flush();
    expect(view.clearCalls).toBe(1);
    expect(client.log).not.toContain('removeChannel:room:town-center');

    timer.fireDelay(300);
    await flush();
    expect(client.log).toContain('removeChannel:room:town-center');
    expect(client.channels.some((c) => c.name === 'room:dev-pit')).toBe(true);
  });
});

describe('internal broadcast typing', () => {
  it('keeps hello and bye out of the public send/on typing (compile-time check)', () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);
    // @ts-expect-error hello is sent by the Room channel itself
    void rc.send('presence:hello', {
      look: DEFAULT_LOOK,
      tile: { col: 0, row: 0 },
      facing: 'left',
    });
    // @ts-expect-error bye is consumed by the Room channel itself
    rc.on('presence:bye', () => {});
    expect(rc.currentRoom()).toBeNull();
  });
});
