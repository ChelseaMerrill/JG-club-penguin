import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import {
  createSupabaseProgressStore,
  toProgressClient,
} from '../src/persistence/supabase-progress-store';
import { ProgressStoreError } from '../src/persistence/progress-store';

// #135 V9 (gate H3): after the migration is applied (H2) and the PR has
// deployed, a wall item hung through the real store survives a page reload
// and a fresh `loadAll`. Runs only against a deployment, like
// `deployed-progress.spec.ts`.

const DEPLOY_URL = process.env.DEPLOY_URL;
const AUTH_STATE = process.env.AUTH_STATE;

test.use({ baseURL: DEPLOY_URL, storageState: AUTH_STATE });

function readLocalSupabaseEnv(): { url: string; anonKey: string } {
  const env = loadEnv('development', process.cwd(), 'VITE_');
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
  }
  return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY };
}

function decodeJwtSub(token: string): string {
  const json = Buffer.from(token.split('.')[1], 'base64url').toString('utf8');
  return (JSON.parse(json) as { sub: string }).sub;
}

test('deployed-igloo-wall-slots: a wall item persists in its wall slot across a reload', async ({
  page,
}) => {
  test.skip(!DEPLOY_URL || !AUTH_STATE, 'requires DEPLOY_URL and AUTH_STATE');
  test.setTimeout(90_000);

  await page.goto('/');
  const badge = page.locator('#ui .player-badge');
  await expect(badge).toBeVisible();

  const accessToken = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key));
    if (!entry) throw new Error('no sb-*-auth-token in localStorage');
    return (JSON.parse(entry[1]) as { access_token: string }).access_token;
  });
  const playerId = decodeJwtSub(accessToken);
  const { url, anonKey } = readLocalSupabaseEnv();
  const freshStore = () =>
    createSupabaseProgressStore({
      client: toProgressClient(
        createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
      ),
      playerId,
    });

  const store = freshStore();
  const before = await store.loadAll();

  // The JG Pennant (40 Tokens, wall). Earn it with one round if short.
  if (!before.ownedItems.includes('jg-pennant')) {
    if (before.tokens < 40) {
      await store.recordRound('bug-squash', 600, {
        score: 600,
        squashed: 600,
        bestCombo: 0,
        escaped: 0,
      });
    }
    try {
      await store.purchase('jg-pennant');
    } catch (err) {
      if (!(err instanceof ProgressStoreError && err.code === 'already_owned')) throw err;
    }
  }

  try {
    await store.setSlot(7, 'jg-pennant');
    await page.reload();
    await expect(badge).toBeVisible();
    expect((await freshStore().loadAll()).slots[7]).toBe('jg-pennant');

    await store.setSlot(9, 'jg-pennant');
    const moved = await freshStore().loadAll();
    expect(moved.slots[9]).toBe('jg-pennant');
    expect(moved.slots[7]).toBeNull();

    // A wall item never goes in a floor slot, and the failed move leaves it put.
    await expect(store.setSlot(1, 'jg-pennant')).rejects.toMatchObject({
      code: 'wrong_placement',
    });
    expect((await freshStore().loadAll()).slots[9]).toBe('jg-pennant');

    await page.screenshot({
      path: 'test-results/deployed-igloo-wall-slots/screenshot.png',
      mask: [badge.locator('.player-badge__name')],
    });
  } finally {
    // Restore the fixture's slots as they were before the test.
    for (const [slot, itemId] of Object.entries(before.slots)) {
      await store.setSlot(Number(slot) as Parameters<typeof store.setSlot>[0], null);
      if (itemId) await store.setSlot(Number(slot) as Parameters<typeof store.setSlot>[0], itemId);
    }
  }
});
