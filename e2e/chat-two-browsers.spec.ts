import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hasTestUsers, passwordSessionState } from './support/password-session';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const OUTPUT_DIR = 'test-results/chat-bubble';
/** A budget for another browser to see a chat broadcast (#44 AC1: "a few seconds"). */
const CHAT_SYNC_TIMEOUT = 5000;
/** Comfortably clears the #44 ~1 message/second rate limit between distinct sends. */
const RATE_LIMIT_CLEARANCE_MS = 1100;
/** Comfortably past chat's 5000ms bubble lifetime, so a would-be late arrival has had time to show. */
const BUBBLE_LIFETIME_CLEARANCE_MS = 4000;
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

/** Waits until the page is in Town Center with its Room channel joined. */
async function waitUntilJoined(page: Page): Promise<void> {
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toHaveAttribute('data-current-room', 'town-center', {
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

async function localStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).sort());
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

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

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

    // A sends; B's __chatDebug shows A's text within a few seconds.
    await sendChat(pageA, 'hello from A');
    await expect
      .poll(async () => (await chatDebug(pageB))?.[idA], { timeout: CHAT_SYNC_TIMEOUT })
      .toBe('hello from A');

    await pageB.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png') }).catch(() => {});

    // A's own localStorage is untouched by sending (chat is live-only, never persisted).
    const keysBefore = await localStorageKeys(pageA);
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

    const keysAfter = await localStorageKeys(pageA);
    expect(keysAfter).toEqual(keysBefore);

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_CLEARANCE_MS));

    // B moves to Dev Pit; a later message from A (still in Town Center)
    // never reaches B, in the debug snapshot or otherwise.
    await pageB.click('button[data-room="dev-pit"]');
    await expect.poll(async () => (await chatDebug(pageB)) ?? {}).toEqual({});

    await sendChat(pageA, 'should not arrive');
    await new Promise((resolve) => setTimeout(resolve, BUBBLE_LIFETIME_CLEARANCE_MS));
    expect((await chatDebug(pageB))?.[idA]).toBeUndefined();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
