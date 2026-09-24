import { describe, expect, it, vi } from 'vitest';
import { createEmitter, type Emitter, type GameEventMap } from '../contracts/game-events';
import { DEFAULT_PENGUIN_LOOK } from '../contracts/penguin';
import type { Facing, PenguinLook } from '../contracts/penguin';
import type { PresencePayload, RoomBroadcastEvent } from '../contracts/realtime';
import {
  createRoomChannel,
  parsePresencePayload,
  type PresenceChannelLike,
  type PresenceChannelStatus,
  type RealtimeClientLike,
  type RemotePenguinView,
  type SendableRoomEvent,
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
 * the double-registration hazard from the red-team review: `onPresenceSync`
 * / `onBroadcast` / `subscribe` each *add* a listener rather than replacing
 * one, and multiple registrations on the same instance all fire.
 */
class FakePresenceChannel implements PresenceChannelLike {
  trackCalls: PresencePayload[] = [];
  sendCalls: RoomBroadcastEvent[] = [];
  teardownCalls = 0;
  sendResult: 'ok' | 'timed out' | 'error' = 'ok';
  untrackResult: Promise<unknown> | null = null;

  private readonly statusCbs: Array<(status: PresenceChannelStatus) => void> = [];
  private readonly syncCbs: Array<() => void> = [];
  private readonly broadcastCbs: Array<(payload: unknown) => void> = [];
  private state: Record<string, Array<Record<string, unknown>>> = {};

  constructor(
    public readonly name: string,
    public readonly presenceKey: string,
    private readonly log: string[],
    private readonly onTeardown?: () => void,
  ) {}

  subscribe(cb: (status: PresenceChannelStatus) => void): unknown {
    this.log.push(`subscribe:${this.name}`);
    this.statusCbs.push(cb);
    return undefined;
  }

  track(payload: PresencePayload): Promise<unknown> {
    this.log.push(`track:${this.name}`);
    this.trackCalls.push(payload);
    return Promise.resolve();
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

  onBroadcast(cb: (payload: unknown) => void): void {
    this.broadcastCbs.push(cb);
  }

  send(payload: RoomBroadcastEvent): Promise<'ok' | 'timed out' | 'error' | string> {
    this.log.push(`send:${this.name}`);
    this.sendCalls.push(payload);
    return Promise.resolve(this.sendResult);
  }

  teardown(): void {
    this.teardownCalls += 1;
    this.onTeardown?.();
  }

  emitStatus(status: PresenceChannelStatus): void {
    for (const cb of this.statusCbs) cb(status);
  }

  setPresenceState(state: Record<string, Array<Record<string, unknown>>>): void {
    this.state = state;
    for (const cb of this.syncCbs) cb();
  }

  emitBroadcast(payload: unknown): void {
    for (const cb of this.broadcastCbs) cb(payload);
  }
}

/** A never-settling promise, for proving a step does not block on it. */
function hang(): Promise<unknown> {
  return new Promise(() => {
    /* never resolves */
  });
}

class FakeClient implements RealtimeClientLike {
  log: string[] = [];
  channels: FakePresenceChannel[] = [];
  /** Shifted per `removeChannel` call; defaults to `'ok'` once exhausted. */
  removeChannelResults: Array<'ok' | 'timed out' | 'error'> = [];
  removeChannelImpl:
    ((ch: PresenceChannelLike) => Promise<'ok' | 'timed out' | 'error' | string>) | null = null;

  private readonly registry = new Map<string, FakePresenceChannel>();

  channel(name: string, opts: { presenceKey: string }): FakePresenceChannel {
    this.log.push(`channel:${name}`);
    // Real realtime-js hands back the existing instance while a channel
    // with this topic is still listed client-side.
    const existing = this.registry.get(name);
    if (existing) {
      this.channels.push(existing);
      return existing;
    }
    const ch = new FakePresenceChannel(name, opts.presenceKey, this.log, () => {
      if (this.registry.get(name) === ch) this.registry.delete(name);
    });
    this.registry.set(name, ch);
    this.channels.push(ch);
    return ch;
  }

  removeChannel(ch: PresenceChannelLike): Promise<'ok' | 'timed out' | 'error' | string> {
    const fake = ch as FakePresenceChannel;
    this.log.push(`removeChannel:${fake.name}`);
    if (this.removeChannelImpl) return this.removeChannelImpl(ch);
    const result = this.removeChannelResults.shift() ?? 'ok';
    if (result === 'ok') {
      // Real unsubscribe('ok') drops the channel from the client's list.
      if (this.registry.get(fake.name) === fake) this.registry.delete(fake.name);
    }
    return Promise.resolve(result);
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

/** `DEFAULT_PENGUIN_LOOK` has an empty `name` (pre-customization); tests use a non-empty name so it round-trips unchanged unless a test is specifically about name handling. */
const NAMED_LOOK: PenguinLook = { ...DEFAULT_PENGUIN_LOOK, name: 'Buddy' };

function meta(
  playerId: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    playerId,
    look: NAMED_LOOK,
    tile: { col: 0, row: 0 },
    facing: 's' satisfies Facing,
    ...overrides,
  };
}

function setup(): { client: FakeClient; events: Emitter<GameEventMap>; view: FakeView } {
  const client = new FakeClient();
  const events = createEmitter<GameEventMap>();
  const view = new FakeView();
  return { client, events, view };
}

function createChannel(
  client: FakeClient,
  events: Emitter<GameEventMap>,
  view: FakeView,
  playerId = 'me',
  look: PenguinLook = DEFAULT_PENGUIN_LOOK,
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

/** Establishes presence for `otherId` so it is in `shownIds` (required for N5 broadcast gating). */
function showOther(ch: FakePresenceChannel, otherId: string): void {
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
      badColor: [meta('badColor', { look: { ...DEFAULT_PENGUIN_LOOK, body: 'not-a-hex' } })],
      badEnum: [meta('badEnum', { look: { ...DEFAULT_PENGUIN_LOOK, hat: 'TOP HAT' } })],
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

    const newLook: PenguinLook = { ...DEFAULT_PENGUIN_LOOK, name: 'Ada' };
    rc.setLook(newLook);
    await flush();
    expect(ch.trackCalls).toHaveLength(3);
    expect(ch.trackCalls[2].look).toEqual(newLook);
  });

  it('send is a no-op returning false when no channel is joined', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    const result = await rc.send({ type: 'chat', text: 'hi' });

    expect(result).toBe(false);
    expect(client.channels).toHaveLength(0);
  });

  it('send is a no-op returning false when the channel is not yet SUBSCRIBED', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const result = await rc.send({ type: 'move', target: { col: 1, row: 1 } });

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

    const result = await rc.send({ type: 'move', target: { col: 1, row: 1 } });

    expect(result).toBe(true);
    expect(client.channels[0].sendCalls).toEqual([
      { type: 'move', playerId: 'me', target: { col: 1, row: 1 } },
    ]);
  });

  it('send stamps sentAt from the injectable now(), and normalizes chat text', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me', DEFAULT_PENGUIN_LOOK, {
      now: () => 12345,
    });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].emitStatus('SUBSCRIBED');
    await flush();

    const result = await rc.send({ type: 'chat', text: '  hi there  ' });

    expect(result).toBe(true);
    expect(client.channels[0].sendCalls).toEqual([
      { type: 'chat', playerId: 'me', text: 'hi there', sentAt: 12345 },
    ]);
  });

  it('send returns false and does not push an invalid outgoing event (out-of-range tile)', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.channels[0].emitStatus('SUBSCRIBED');
    await flush();

    const result = await rc.send({ type: 'move', target: { col: 256, row: 0 } });

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

    const result = await rc.send({ type: 'move', target: { col: 1, row: 1 } });

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

    ch.emitBroadcast({ type: 'move', playerId: 'other', target: { col: 3, row: 4 } });
    ch.emitBroadcast({ type: 'move', playerId: 'me', target: { col: 9, row: 9 } });
    ch.emitBroadcast({ type: 'move', playerId: 'other', target: { col: 'x', row: 4 } });
    ch.emitBroadcast({ type: 'chat', playerId: 'other', text: 'hi', sentAt: 1 });
    ch.emitBroadcast({ type: 'move', playerId: 'not-shown', target: { col: 1, row: 1 } });

    expect(moveCalls).toEqual([{ type: 'move', playerId: 'other', target: { col: 3, row: 4 } }]);
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

    ch.emitBroadcast({ type: 'chat', playerId: 'other', text: 'hi', sentAt: 1 });

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

  it('N9: stop() unsubscribes from room:enter before queueing the final leave, so an enter fired during stop does not join', async () => {
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

  it('N2: an enter while a channel exists leaves it first', async () => {
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

  it('N1: clears the view and resets state before removeChannel settles, and does not wedge the queue when it throws', async () => {
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

  it('B1: a hanging untrack() does not block the next channel() call', async () => {
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

  it('B2: a removeChannel that resolves a non-ok status tears the channel down, and the next join gets fresh, single-firing handlers that track on SUBSCRIBED', async () => {
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

  it('N4: schedules a queued rejoin with 1s/2s/4s backoff capped at 10s on an unexpected CLOSED/CHANNEL_ERROR/TIMED_OUT, and resets on SUBSCRIBED', async () => {
    const { client, events, view } = setup();
    const timer = createManualTimer();
    createChannel(client, events, view, 'me', DEFAULT_PENGUIN_LOOK, {
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

  it('N5: caps rendered remote Penguins at 50, preferring ids already shown, then key order', async () => {
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

  it('N6: in the igloo, joins and tracks but renders no remote Penguins and dispatches no broadcasts', async () => {
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

    ch.emitBroadcast({ type: 'move', playerId: 'other', target: { col: 1, row: 1 } });
    expect(moveCalls).toEqual([]);
  });
});

describe('parsePresencePayload', () => {
  it('accepts a valid meta and ignores extra keys', () => {
    const result = parsePresencePayload(meta('other', { presence_ref: 'abc' }));
    expect(result).toEqual(meta('other'));
  });

  it('rejects a meta with a non-hex color', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, body: 'red' } }),
    );
    expect(result).toBeNull();
  });

  it('rejects a meta with an out-of-enum hat', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, hat: 'FEDORA' } }),
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

  it('falls back to a name of "Penguin" rather than dropping the Penguin, when the name exceeds 40 characters', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: 'x'.repeat(41) } }),
    );
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('Penguin');
  });

  it('falls back to "Penguin" for an empty name (e.g. the pre-customization default look)', () => {
    const result = parsePresencePayload(meta('other', { look: DEFAULT_PENGUIN_LOOK }));
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('Penguin');
  });

  it('falls back to "Penguin" when the name is empty after stripping control/bidi/zero-width characters', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: '​​‪' } }),
    );
    expect(result).not.toBeNull();
    expect(result?.look.name).toBe('Penguin');
  });

  it('strips control/bidi/zero-width characters from an otherwise valid name', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: 'A​d‪a' } }),
    );
    expect(result?.look.name).toBe('Ada');
  });

  it('builds a fresh look object, dropping unknown keys the payload look carried', () => {
    const result = parsePresencePayload(
      meta('other', {
        look: { ...DEFAULT_PENGUIN_LOOK, name: 'Ada', evil: 'proto-pollution' },
      }),
    );
    expect(result?.look).toEqual({ ...DEFAULT_PENGUIN_LOOK, name: 'Ada' });
    expect(result?.look).not.toHaveProperty('evil');
  });

  it('rejects a non-object', () => {
    expect(parsePresencePayload(null)).toBeNull();
    expect(parsePresencePayload('nope')).toBeNull();
  });
});

describe('SendableRoomEvent typing', () => {
  it('accepts a move without playerId and a chat without playerId/sentAt (compile-time check)', () => {
    const move: SendableRoomEvent = { type: 'move', target: { col: 0, row: 0 } };
    const chat: SendableRoomEvent = { type: 'chat', text: 'hi' };
    expect(move.type).toBe('move');
    expect(chat.type).toBe('chat');
  });
});
