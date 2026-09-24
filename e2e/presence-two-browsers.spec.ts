import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const OUTPUT_DIR = 'test-results/presence-two-browsers';
const VIDEO_DIR = 'playwright-output/presence-videos';
const SYNC_TIMEOUT = 2000;

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

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/?debug&masknames');
  await pageB.goto('/?debug&masknames');

  const idA = await readOwnPlayerId(pageA);
  const idB = await readOwnPlayerId(pageB);

  const rosterOnA = (playerId: string) => pageA.locator(`li[data-player-id="${playerId}"]`);
  const rosterOnB = (playerId: string) => pageB.locator(`li[data-player-id="${playerId}"]`);
  const ownBodyOnA = pageA.locator('[data-own-body]');
  const ownBodyOnB = pageB.locator('[data-own-body]');

  // AC1: each roster shows the other's Penguin within 2s, with the right
  // body colour and a non-empty name.
  await expect(rosterOnA(idB)).toHaveCount(1, { timeout: SYNC_TIMEOUT });
  await expect(rosterOnB(idA)).toHaveCount(1, { timeout: SYNC_TIMEOUT });

  const bodyB = (await ownBodyOnB.getAttribute('data-own-body')) ?? '';
  const bodyA = (await ownBodyOnA.getAttribute('data-own-body')) ?? '';
  await expect(rosterOnA(idB)).toHaveAttribute('data-body', bodyB, { timeout: SYNC_TIMEOUT });
  await expect(rosterOnB(idA)).toHaveAttribute('data-body', bodyA, { timeout: SYNC_TIMEOUT });
  expect(await rosterOnA(idB).getAttribute('data-name')).not.toBe('');
  expect(await rosterOnB(idA).getAttribute('data-name')).not.toBe('');

  // AC2: five Room round trips. B loses/regains exactly one li for A each
  // time; A's own roster (which never shows A) never grows duplicates.
  for (let i = 0; i < 5; i++) {
    await pageA.click('button[data-room="dev-pit"]');
    await expect(rosterOnB(idA)).toHaveCount(0, { timeout: SYNC_TIMEOUT });

    await pageA.click('button[data-room="town-center"]');
    await expect(rosterOnB(idA)).toHaveCount(1, { timeout: SYNC_TIMEOUT });

    expect(await pageA.locator('ul.debug-roster li').count()).toBeLessThanOrEqual(1);
  }

  // AC3: a look change propagates to the other browser without a reload.
  await pageA.click('button.debug-random-look');
  const newBodyA = (await ownBodyOnA.getAttribute('data-own-body')) ?? '';
  await expect(rosterOnB(idA)).toHaveAttribute('data-body', newBodyA, { timeout: SYNC_TIMEOUT });

  await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png') });

  await contextA.close();
  await contextB.close();

  await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
  await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
});
