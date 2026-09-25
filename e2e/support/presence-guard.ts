/**
 * Pre-flight guard for the two-browser e2e specs (#81): on the shared
 * Supabase project, a previous run of `presence-two-browsers.spec.ts` or
 * `chat-two-browsers.spec.ts` can still be leaving a Room when a new run
 * starts, so both specs confirm the test users are actually gone before
 * either opens a browser context. Subscribes to the Room channel's Presence
 * listen-only (no `track()`), so the guard itself is never mistaken for a
 * Penguin. See "Running the two-browser e2e specs" in the README.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { roomChannelKey, type RoomId } from '../../src/contracts';
import type { StorageState } from './password-session';
import { decodeJwtSub } from './two-browser-session';

/**
 * A Playwright `storageState` context option: an inline state, or a path to
 * one on disk. `undefined` is accepted only because `AUTH_STATE_A`/`_B` type
 * as `string | undefined`; the specs never actually pass `undefined` here.
 */
export type AuthStateInput = StorageState | string | undefined;

export interface TestUserId {
  label: 'A' | 'B';
  playerId: string;
}

/** A previous shared-user spec in the same run takes ~3 s for its leave to propagate here. */
const GUARD_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;
/** Distinct from any real Player id: this presence key is never tracked, only used to join. */
const GUARD_PRESENCE_KEY = 'e2e-presence-guard';

/** Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the way `password-session.ts` does. */
function readSupabaseEnv(): { supabaseUrl: string; anonKey: string } {
  const env = loadEnv('test', process.cwd(), '');
  return { supabaseUrl: env.VITE_SUPABASE_URL ?? '', anonKey: env.VITE_SUPABASE_ANON_KEY ?? '' };
}

function loadStorageState(state: AuthStateInput): StorageState {
  if (state === undefined) throw new Error('no storage state to read a Player id from');
  if (typeof state !== 'string') return state;
  return JSON.parse(readFileSync(state, 'utf8')) as StorageState;
}

/** Reads the signed-in Player's id out of a storage state's `sb-*-auth-token` (inline, or a file path). */
export function playerIdFromStorageState(state: AuthStateInput): string {
  const parsed = loadStorageState(state);
  for (const origin of parsed.origins) {
    const entry = origin.localStorage.find((item) => /^sb-.*-auth-token$/.test(item.name));
    if (!entry) continue;
    const { access_token: accessToken } = JSON.parse(entry.value) as { access_token: string };
    return decodeJwtSub(accessToken);
  }
  throw new Error('no sb-*-auth-token in storage state');
}

/** Every Player id currently present, whether it's the presence key itself or the meta's `playerId`. */
function presentPlayerIds(state: Record<string, Array<Record<string, unknown>>>): Set<string> {
  const ids = new Set<string>();
  for (const [key, metas] of Object.entries(state)) {
    ids.add(key);
    for (const meta of metas) {
      if (typeof meta.playerId === 'string') ids.add(meta.playerId);
    }
  }
  return ids;
}

/**
 * Fails fast if any of `users` is still present in `roomId`'s Presence,
 * polling for up to `GUARD_TIMEOUT_MS`. Always tears down its own channel
 * and client, so the Node process never hangs on an open Realtime socket.
 */
export async function assertTestUsersAbsent(
  users: TestUserId[],
  roomId: RoomId = 'town-center',
): Promise<void> {
  const { supabaseUrl, anonKey } = readSupabaseEnv();
  if (!supabaseUrl || !anonKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing');
  }
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channel = client.channel(roomChannelKey(roomId, GUARD_PRESENCE_KEY), {
    config: { presence: { key: GUARD_PRESENCE_KEY }, broadcast: { self: false } },
  });

  try {
    // `presenceState()` is still empty at `SUBSCRIBED`; the Room's current
    // Presence only lands with the first sync, so wait for both before polling.
    let subscribed = false;
    let synced = false;
    await new Promise<void>((resolve, reject) => {
      channel.on('presence', { event: 'sync' }, () => {
        synced = true;
        if (subscribed) resolve();
      });
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          if (synced) resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`presence guard failed to subscribe to ${roomId}: ${status}`));
        }
      });
    });

    const deadline = Date.now() + GUARD_TIMEOUT_MS;
    for (;;) {
      const present = presentPlayerIds(channel.presenceState());
      const stillThere = users.filter((u) => present.has(u.playerId));
      if (stillThere.length === 0) return;
      if (Date.now() >= deadline) {
        const names = stillThere.map((u) => `test user ${u.label}`).join(' and ');
        const verb = stillThere.length === 1 ? 'is' : 'are';
        throw new Error(
          `${names} ${verb} already in ${roomId}; another session is probably running the two-browser specs`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    await client.removeChannel(channel);
    client.realtime.disconnect();
  }
}
