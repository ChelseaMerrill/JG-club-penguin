import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { BODY_COLORS, type PenguinLook } from '../src/contracts/penguin';
import {
  createSupabaseProgressStore,
  toProgressClient,
} from '../src/persistence/supabase-progress-store';
import { IGLOO_SLOTS, ProgressStoreError, type IglooSlot } from '../src/persistence/progress-store';

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

const NAME_SUFFIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomNameSuffix(length: number): string {
  return Array.from(
    { length },
    () => NAME_SUFFIX_CHARS[Math.floor(Math.random() * NAME_SUFFIX_CHARS.length)],
  ).join('');
}

function randomSlot(): IglooSlot {
  return IGLOO_SLOTS[Math.floor(Math.random() * IGLOO_SLOTS.length)];
}

test('deployed-progress-restore', async ({ page }, testInfo) => {
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

  function freshStore() {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return createSupabaseProgressStore({ client: toProgressClient(client), playerId });
  }

  const store = freshStore();
  const before = await store.loadAll();

  // Write through the real store: a look that differs from `before`, a
  // finished round, a purchase (if affordable and not yet owned), and a
  // slot placement.
  const newName = `E2E${randomNameSuffix(4)}`;
  const newBody =
    BODY_COLORS.find((color) => color.toLowerCase() !== before.look.body.toLowerCase()) ??
    BODY_COLORS[0];
  const newLook: PenguinLook = { ...before.look, name: newName, body: newBody };
  await store.saveLook(newLook);

  let roundResult;
  try {
    roundResult = await store.recordRound('bug-squash', 600, { squashed: 600 });
  } catch (err) {
    if (err instanceof ProgressStoreError && err.code === 'round_too_soon') {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      roundResult = await store.recordRound('bug-squash', 600, { squashed: 600 });
    } else {
      throw err;
    }
  }
  let balance = roundResult.balance;

  const ownedItemIds = new Set(before.ownedItems);
  const affordable = before.catalog
    .filter((item) => !ownedItemIds.has(item.id) && item.price <= balance)
    .sort((a, b) => a.price - b.price)[0];

  let purchasedItemId: string | null = null;
  if (affordable) {
    const purchaseResult = await store.purchase(affordable.id);
    balance = purchaseResult.balance;
    purchasedItemId = affordable.id;
    ownedItemIds.add(affordable.id);
  } else {
    testInfo.annotations.push({
      type: 'note',
      description: 'no affordable, not-yet-owned catalog item; skipped the purchase step',
    });
  }

  const chosenSlot = randomSlot();
  const slotItemId = purchasedItemId ?? before.ownedItems[0] ?? null;
  if (slotItemId) {
    await store.setSlot(chosenSlot, slotItemId);
  } else {
    testInfo.annotations.push({
      type: 'note',
      description: 'no owned item to place; skipped the setSlot step',
    });
  }

  await page.reload();

  await expect(page.locator('.hud__tokens-value')).toHaveText(balance.toLocaleString('en-US'));
  const swatch = badge.locator('.player-badge__swatch');
  await expect(swatch).toHaveAttribute('data-penguin-color', new RegExp(`^${newBody}$`, 'i'));

  await page.screenshot({
    path: 'test-results/deployed-progress-restore/screenshot.png',
    mask: [badge.locator('.player-badge__name')],
  });

  const after = await freshStore().loadAll();

  expect(after.look).toEqual(newLook);
  expect(after.profileCreatedAt).not.toBeNull();
  expect(after.tokens).toBe(balance);
  expect(after.badges).toContain('exterminator');
  expect(after.bests['bug-squash']).toBeGreaterThanOrEqual(600);
  for (const itemId of ownedItemIds) {
    expect(after.ownedItems).toContain(itemId);
  }
  if (slotItemId) {
    expect(after.slots[chosenSlot]).toBe(slotItemId);
    for (const slot of IGLOO_SLOTS) {
      if (slot !== chosenSlot) {
        expect(after.slots[slot]).not.toBe(slotItemId);
      }
    }
  }
});
