import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createEmitter, DEFAULT_LOOK, type RoomEventMap } from '../contracts';
import { createRoomChannel, type RemotePenguinView } from './room-channel';
import { toRealtimeClient } from './supabase-realtime';

type LeaveStatus = 'ok' | 'timed out' | 'error';

/**
 * Mirrors the realtime-js channel lifecycle the adapter depends on
 * (`@supabase/realtime-js` RealtimeClient/RealtimeChannel, phoenix Channel):
 * a leave that replies 'ok' or times out closes the channel, and only a
 * close drops it from the client's list; `teardown()` does not; and a
 * channel instance can be subscribed only once.
 */
class FakeRealtimeChannel {
  joinedOnce = false;
  tornDown = false;

  constructor(
    readonly topic: string,
    private readonly realtime: FakeRealtime,
  ) {}

  subscribe(): this {
    if (this.joinedOnce) {
      throw new Error(
        "tried to subscribe multiple times. 'subscribe' can only be called a single time per channel instance",
      );
    }
    this.joinedOnce = true;
    return this;
  }

  unsubscribe(): Promise<LeaveStatus> {
    const status = this.realtime.leaveResults.shift() ?? 'ok';
    if (status !== 'error') this.realtime.close(this);
    return Promise.resolve(status);
  }

  teardown(): void {
    this.tornDown = true;
  }

  on(): this {
    return this;
  }

  track(): Promise<'ok'> {
    return Promise.resolve('ok');
  }

  untrack(): Promise<'ok'> {
    return Promise.resolve('ok');
  }

  presenceState(): Record<string, never> {
    return {};
  }

  send(): Promise<'ok'> {
    return Promise.resolve('ok');
  }
}

class FakeRealtime {
  channels: FakeRealtimeChannel[] = [];
  /** Shifted per leave; defaults to `'ok'` once exhausted. */
  leaveResults: LeaveStatus[] = [];

  close(ch: FakeRealtimeChannel): void {
    this.channels = this.channels.filter((c) => c.topic !== ch.topic);
  }
}

class FakeSupabase {
  readonly realtime = new FakeRealtime();

  channel(topic: string): FakeRealtimeChannel {
    const realtimeTopic = `realtime:${topic}`;
    const exists = this.realtime.channels.find((c) => c.topic === realtimeTopic);
    if (exists) return exists;
    const ch = new FakeRealtimeChannel(realtimeTopic, this.realtime);
    this.realtime.channels.push(ch);
    return ch;
  }

  getChannels(): FakeRealtimeChannel[] {
    return this.realtime.channels;
  }

  async removeChannel(ch: FakeRealtimeChannel): Promise<LeaveStatus> {
    const status = await ch.unsubscribe();
    if (status === 'ok') ch.teardown();
    return status;
  }
}

const nullView: RemotePenguinView = { upsert() {}, remove() {}, clear() {} };

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup() {
  const supabase = new FakeSupabase();
  const client = toRealtimeClient(supabase as unknown as SupabaseClient);
  return { supabase, client };
}

describe('toRealtimeClient', () => {
  it('hands back a fresh, joinable channel after a leave that replied error left the old one listed', async () => {
    const { supabase, client } = setup();
    const first = await client.channel('room:town-center', { presenceKey: 'me' });
    first.subscribe(() => {});
    const stale = supabase.getChannels()[0];

    supabase.realtime.leaveResults = ['error'];
    expect(await client.removeChannel(first)).toBe('error');
    first.teardown();
    expect(supabase.getChannels()).toEqual([stale]);

    const second = await client.channel('room:town-center', { presenceKey: 'me' });

    expect(() => second.subscribe(() => {})).not.toThrow();
    expect(supabase.getChannels()).toHaveLength(1);
    expect(supabase.getChannels()[0]).not.toBe(stale);
  });

  it('drops a stale channel from the list even when its eviction leave also replies error', async () => {
    const { supabase, client } = setup();
    const first = await client.channel('room:dev-pit', { presenceKey: 'me' });
    first.subscribe(() => {});
    const stale = supabase.getChannels()[0];

    supabase.realtime.leaveResults = ['error', 'error'];
    await client.removeChannel(first);
    first.teardown();

    const second = await client.channel('room:dev-pit', { presenceKey: 'me' });

    expect(stale.tornDown).toBe(true);
    expect(supabase.getChannels()).toHaveLength(1);
    expect(() => second.subscribe(() => {})).not.toThrow();
  });

  it('lets a Room channel re-enter the same Room after an error leave', async () => {
    const { supabase, client } = setup();
    const events = createEmitter<RoomEventMap>();
    const errors: unknown[] = [];
    createRoomChannel({
      client,
      events,
      playerId: 'me',
      look: DEFAULT_LOOK,
      view: nullView,
      onError: (_context, err) => errors.push(err),
    });

    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 4, row: 4 } });
    await flush();
    const stale = supabase.getChannels()[0];
    supabase.realtime.leaveResults = ['error'];
    events.emit('room:leave', { roomId: 'town-center' });
    await flush();
    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 4, row: 4 } });
    await flush();

    expect(errors).toEqual([]);
    expect(supabase.getChannels()).toHaveLength(1);
    expect(supabase.getChannels()[0]).not.toBe(stale);
    expect(supabase.getChannels()[0].joinedOnce).toBe(true);
  });
});
