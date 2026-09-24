import { describe, expect, it } from 'vitest';
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
} from './room-channel';

/** Flushes the microtask queue enough for the room channel's internal promise chains to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

class FakePresenceChannel implements PresenceChannelLike {
  trackCalls: PresencePayload[] = [];
  sendCalls: RoomBroadcastEvent[] = [];
  private statusCb: ((status: PresenceChannelStatus) => void) | null = null;
  private syncCb: (() => void) | null = null;
  private broadcastCb: ((payload: unknown) => void) | null = null;
  private state: Record<string, Array<Record<string, unknown>>> = {};

  constructor(
    public readonly name: string,
    public readonly presenceKey: string,
    private readonly log: string[],
  ) {}

  subscribe(cb: (status: PresenceChannelStatus) => void): unknown {
    this.log.push(`subscribe:${this.name}`);
    this.statusCb = cb;
    return undefined;
  }

  track(payload: PresencePayload): Promise<unknown> {
    this.log.push(`track:${this.name}`);
    this.trackCalls.push(payload);
    return Promise.resolve();
  }

  untrack(): Promise<unknown> {
    this.log.push(`untrack:${this.name}`);
    return Promise.resolve();
  }

  presenceState(): Record<string, Array<Record<string, unknown>>> {
    return this.state;
  }

  onPresenceSync(cb: () => void): void {
    this.syncCb = cb;
  }

  onBroadcast(cb: (payload: unknown) => void): void {
    this.broadcastCb = cb;
  }

  send(payload: RoomBroadcastEvent): Promise<unknown> {
    this.log.push(`send:${this.name}`);
    this.sendCalls.push(payload);
    return Promise.resolve();
  }

  emitStatus(status: PresenceChannelStatus): void {
    this.statusCb?.(status);
  }

  setPresenceState(state: Record<string, Array<Record<string, unknown>>>): void {
    this.state = state;
    this.syncCb?.();
  }

  emitBroadcast(payload: unknown): void {
    this.broadcastCb?.(payload);
  }
}

class FakeClient implements RealtimeClientLike {
  log: string[] = [];
  channels: FakePresenceChannel[] = [];

  channel(name: string, opts: { presenceKey: string }): FakePresenceChannel {
    this.log.push(`channel:${name}`);
    const ch = new FakePresenceChannel(name, opts.presenceKey, this.log);
    this.channels.push(ch);
    return ch;
  }

  removeChannel(ch: PresenceChannelLike): Promise<unknown> {
    this.log.push(`removeChannel:${(ch as FakePresenceChannel).name}`);
    return Promise.resolve();
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

function meta(
  playerId: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    playerId,
    look: DEFAULT_PENGUIN_LOOK,
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
) {
  return createRoomChannel({
    client,
    events,
    playerId,
    look,
    view,
  });
}

describe('createRoomChannel', () => {
  it('runs leave (untrack, removeChannel) before the next enter creates its channel', async () => {
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
      'untrack:room:town-center',
      'removeChannel:room:town-center',
      'channel:room:dev-pit',
      'subscribe:room:dev-pit',
    ]);
  });

  it('keeps untrack/removeChannel before the next channel() even when leave and enter fire back to back synchronously', async () => {
    const { client, events, view } = setup();
    createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    client.log.length = 0;

    events.emit('room:leave', { roomId: 'town-center' });
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 2, row: 2 } });
    await flush();

    expect(client.log).toEqual([
      'untrack:room:town-center',
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

    const result = await rc.send({ type: 'chat', playerId: 'me', text: 'hi', sentAt: 1 });

    expect(result).toBe(false);
    expect(client.channels).toHaveLength(0);
  });

  it('send resolves true and forwards the event once a channel is joined', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    const result = await rc.send({ type: 'move', playerId: 'me', target: { col: 1, row: 1 } });

    expect(result).toBe(true);
    expect(client.channels[0].sendCalls).toEqual([
      { type: 'move', playerId: 'me', target: { col: 1, row: 1 } },
    ]);
  });

  it('dispatches valid broadcast events to bus handlers, dropping invalid and own-origin events', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view, 'me');

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];

    const moveCalls: unknown[] = [];
    rc.on('move', (event) => moveCalls.push(event));

    ch.emitBroadcast({ type: 'move', playerId: 'other', target: { col: 3, row: 4 } });
    ch.emitBroadcast({ type: 'move', playerId: 'me', target: { col: 9, row: 9 } });
    ch.emitBroadcast({ type: 'move', playerId: 'other', target: { col: 'x', row: 4 } });
    ch.emitBroadcast({ type: 'chat', playerId: 'other', text: 'hi', sentAt: 1 });

    expect(moveCalls).toEqual([{ type: 'move', playerId: 'other', target: { col: 3, row: 4 } }]);
  });

  it('stops delivering to a bus handler after its unsubscribe runs', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();
    const ch = client.channels[0];

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

  it('stop() leaves the current room and unsubscribes from further room:enter events', async () => {
    const { client, events, view } = setup();
    const rc = createChannel(client, events, view);

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await flush();

    await rc.stop();
    expect(client.log).toContain('untrack:room:town-center');
    expect(client.log).toContain('removeChannel:room:town-center');

    client.log.length = 0;
    events.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 1, row: 1 } });
    await flush();

    expect(client.log).toEqual([]);
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

  it('rejects a meta with a name over 40 characters', () => {
    const result = parsePresencePayload(
      meta('other', { look: { ...DEFAULT_PENGUIN_LOOK, name: 'x'.repeat(41) } }),
    );
    expect(result).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(parsePresencePayload(null)).toBeNull();
    expect(parsePresencePayload('nope')).toBeNull();
  });
});
