/**
 * Adapts the real `@supabase/supabase-js` Realtime client to
 * `RealtimeClientLike` / `RoomChannelLike` (`src/realtime/room-channel.ts`),
 * one call at a time: the same narrowing approach as `toAuthClient` in
 * `src/auth/auth-session.ts`. Verified against the installed
 * `@supabase/realtime-js` types (supabase-js 2.117.1).
 *
 * Wire format: each `RoomBroadcastMap` key is its own Supabase broadcast
 * `event` name (`'move'`, `'chat'`), and the broadcast `payload` is exactly
 * `RoomBroadcastMap[K]`, with no wrapping envelope.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeClientLike, RoomChannelLike, RoomChannelStatus } from './room-channel';

function toRoomChannel(ch: RealtimeChannel): RoomChannelLike {
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
 */
export function toRealtimeClient(client: SupabaseClient): RealtimeClientLike {
  const raw = new WeakMap<RoomChannelLike, RealtimeChannel>();

  return {
    channel(name, opts) {
      const ch = client.channel(name, {
        config: { presence: { key: opts.presenceKey }, broadcast: { self: false } },
      });
      const wrapped = toRoomChannel(ch);
      raw.set(wrapped, ch);
      return wrapped;
    },
    removeChannel(ch) {
      const real = raw.get(ch);
      if (!real) return Promise.resolve('ok');
      return client.removeChannel(real);
    },
  };
}
