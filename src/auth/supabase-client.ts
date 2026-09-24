import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '../env';

let client: SupabaseClient | undefined;

/**
 * The app's single Supabase client. Built lazily from `loadEnv()` on first
 * use, so importing this module never requires `import.meta.env` (tests
 * never call this function; see `session.test.ts` / `player.test.ts`).
 *
 * `flowType: 'pkce'` and `detectSessionInUrl: true` handle the Google OAuth
 * redirect; `persistSession: true` restores the session on reload. Verified
 * against the supabase-js v2 (2.117.1) docs — see the PR notes for the URLs.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const env = loadEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }
  return client;
}
