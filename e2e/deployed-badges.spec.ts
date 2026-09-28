import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';

// #138 gate H2: the Badge system against the real, deployed Supabase project,
// after milliehime has applied `20260927000000_badges.sql` (H1). Runs only
// with DEPLOY_URL and AUTH_STATE (e2e test user A with a named Penguin).
const DEPLOY_URL = process.env.DEPLOY_URL;
const AUTH_STATE = process.env.AUTH_STATE;

test.use({
  baseURL: DEPLOY_URL,
  storageState: AUTH_STATE,
});

/** Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the local `.env`, as `deployed-progress.spec.ts` does. */
function readLocalSupabaseEnv(): { url: string; anonKey: string } {
  const env = loadEnv('development', process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
  }
  return { url, anonKey };
}

/**
 * The access token from the AUTH_STATE storage-state file's
 * `sb-*-auth-token` localStorage entry, so the RPC checks run with no game
 * page open: a booted game would start its own Session Badge check and race
 * the before/after reads.
 */
function accessTokenFromAuthState(): string {
  const state = JSON.parse(readFileSync(AUTH_STATE!, 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins) {
    const entry = origin.localStorage.find(({ name }) => /^sb-.*-auth-token$/.test(name));
    if (entry) return (JSON.parse(entry.value) as { access_token: string }).access_token;
  }
  throw new Error('no sb-*-auth-token in AUTH_STATE');
}

function decodeJwtSub(token: string): string {
  const payload = token.split('.')[1];
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }).sub;
}

function bareClient(url: string, anonKey: string, accessToken?: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The five internal functions no client may call, with arguments that would otherwise work. */
function internalCalls(playerId: string): Array<[string, Record<string, unknown>]> {
  return [
    ['award_badge', { player_id: playerId, badge_id: 'ship-it' }],
    ['award_badge_if_available', { player_id: playerId, badge_id: 'ship-it' }],
    ['evaluate_session_badges', { player_id: playerId, at_time: new Date().toISOString() }],
    ['is_night_owl_time', { at_time: new Date().toISOString() }],
    ['igloo_slots_award_interior_penguin', {}],
  ];
}

test('deployed-badges: the Session check awards First Waddle and pays exactly +50 per new Badge; no client can award itself anything', async () => {
  test.skip(!DEPLOY_URL || !AUTH_STATE, 'requires DEPLOY_URL and AUTH_STATE');

  const { url, anonKey } = readLocalSupabaseEnv();
  const accessToken = accessTokenFromAuthState();
  const playerId = decodeJwtSub(accessToken);
  const authed = bareClient(url, anonKey, accessToken);
  const anon = bareClient(url, anonKey);

  const readState = async () => {
    const tokens = await authed.from('players').select('tokens').eq('id', playerId).single();
    const badges = await authed.from('player_badges').select('badge_id').eq('player_id', playerId);
    expect(tokens.error).toBeNull();
    expect(badges.error).toBeNull();
    return {
      tokens: (tokens.data as { tokens: number }).tokens,
      badges: ((badges.data ?? []) as Array<{ badge_id: string }>)
        .map((row) => row.badge_id)
        .sort(),
    };
  };

  // Settle any award due right now (Night Owl between 02:00 and 05:00 ET)
  // before the first read.
  const first = await authed.rpc('check_session_badges');
  expect(first.error).toBeNull();
  const firstResult = first.data as { badges: string[]; balance: number };
  expect(firstResult.badges).toContain('first-waddle');

  // Two consecutive checks: the balance moves by exactly 50 per newly listed id.
  const second = await authed.rpc('check_session_badges');
  expect(second.error).toBeNull();
  const secondResult = second.data as { badges: string[]; balance: number };
  const newlyListed = secondResult.badges.filter((id) => !firstResult.badges.includes(id));
  expect(secondResult.balance - firstResult.balance).toBe(50 * newlyListed.length);

  const before = await readState();

  // A direct insert into player_badges is rejected.
  const insert = await authed
    .from('player_badges')
    .insert({ player_id: playerId, badge_id: 'ship-it' });
  expect(insert.error).not.toBeNull();

  // Every internal function is rejected, signed in and as anon. Any error
  // response counts: PostgREST may answer 404 PGRST202 for a function the
  // role can't execute.
  for (const [fn, args] of internalCalls(playerId)) {
    const asPlayer = await authed.rpc(fn, args);
    expect(asPlayer.error, `authenticated ${fn}`).not.toBeNull();
    const asAnon = await anon.rpc(fn, args);
    expect(asAnon.error, `anon ${fn}`).not.toBeNull();
  }

  // anon can't read the catalog or run the Session check.
  const anonCatalog = await anon.from('badges').select('id');
  expect(anonCatalog.error !== null || (anonCatalog.data ?? []).length === 0).toBe(true);
  const anonCheck = await anon.rpc('check_session_badges');
  expect(anonCheck.error).not.toBeNull();

  // Nothing any of those calls did changed the Player's Tokens or Badges.
  expect(await readState()).toEqual(before);
});

test('deployed-badges: the Trophy Case shows x / 15 over two pages with First Waddle earned', async ({
  page,
}) => {
  test.skip(!DEPLOY_URL || !AUTH_STATE, 'requires DEPLOY_URL and AUTH_STATE');

  await page.setViewportSize({ width: GAME_WIDTH, height: GAME_HEIGHT });
  await page.goto('/');
  await expect(page.locator('.hud__button--igloo')).toBeVisible({ timeout: 20_000 });
  await page.locator('.hud__button--igloo').click();

  const hotspot = igloo.hotspots!.find((h) => h.id === 'trophy-case')!;
  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('canvas not visible');
  const click = async () =>
    page.mouse.click(
      canvas.x + ((hotspot.rect.x + hotspot.rect.width / 2) * canvas.width) / GAME_WIDTH,
      canvas.y + ((hotspot.rect.y + hotspot.rect.height / 2) * canvas.height) / GAME_HEIGHT,
    );
  await expect(async () => {
    await click();
    await expect(page.locator('.trophy-case')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await expect(page.locator('.trophy-case__subtitle')).toHaveText(
    /^YOUR IGLOO · BADGES · \d+ \/ 15$/,
  );
  await expect(page.locator('.trophy-case__page-dot')).toHaveCount(2);
  await expect(page.locator('[data-badge-id="first-waddle"]')).toHaveClass(
    /trophy-case__badge--earned/,
  );
  await page.screenshot({ path: 'test-results/138-deployed-badges/trophy-case.png' });
});
