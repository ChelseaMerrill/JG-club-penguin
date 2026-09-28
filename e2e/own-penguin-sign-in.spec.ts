/**
 * #162 on the real sign-in path: the own Penguin is never drawn with a look
 * other than the Player's saved one. Every frame is sampled while the
 * sign-in and progress loads run (slowed by 1.5 s to widen the window), and
 * every visible frame must show the saved look. Three independent tests:
 * a restored Session on a fresh boot, sign-out then an in-page sign-in as
 * test user B, and an in-page account switch from A to B. For the in-page
 * sign-ins, assertion S's window starts at the first hidden frame after the
 * broadcast; the frames before it must be the legitimate prior state.
 *
 * Uses the shared test users, so it runs in the single-worker
 * `realtime-shared-users` project; see "Running the two-browser e2e specs"
 * in the README. Writes: none, apart from `completeCreatorIfShown`'s
 * one-time first save if a test user has no complete profile yet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { PenguinLook } from '../src/contracts';
import { penguinLookHash } from '../src/game/penguin/look-hash';
import {
  hasTestUsers,
  passwordSessionState,
  type StorageState,
  type TestUser,
} from './support/password-session';
import { assertTestUsersAbsent, playerIdFromStorageState } from './support/presence-guard';
import {
  assertionSFailures,
  penguinSampler,
  type AssertionSOptions,
  type PenguinSample,
} from './support/penguin-samples';
import {
  completeCreatorIfShown,
  READY_TIMEOUT,
  waitUntilJoined,
} from './support/two-browser-session';
import './support/room-debug-types';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;
const OUT = 'test-results/own-penguin-sign-in';
const LOAD_DELAY_MS = 1_500;

function hasUser(user: TestUser): boolean {
  return Boolean(user === 'A' ? AUTH_STATE_A : AUTH_STATE_B) || hasTestUsers(user);
}

async function stateFor(user: TestUser, origin: string): Promise<StorageState | string> {
  const fromFile = user === 'A' ? AUTH_STATE_A : AUTH_STATE_B;
  return fromFile ?? passwordSessionState(user, origin);
}

async function delayProgressLoads(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, LOAD_DELAY_MS));
    await route.continue();
  });
}

async function ownLook(page: Page): Promise<PenguinLook> {
  const raw = await page.locator('.debug-overlay').getAttribute('data-own-look');
  if (!raw) throw new Error('no data-own-look on the debug overlay');
  return JSON.parse(raw) as PenguinLook;
}

async function clearSamples(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__penguinSamples = [];
  });
}

/**
 * Assertion S (see `assertionSFailures`) for the saved look `look`. With
 * `options.prior`, S's window starts at the first hidden sample. Writes the
 * sample log to `samplesPath` before asserting, so it's saved whether or not
 * the assertion passes.
 */
async function expectOnlySavedLook(
  page: Page,
  look: PenguinLook,
  samplesPath: string,
  options: AssertionSOptions = {},
): Promise<PenguinSample[]> {
  // Wait for the reveal, then let at least a few more frames land after it.
  await page.waitForFunction(() => window.__roomDebug?.localPenguin?.visible === true, undefined, {
    timeout: READY_TIMEOUT,
  });
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => window.__penguinSamples ?? []);
  await writeSamples(samplesPath, samples);
  const expected = { ...look, texturePrefix: `penguin:${penguinLookHash(look)}:` };
  expect(assertionSFailures(samples, expected, options), 'assertion S').toEqual([]);
  return samples;
}

async function openAs(
  browser: Browser,
  baseURL: string | undefined,
  user: TestUser,
): Promise<{ page: Page; origin: string; close: () => Promise<void> }> {
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const state = await stateFor(user, origin);
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1618, height: 918 });
  // Before the first navigation, so the in-page sign-ins (no reload) are sampled too.
  await page.addInitScript(penguinSampler);
  await page.goto('/?debug&masknames');
  await completeCreatorIfShown(page, `Sign-in Tester ${user}`);
  await waitUntilJoined(page);
  return { page, origin, close: () => context.close() };
}

/** Signs `user` in on `page` without a reload: B's session into storage, then auth-js's own broadcast. */
async function signInInPage(page: Page, user: TestUser, origin: string): Promise<void> {
  const state = await stateFor(user, origin);
  const parsed =
    typeof state === 'string' ? (JSON.parse(await readFile(state, 'utf8')) as StorageState) : state;
  const entry = parsed.origins
    .flatMap((o) => o.localStorage)
    .find((item) => /^sb-.*-auth-token$/.test(item.name));
  if (!entry) throw new Error(`no sb-*-auth-token for test user ${user}`);
  await page.evaluate(({ name, value }) => {
    localStorage.setItem(name, value);
    new BroadcastChannel(name).postMessage({ event: 'SIGNED_IN', session: JSON.parse(value) });
  }, entry);
}

async function guard(users: TestUser[], origin: string): Promise<void> {
  const ids = [];
  for (const user of users) {
    ids.push({ label: user, playerId: playerIdFromStorageState(await stateFor(user, origin)) });
  }
  await assertTestUsersAbsent(ids);
}

test.describe('own-penguin-sign-in', () => {
  test('a restored Session never draws a look other than the saved one', async ({
    browser,
    baseURL,
  }) => {
    test.skip(!hasUser('A'), 'requires test user A (.env.test.local or AUTH_STATE_A)');
    test.setTimeout(90_000);
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    await guard(['A'], origin);
    const { page, close } = await openAs(browser, baseURL, 'A');
    const saved = await ownLook(page);

    await delayProgressLoads(page);
    await page.reload();
    await waitUntilJoined(page);
    await expectOnlySavedLook(page, saved, `${OUT}/restored/samples.json`);
    await page.screenshot({ path: `${OUT}/restored/joined.png` });
    await close();
  });

  test("sign-out, then an in-page sign-in as B, draws only B's saved look", async ({
    browser,
    baseURL,
  }) => {
    test.skip(!hasUser('A') || !hasUser('B'), 'requires test users A and B');
    test.setTimeout(120_000);
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    await guard(['A', 'B'], origin);
    const { page, close } = await openAs(browser, baseURL, 'A');

    await page.locator('.hud__button--menu').click();
    await page.locator('.hud__menu-signout').click();
    await expect(page.locator('#ui .landing')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__roomDebug?.localPenguin?.visible))
      .toBe(true);

    await delayProgressLoads(page);
    await clearSamples(page);
    await signInInPage(page, 'B', origin);
    await waitUntilJoined(page);
    const lookB = await ownLook(page);
    await expectOnlySavedLook(page, lookB, `${OUT}/signed-out-then-in/samples.json`, {
      prior: { kind: 'landing' },
    });
    await page.screenshot({ path: `${OUT}/signed-out-then-in/joined.png` });
    await close();
  });

  test("an in-page account switch from A to B draws only B's saved look", async ({
    browser,
    baseURL,
  }) => {
    test.skip(!hasUser('A') || !hasUser('B'), 'requires test users A and B');
    test.setTimeout(120_000);
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    await guard(['A', 'B'], origin);
    const { page, close } = await openAs(browser, baseURL, 'A');
    const lookA = await ownLook(page);

    await delayProgressLoads(page);
    await clearSamples(page);
    await signInInPage(page, 'B', origin);
    const overlay = page.locator('.debug-overlay');
    await expect
      .poll(async () => (await overlay.getAttribute('data-own-look')) !== JSON.stringify(lookA), {
        timeout: 30_000,
      })
      .toBe(true);
    await waitUntilJoined(page);
    const lookB = await ownLook(page);
    expect(penguinLookHash(lookA), 'A and B must have different saved looks').not.toBe(
      penguinLookHash(lookB),
    );
    await expectOnlySavedLook(page, lookB, `${OUT}/account-switch/samples.json`, {
      prior: { kind: 'look', look: lookA },
      forbidden: lookA,
    });
    await page.screenshot({ path: `${OUT}/account-switch/joined.png` });
    await close();
  });
});

/** Saves the sample log without names (the page runs with `?masknames` anyway). */
async function writeSamples(path: string, samples: PenguinSample[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const sanitized = samples.map(({ lookName, ...rest }) => ({ ...rest, hasName: lookName !== '' }));
  await writeFile(path, JSON.stringify(sanitized, null, 2));
}
