import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const OUTPUT_DIR = 'test-results/presence-two-browsers';
const VIDEO_DIR = 'playwright-output/presence-videos';
/** The #28 acceptance budget for another browser to see a change. */
const SYNC_TIMEOUT = 2000;
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

async function readJsonAttribute(locator: Locator, name: string): Promise<unknown> {
  return JSON.parse((await locator.getAttribute(name)) ?? 'null') as unknown;
}

/** Asserts, within the sync budget, that `rosterItem` shows exactly the other page's own look. */
async function expectLookMatches(rosterItem: Locator, ownLookOwner: Page): Promise<void> {
  const ownLook = await readJsonAttribute(ownLookOwner.locator('.debug-overlay'), 'data-own-look');
  expect(ownLook).not.toBeNull();
  await expect
    .poll(() => readJsonAttribute(rosterItem, 'data-look'), { timeout: SYNC_TIMEOUT })
    .toEqual(ownLook);
}

test('presence-two-browsers', async ({ browser }) => {
  test.skip(!AUTH_STATE_A || !AUTH_STATE_B, 'requires AUTH_STATE_A and AUTH_STATE_B');

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  const contextA = await browser.newContext({
    storageState: AUTH_STATE_A,
    recordVideo: { dir: VIDEO_DIR },
  });
  const contextB = await browser.newContext({
    storageState: AUTH_STATE_B,
    recordVideo: { dir: VIDEO_DIR },
  });

  // Keep real display names out of the video: the login badge shows the
  // Player's name, so hide it before the first frame is painted.
  for (const context of [contextA, contextB]) {
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.player-badge__name { visibility: hidden !important; }';
        document.head.append(style);
      });
    });
  }

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto('/?debug&masknames');
    await pageB.goto('/?debug&masknames');

    await waitUntilJoined(pageA);
    await waitUntilJoined(pageB);

    const idA = await readOwnPlayerId(pageA);
    const idB = await readOwnPlayerId(pageB);

    const rosterOnA = (playerId: string) => pageA.locator(`li[data-player-id="${playerId}"]`);
    const rosterOnB = (playerId: string) => pageB.locator(`li[data-player-id="${playerId}"]`);

    // AC1: each roster shows the other's Penguin within 2s, with exactly the
    // other page's own look, name included.
    await expect(rosterOnA(idB)).toHaveCount(1, { timeout: SYNC_TIMEOUT });
    await expect(rosterOnB(idA)).toHaveCount(1, { timeout: SYNC_TIMEOUT });
    await expectLookMatches(rosterOnA(idB), pageB);
    await expectLookMatches(rosterOnB(idA), pageA);

    // AC2: five Room round trips. B loses/regains exactly one li for A each
    // time; A's own roster (which never shows A) never grows duplicates.
    for (let i = 0; i < 5; i++) {
      await pageA.click('button[data-room="dev-pit"]');
      await expect(rosterOnB(idA)).toHaveCount(0, { timeout: SYNC_TIMEOUT });

      await pageA.click('button[data-room="town-center"]');
      await expect(rosterOnB(idA)).toHaveCount(1, { timeout: SYNC_TIMEOUT });

      expect(await pageA.locator('ul.debug-roster li').count()).toBeLessThanOrEqual(1);
    }

    // AC3: a look change (including a new name) propagates to the other
    // browser without a reload.
    await pageA.click('button.debug-random-look');
    await expectLookMatches(rosterOnB(idA), pageA);
  } finally {
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png') }).catch(() => {});

    await contextA.close();
    await contextB.close();

    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
  }
});
