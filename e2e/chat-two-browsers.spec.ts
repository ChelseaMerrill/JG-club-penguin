/**
 * Runs against the real shared Supabase project (#81): other Players can be
 * in Town Center at the same time, so this only asserts on the specific
 * test-user Player id (`idA`), never on a roster's total count. See
 * "Running the two-browser e2e specs" in the README.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import { assertTestUsersAbsent, playerIdFromStorageState } from './support/presence-guard';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const BUBBLE_OUTPUT_DIR = 'test-results/chat-bubble';
const OTHER_ROOM_OUTPUT_DIR = 'test-results/chat-two-browsers';
/** A budget for another browser to see a chat broadcast (#44 AC1: "a few seconds"). */
const CHAT_SYNC_TIMEOUT = 5000;
/** Comfortably clears the #44 ~1 message/second rate limit between distinct sends. */
const RATE_LIMIT_CLEARANCE_MS = 1100;
/**
 * The window a leaked message would have to arrive in, after B has left A's
 * Room, if the negative (other-Room) check were wrong (#44 review fix F3):
 * not "past the bubble's lifetime" (there's no bubble to expire — the
 * message must never arrive at all), just a generous wait sampled
 * repeatedly rather than checked once at the end.
 */
const LEAK_CHECK_WINDOW_MS = 3000;
const LEAK_SAMPLE_INTERVAL_MS = 250;
/** Boot, sign-in and the first Room channel join, before the budget starts. */
const READY_TIMEOUT = 15_000;

function decodeJwtSub(token: string): string {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { sub: string }).sub;
}

/** Reads the signed-in Player's own id out of the `sb-*-auth-token` JWT in localStorage. */
async function readOwnPlayerId(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key));
    if (!entry) throw new Error('no sb-*-auth-token in localStorage');
    return (JSON.parse(entry[1]) as { access_token: string }).access_token;
  });
  return decodeJwtSub(accessToken);
}

/** Waits until `page` is in `roomId` with its Room channel joined. */
async function waitUntilJoined(page: Page, roomId = 'town-center'): Promise<void> {
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toHaveAttribute('data-current-room', roomId, {
    timeout: READY_TIMEOUT,
  });
  await expect(overlay).toHaveAttribute('data-subscribed', 'true', { timeout: READY_TIMEOUT });
}

/** The `window.__chatDebug` snapshot (playerId -> shown bubble text), via the `VITE_E2E_HOOKS` hook. */
async function chatDebug(page: Page): Promise<Record<string, string> | undefined> {
  return page.evaluate(
    () => (window as unknown as { __chatDebug?: Record<string, string> }).__chatDebug,
  );
}

/** Types `text` into the HUD chat field and presses Enter to send it. */
async function sendChat(page: Page, text: string): Promise<void> {
  const input = page.locator('.hud__chat-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

/** A snapshot of every key and value in both Web Storages (chat must touch neither, #44). */
type StorageSnapshot = Record<string, string>;

async function storageSnapshot(
  page: Page,
): Promise<{ local: StorageSnapshot; session: StorageSnapshot }> {
  return page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
}

/**
 * Asserts `after` matches `before` in both Web Storages, except that a
 * `sb-*-auth-token` entry may legitimately change value (a Supabase token
 * refresh can land mid-test) without failing the assertion; any other
 * changed, added, or removed key still fails it.
 */
function assertStorageUnchanged(
  before: { local: StorageSnapshot; session: StorageSnapshot },
  after: { local: StorageSnapshot; session: StorageSnapshot },
): void {
  for (const kind of ['local', 'session'] as const) {
    const beforeKeys = { ...before[kind] };
    const afterKeys = { ...after[kind] };
    for (const key of Object.keys(beforeKeys)) {
      if (/^sb-.*-auth-token$/.test(key) && key in afterKeys) {
        delete beforeKeys[key];
        delete afterKeys[key];
      }
    }
    expect(afterKeys, `${kind}Storage changed`).toEqual(beforeKeys);
  }
}

test('chat-two-browsers', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const haveStateFiles = Boolean(AUTH_STATE_A && AUTH_STATE_B);
  test.skip(
    !haveStateFiles && !hasTestUsers('A', 'B'),
    'requires E2E_USER_A/B credentials in .env.test.local, or AUTH_STATE_A and AUTH_STATE_B',
  );
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const stateA = haveStateFiles ? AUTH_STATE_A : await passwordSessionState('A', origin);
  const stateB = haveStateFiles ? AUTH_STATE_B : await passwordSessionState('B', origin);

  // #81: fail fast if another session is still running this pair of test
  // users through Town Center, before opening any browser context.
  await assertTestUsersAbsent([
    { label: 'A', playerId: playerIdFromStorageState(stateA) },
    { label: 'B', playerId: playerIdFromStorageState(stateB) },
  ]);

  rmSync(BUBBLE_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(BUBBLE_OUTPUT_DIR, { recursive: true });
  rmSync(OTHER_ROOM_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OTHER_ROOM_OUTPUT_DIR, { recursive: true });

  const contextA = await browser.newContext({ storageState: stateA });
  const contextB = await browser.newContext({ storageState: stateB });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto('/?debug&masknames');
    await pageB.goto('/?debug&masknames');

    await waitUntilJoined(pageA);
    await waitUntilJoined(pageB);

    const idA = await readOwnPlayerId(pageA);

    // The Room channel only forwards a chat broadcast to a receiver that
    // already shows the sender's Penguin (Presence's own propagation, #28),
    // so wait for B's roster to include A before sending.
    await expect(pageB.locator(`li[data-player-id="${idA}"]`)).toHaveCount(1, {
      timeout: READY_TIMEOUT,
    });

    // Baseline both pages' full Web Storage state before the first send
    // (#44 review fix F11): chat is live-only and must never persist.
    const storageBeforeA = await storageSnapshot(pageA);
    const storageBeforeB = await storageSnapshot(pageB);

    // A sends; B's __chatDebug shows A's text within a few seconds. Since
    // `__chatDebug` is now sourced from bubbles actually rendered (#44
    // review fix F1), this also proves the bubble itself is on screen
    // before the AC3 screenshot below.
    await sendChat(pageA, 'hello from A');
    await expect
      .poll(async () => (await chatDebug(pageB))?.[idA], { timeout: CHAT_SYNC_TIMEOUT })
      .toBe('hello from A');

    await pageB.screenshot({ path: path.join(BUBBLE_OUTPUT_DIR, 'screenshot.png') });

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_CLEARANCE_MS));

    // An unsafe payload renders literally (never parsed as markup) on both
    // pages, and never executes.
    const unsafe = '<script>window.__pwned=1</script>';
    await sendChat(pageA, unsafe);
    await expect
      .poll(async () => (await chatDebug(pageB))?.[idA], { timeout: CHAT_SYNC_TIMEOUT })
      .toBe(unsafe);
    expect((await chatDebug(pageA))?.[idA]).toBe(unsafe);
    expect(await pageA.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)).toBe(
      undefined,
    );
    expect(await pageB.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)).toBe(
      undefined,
    );

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_CLEARANCE_MS));

    // B moves to Dev Pit; wait until B has actually left Town Center and
    // (re)joined Dev Pit's channel before A sends again (#44 review fix F3),
    // rather than inferring it from `__chatDebug` going empty.
    await pageB.click('button[data-room="dev-pit"]');
    await waitUntilJoined(pageB, 'dev-pit');

    // A's next message (still in Town Center) must never reach B, in the
    // debug snapshot or otherwise: sample repeatedly across the whole
    // window instead of checking once at the end, so a message that arrives
    // and is later cleared can't slip past a single end-of-window check.
    await sendChat(pageA, 'should not arrive');
    const leakCheckDeadline = Date.now() + LEAK_CHECK_WINDOW_MS;
    while (Date.now() < leakCheckDeadline) {
      expect((await chatDebug(pageB))?.[idA]).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, LEAK_SAMPLE_INTERVAL_MS));
    }

    await pageB.screenshot({ path: path.join(OTHER_ROOM_OUTPUT_DIR, 'other-room.png') });

    // Neither page's Web Storage changed across the whole run (#44 review
    // fix F11), aside from a legitimate Supabase auth-token refresh.
    const storageAfterA = await storageSnapshot(pageA);
    const storageAfterB = await storageSnapshot(pageB);
    assertStorageUnchanged(storageBeforeA, storageAfterA);
    assertStorageUnchanged(storageBeforeB, storageAfterB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
