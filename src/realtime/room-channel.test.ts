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

  channel(name: string, opts: { presenceKey: string }): FakeRoomChannel {
    this.log.push(`channel:${name}`);
    const ch = new FakeRoomChannel(name, opts.presenceKey, this.log);
    this.channels.push(ch);
    return ch;
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
    expect(client.channels[0].sendCalls).toEqual([]);
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
    expect(client.channels[0].sendCalls).toEqual([
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
    expect(client.channels[0].sendCalls).toEqual([
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
    expect(client.channels[0].sendCalls).toEqual([]);
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

  it('clears the view and resets state before removeChannel settles, and does not wedge the queue when it throws', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    let rejectRemove: (err: Error) => void = () => {};
    client.removeChannelImpl = () =>
      new Promise((_resolve, reject) => {
        rejectRemove = reject;
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    events.emit('room:leave', { roomId: 'town-center' });
    await flush();

    // The reset ran even though removeChannel is still pending (unresolved).
    expect(view.clearCalls).toBeGreaterThan(0);
    expect(rc.currentRoom()).toBeNull();

    rejectRemove(new Error('boom'));
    await flush();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
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

  it('schedules a queued rejoin with 1s/2s/4s backoff capped at 10s on an unexpected CLOSED/CHANNEL_ERROR/TIMED_OUT, and resets on SUBSCRIBED', async () => {
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
