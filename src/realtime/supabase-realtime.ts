/**
 * Adapts the real `@supabase/supabase-js` Realtime client to
 * `RealtimeClientLike` / `PresenceChannelLike` (`src/realtime/room-channel.ts`),
 * one call at a time — the same narrowing approach as `toAuthClient` in
 * `src/auth/auth-session.ts`. Verified against the installed
 * `@supabase/realtime-js` types (supabase-js 2.117.1).
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { PresencePayload, RoomBroadcastEvent } from '../contracts/realtime';
import type {
  PresenceChannelLike,
  PresenceChannelStatus,
  RealtimeClientLike,
} from './room-channel';

function toPresenceChannel(ch: RealtimeChannel): PresenceChannelLike {
  return {
    subscribe(cb) {
      return ch.subscribe((status) => cb(status as PresenceChannelStatus));
    },
    track(payload: PresencePayload) {
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
    onBroadcast(cb) {
      ch.on('broadcast', { event: 'room' }, (m) => cb(m.payload));
    },
    send(payload: RoomBroadcastEvent) {
      return ch.send({ type: 'broadcast', event: 'room', payload });
    },
  };
}

/**
 * Wraps a real `SupabaseClient` so `createRoomChannel` (`room-channel.ts`)
 * can drive it without depending on `@supabase/supabase-js` directly. Each
 * `PresenceChannelLike` returned by `channel()` is tracked against its real
 * `RealtimeChannel` so `removeChannel` can hand the right one back to the
 * client.
 */
export function toRealtimeClient(client: SupabaseClient): RealtimeClientLike {
  const raw = new WeakMap<PresenceChannelLike, RealtimeChannel>();

  return {
    channel(name, opts) {
      const ch = client.channel(name, {
        config: { presence: { key: opts.presenceKey }, broadcast: { self: false } },
      });
      const wrapped = toPresenceChannel(ch);
      raw.set(wrapped, ch);
      return wrapped;
    },
    removeChannel(ch) {
      const real = raw.get(ch);
      if (!real) return Promise.resolve();
      return client.removeChannel(real);
    },
  };
}
