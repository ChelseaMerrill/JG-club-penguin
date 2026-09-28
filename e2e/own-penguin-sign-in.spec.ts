/**
 * #162 on the real sign-in path: the own Penguin is never drawn with a look
 * other than the Player's saved one. Every frame is sampled while the
 * sign-in and progress loads run (slowed by 1.5 s to widen the window), and
 * every visible frame must show the saved look. Three independent tests:
 * a restored Session on a fresh boot, sign-out then an in-page sign-in as
 * test user B, and an in-page account switch from A to B.
 *
 * Uses the shared test users, so it runs in the single-worker
 * `realtime-shared-users` project; see "Running the two-browser e2e specs"
 * in the README. Writes: none, apart from `completeCreatorIfShown`'s
 * one-time first save if a test user has no complete profile yet.
 */
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
import { completeCreatorIfShown, waitUntilJoined } from './support/two-browser-session';
import './support/room-debug-types';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;
const OUT = 'test-results/own-penguin-sign-in';
const LOAD_DELAY_MS = 1_500;

interface Sample {
  t: number;
  visible: boolean;
  lookName: string;
  lookBody: string;
  textureKey?: string;
}

declare global {
  interface Window {
    __penguinSamples?: Sample[];
  }
}

function hasUser(user: TestUser): boolean {
  return Boolean(user === 'A' ? AUTH_STATE_A : AUTH_STATE_B) || hasTestUsers(user);
}

async function stateFor(user: TestUser, origin: string): Promise<StorageState | string> {
  const fromFile = user === 'A' ? AUTH_STATE_A : AUTH_STATE_B;
  return fromFile ?? passwordSessionState(user, origin);
}

/** Records one sample per animation frame, only once the local Penguin exists. */
async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__penguinSamples = [];
    const tick = (): void => {
      const own = window.__roomDebug?.localPenguin;
      if (own) {
        window.__penguinSamples!.push({
          t: performance.now(),
          visible: own.visible ?? true,
          lookName: own.lookName,
          lookBody: own.lookBody,
          textureKey: own.textureKey,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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

/** Assertion S: every visible frame is `look`, it starts hidden, and it ends visible. */
async function expectOnlySavedLook(page: Page, look: PenguinLook, forbidden?: PenguinLook) {
  // Let at least a few more frames land after the join.
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => window.__penguinSamples ?? []);
  const texturePrefix = `penguin:${penguinLookHash(look)}:`;
  const firstVisible = samples.findIndex((s) => s.visible);
  expect(firstVisible, 'a visible sample').toBeGreaterThan(-1);
  expect(
    samples.slice(0, firstVisible).some((s) => !s.visible),
    'a hidden sample before the first visible one',
  ).toBe(true);
  expect(
    samples.length - firstVisible - 1,
    'visible samples after the first',
  ).toBeGreaterThanOrEqual(5);
  expect(samples[samples.length - 1].visible, 'the final sample is visible').toBe(true);
  for (const sample of samples.filter((s) => s.visible)) {
    expect(sample.lookName).toBe(look.name);
    expect(sample.lookBody).toBe(look.body);
    const key = sample.textureKey ?? '__DEFAULT';
    expect(key === '__DEFAULT' || key.startsWith(texturePrefix), `texture ${key}`).toBe(true);
    if (forbidden)
      expect(sample.lookName === forbidden.name && sample.lookBody === forbidden.body).toBe(false);
  }
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
  await page.goto('/?debug&masknames');
  await completeCreatorIfShown(page, `Sign-in Tester ${user}`);
  await waitUntilJoined(page);
  return { page, origin, close: () => context.close() };
}

/** Signs `user` in on `page` without a reload: B's session into storage, then auth-js's own broadcast. */
async function signInInPage(page: Page, user: TestUser, origin: string): Promise<void> {
  const state = await stateFor(user, origin);
  const parsed =
    typeof state === 'string' ? (JSON.parse(await readFile(state)) as StorageState) : state;
  const entry = parsed.origins
    .flatMap((o) => o.localStorage)
    .find((item) => /^sb-.*-auth-token$/.test(item.name));
  if (!entry) throw new Error(`no sb-*-auth-token for test user ${user}`);
  await page.evaluate(({ name, value }) => {
    localStorage.setItem(name, value);
    new BroadcastChannel(name).postMessage({ event: 'SIGNED_IN', session: JSON.parse(value) });
  }, entry);
}

async function readFile(path: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(path, 'utf8');
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

    await installSampler(page);
    await delayProgressLoads(page);
    await page.reload();
    await waitUntilJoined(page);
    const samples = await expectOnlySavedLook(page, saved);
    await page.screenshot({ path: `${OUT}/restored/joined.png` });
    await writeSamples(`${OUT}/restored/samples.json`, samples);
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

    await installSampler(page);
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
    const samples = await expectOnlySavedLook(page, lookB);
    await page.screenshot({ path: `${OUT}/signed-out-then-in/joined.png` });
    await writeSamples(`${OUT}/signed-out-then-in/samples.json`, samples);
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

    await installSampler(page);
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
    const samples = await expectOnlySavedLook(page, lookB, lookA);
    await page.screenshot({ path: `${OUT}/account-switch/joined.png` });
    await writeSamples(`${OUT}/account-switch/samples.json`, samples);
    await close();
  });
});

/** Saves the sample log without names (the page runs with `?masknames` anyway). */
async function writeSamples(path: string, samples: Sample[]): Promise<void> {
  const fs = await import('node:fs/promises');
  const nodePath = await import('node:path');
  await fs.mkdir(nodePath.dirname(path), { recursive: true });
  const sanitized = samples.map(({ lookName, ...rest }) => ({ ...rest, hasName: lookName !== '' }));
  await fs.writeFile(path, JSON.stringify(sanitized, null, 2));
}
