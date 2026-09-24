/**
 * Adapts the real `@supabase/supabase-js` Realtime client to
 * `RealtimeClientLike` / `RoomChannelLike` (`src/realtime/room-channel.ts`),
 * one call at a time: the same narrowing approach as `toAuthClient` in
 * `src/auth/auth-session.ts`. Verified against the installed
 * `@supabase/realtime-js` (supabase-js 2.117.1).
 *
 * Wire format: each `RoomBroadcastMap` key is its own Supabase broadcast
 * `event` name (`'move'`, `'chat'`), and the broadcast `payload` is exactly
 * `RoomBroadcastMap[K]`, with no wrapping envelope.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeClientLike, RoomChannelLike, RoomChannelStatus } from './room-channel';

function toRoomChannel(ch: RealtimeChannel, release: () => void): RoomChannelLike {
  return {
    subscribe(cb) {
      return ch.subscribe((status) => cb(status as RoomChannelStatus));
    },
    track(payload) {
      return ch.track(payload);
    },
    untrack() {
      return ch.untrack();
    },
    presenceState() {
      return ch.presenceState();
    },
    onPresenceSync(cb) {
      ch.on('presence', { event: 'sync' }, cb);
    },
    onBroadcast(event, cb) {
      ch.on('broadcast', { event }, (m) => cb(m.payload));
    },
    send(event, payload) {
      return ch.send({ type: 'broadcast', event, payload });
    },
    teardown() {
      release();
      ch.teardown();
    },
  };
}

/**
 * Wraps a real `SupabaseClient` so `createRoomChannel` (`room-channel.ts`)
 * can drive it without depending on `@supabase/supabase-js` directly. Each
 * `RoomChannelLike` returned by `channel()` is tracked against its real
 * `RealtimeChannel` so `removeChannel` can hand the right one back to the
 * client.
 *
 * Stale channels: realtime-js drops a channel from `client.getChannels()`
 * only when it closes (a leave that replies 'ok' or times out). A leave that
 * replies 'error' leaves it listed, and `client.channel(topic)` then returns
 * that stale instance, whose `subscribe()` throws because it has already
 * joined once. So `channel()` is async: before creating a channel it evicts
 * any listed instance for the same `realtime:<name>` topic that is not one
 * of our live channels, via `removeChannel`, falling back to `teardown()`
 * and, since teardown does not deregister either, to dropping it from the
 * public `client.realtime.channels` list.
 */
export function toRealtimeClient(client: SupabaseClient): RealtimeClientLike {
  const raw = new WeakMap<RoomChannelLike, RealtimeChannel>();
  const live = new Set<RealtimeChannel>();

  async function evict(stale: RealtimeChannel): Promise<void> {
    try {
      if ((await client.removeChannel(stale)) === 'ok') return;
    } catch {
      // Fall through to the client-side teardown below.
    }
    stale.teardown();
    if (client.getChannels().includes(stale)) {
      client.realtime.channels = client.realtime.channels.filter((c) => c !== stale);
    }
  }

  return {
    async channel(name, opts) {
      const topic = `realtime:${name}`;
      const existing = client.getChannels().find((c) => c.topic === topic);
      if (existing && !live.has(existing)) await evict(existing);

      const ch = client.channel(name, {
        config: { presence: { key: opts.presenceKey }, broadcast: { self: false } },
      });
      live.add(ch);
      const wrapped = toRoomChannel(ch, () => live.delete(ch));
      raw.set(wrapped, ch);
      return wrapped;
    },
    removeChannel(ch) {
      const real = raw.get(ch);
      if (!real) return Promise.resolve('ok');
      live.delete(real);
      return client.removeChannel(real);
    },
  };
}
