import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';

const DEPLOY_URL = process.env.DEPLOY_URL;
const AUTH_STATE = process.env.AUTH_STATE;
const FIXTURE_PLAYER_ID = process.env.FIXTURE_PLAYER_ID;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown when this spec is configured to run (DEPLOY_URL + AUTH_STATE set) but FIXTURE_PLAYER_ID is missing or malformed. */
export class InvalidFixturePlayerIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFixturePlayerIdError';
  }
}

if (DEPLOY_URL && AUTH_STATE && (!FIXTURE_PLAYER_ID || !UUID_PATTERN.test(FIXTURE_PLAYER_ID))) {
  throw new InvalidFixturePlayerIdError(
    'FIXTURE_PLAYER_ID must be set to a UUID (the H1b fixture Player id) when DEPLOY_URL and AUTH_STATE are set',
  );
}

test.use({
  baseURL: DEPLOY_URL,
  storageState: AUTH_STATE,
});

/** Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the local `.env` for the REST calls below. */
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

test('deployed-auth-roundtrip', async ({ page, request }) => {
  test.skip(!DEPLOY_URL || !AUTH_STATE, 'requires DEPLOY_URL and AUTH_STATE');

  await page.goto('/');

  // Signed in: the HUD is showing and the Landing page is gone. No Google
  // name is drawn anywhere, so the screenshot needs no mask.
  const hud = page.locator('#ui .hud');
  const card = page.locator('#ui .landing');
  await expect(hud).toBeVisible();
  await expect(card).toBeHidden();

  await page.screenshot({ path: 'test-results/deployed-auth-roundtrip/screenshot.png' });

  const accessToken = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key));
    if (!entry) throw new Error('no sb-*-auth-token in localStorage');
    return (JSON.parse(entry[1]) as { access_token: string }).access_token;
  });
  const ownId = decodeJwtSub(accessToken);
  const { url: supabaseUrl, anonKey } = readLocalSupabaseEnv();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };

  // Own-row SELECT only: exactly one row, and it's mine (the fixture row exists too).
  const selectResponse = await request.get(
    `${supabaseUrl}/rest/v1/players?select=id,penguin_color`,
    {
      headers,
    },
  );
  expect(selectResponse.ok()).toBe(true);
  const rows = (await selectResponse.json()) as Array<{ id: string; penguin_color: string }>;
  expect(rows.map((row) => row.id)).toEqual([ownId]);
  expect(rows[0].penguin_color).toMatch(/^#[0-9a-fA-F]{6}$/);

  // RLS denies UPDATE on someone else's row (the H1b fixture Player).
  const patchFixtureResponse = await request.patch(
    `${supabaseUrl}/rest/v1/players?id=eq.${FIXTURE_PLAYER_ID}`,
    {
      headers: { ...headers, Prefer: 'return=representation' },
      data: { penguin_color: '#000000' },
    },
  );
  expect(patchFixtureResponse.ok()).toBe(true);
  expect(await patchFixtureResponse.json()).toEqual([]);

  // UPDATE on your own row succeeds (Track D's color picker depends on this).
  const currentColor = rows[0].penguin_color;
  const patchOwnResponse = await request.patch(`${supabaseUrl}/rest/v1/players?id=eq.${ownId}`, {
    headers: { ...headers, Prefer: 'return=representation' },
    data: { penguin_color: currentColor },
  });
  expect(patchOwnResponse.ok()).toBe(true);
  expect((await patchOwnResponse.json()) as unknown[]).toHaveLength(1);

  // INSERT is denied for anyone but yourself.
  const insertResponse = await request.post(`${supabaseUrl}/rest/v1/players`, {
    headers,
    data: { id: FIXTURE_PLAYER_ID },
  });
  expect([401, 403]).toContain(insertResponse.status());

  // Sign out through the HUD's MENU, the only Sign out a signed-in Player has.
  await page.locator('#ui .hud__button--menu').click();
  await page.locator('#ui .hud__menu-signout').click();
  await expect(card).toBeVisible();
  await expect(hud).toBeHidden();

  const hasAuthToken = await page.evaluate(() =>
    Object.keys(localStorage).some((key) => /^sb-.*-auth-token$/.test(key)),
  );
  expect(hasAuthToken).toBe(false);
});
