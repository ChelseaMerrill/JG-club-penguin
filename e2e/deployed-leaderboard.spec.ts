import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import {
  createSupabaseProgressStore,
  toProgressClient,
} from '../src/persistence/supabase-progress-store';

const DEPLOY_URL = process.env.DEPLOY_URL;
const AUTH_STATE = process.env.AUTH_STATE;

test.use({
  baseURL: DEPLOY_URL,
  storageState: AUTH_STATE,
});

/** Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the local `.env`, exactly as `deployed-auth.spec.ts` does. */
function readLocalSupabaseEnv(): { url: string; anonKey: string } {
  const env = loadEnv('development', process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
  }
  return { url, anonKey };
}

function decodeJwtSub(token: string): string {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { sub: string }).sub;
}

// R1 (real client-to-PostgREST seam), gate H3: read-only and shape-only. No
// screenshot of real names (R6): only counts and key names are asserted.
test('deployed-leaderboard', async ({ page }) => {
  test.skip(!DEPLOY_URL || !AUTH_STATE, 'requires DEPLOY_URL and AUTH_STATE');

  await page.goto('/');
  const badge = page.locator('#ui .player-badge');
  await expect(badge).toBeVisible();

  const accessToken = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key));
    if (!entry) throw new Error('no sb-*-auth-token in localStorage');
    return (JSON.parse(entry[1]) as { access_token: string }).access_token;
  });
  const playerId = decodeJwtSub(accessToken);
  const { url: supabaseUrl, anonKey } = readLocalSupabaseEnv();

  const authedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const store = createSupabaseProgressStore({
    client: toProgressClient(authedClient),
    playerId,
  });

  const rows = await store.leaderboard('bug-squash');

  // At most the top 10 plus the caller's own appended row.
  expect(rows.length).toBeLessThanOrEqual(11);
  expect(rows.filter((row) => row.isMe).length).toBeLessThanOrEqual(1);
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(['bestScore', 'isMe', 'penguinName', 'rank'].sort());
    expect(typeof row.rank).toBe('number');
    expect(typeof row.penguinName).toBe('string');
    expect(typeof row.bestScore).toBe('number');
    expect(typeof row.isMe).toBe('boolean');
  }

  // anon (no Authorization header at all) is denied.
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anonClient.rpc('leaderboard', { minigame_id: 'bug-squash' });
  expect(error).not.toBeNull();
  expect(error?.code).toBe('42501');
});
