import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasTestUsers, passwordSessionState } from './support/password-session';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const OUTPUT_DIR = 'test-results/presence-two-browsers';
const VIDEO_DIR = 'playwright-output/presence-videos';
/** The #28 acceptance budget for another browser to see a change. */
const SYNC_TIMEOUT = 2000;
/**
 * Room round trips and look changes carry no time bound in #28. Supabase
 * Realtime replicates Presence between its servers in batches: measured
 * against this project, a leave takes ~3 s to reach a browser connected to
 * a different server (~20 ms on the same one), so 2 s would be flaky here.
 */
const PROPAGATION_TIMEOUT = 5000;
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

/**
 * Finishes the Penguin Creator when the Player lands in it (every fresh
 * Session does until #34's real ProgressStore remembers a saved look): the
 * Session, and so the Room channel, starts only after the first save. A
 * Player who has already completed it goes straight to Town Center.
 */
async function completeCreatorIfShown(page: Page, name: string): Promise<void> {
  const creator = page.locator('.penguin-creator');
  const joined = page.locator('.debug-overlay[data-current-room="town-center"]');
  await expect(creator.or(joined).first()).toBeVisible({ timeout: READY_TIMEOUT });
  if (!(await creator.isVisible())) return;
  await page.locator('#penguin-creator-name').fill(name);
  await page.locator('.penguin-creator__submit').click();
  await expect(creator).toBeHidden();
}
/** Waits until the page is in Town Center with its Room channel joined. */
async function waitUntilJoined(page: Page): Promise<void> {
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toHaveAttribute('data-current-room', 'town-center', {
    timeout: READY_TIMEOUT,
  });
  await expect(overlay).toHaveAttribute('data-subscribed', 'true', { timeout: READY_TIMEOUT });
}

/** The Room `RoomScene` is showing, via the `VITE_E2E_HOOKS` `window.__roomDebug` hook. */
async function shownRoom(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as unknown as { __roomDebug?: { roomId: string } }).__roomDebug?.roomId,
  );
}

async function readJsonAttribute(locator: Locator, name: string): Promise<unknown> {
  return JSON.parse((await locator.getAttribute(name)) ?? 'null') as unknown;
}

/** Asserts, within the sync budget, that `rosterItem` shows exactly the other page's own look. */
async function expectLookMatches(
  rosterItem: Locator,
  ownLookOwner: Page,
  timeout = SYNC_TIMEOUT,
): Promise<void> {
  const ownLook = await readJsonAttribute(ownLookOwner.locator('.debug-overlay'), 'data-own-look');
  expect(ownLook).not.toBeNull();
  await expect.poll(() => readJsonAttribute(rosterItem, 'data-look'), { timeout }).toEqual(ownLook);
}

test('presence-two-browsers', async ({ browser, baseURL }) => {
  // Five Room round trips at up to ~3 s of Presence propagation each.
  test.setTimeout(120_000);
  const haveStateFiles = Boolean(AUTH_STATE_A && AUTH_STATE_B);
  test.skip(
    !haveStateFiles && !hasTestUsers('A', 'B'),
    'requires E2E_USER_A/B credentials in .env.test.local, or AUTH_STATE_A and AUTH_STATE_B',
  );
  // Prefer explicit storage-state files; otherwise mint fresh sessions for
  // the two email/password test users (see e2e/support/password-session.ts).
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const stateA = haveStateFiles ? AUTH_STATE_A : await passwordSessionState('A', origin);
  const stateB = haveStateFiles ? AUTH_STATE_B : await passwordSessionState('B', origin);

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  const contextA = await browser.newContext({
    storageState: stateA,
    recordVideo: { dir: VIDEO_DIR },
  });
  const contextB = await browser.newContext({
    storageState: stateB,
    recordVideo: { dir: VIDEO_DIR },
  });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto('/?debug&masknames');
    await pageB.goto('/?debug&masknames');

    await completeCreatorIfShown(pageA, 'Penguin A');
    await completeCreatorIfShown(pageB, 'Penguin B');

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
      await expect(rosterOnB(idA)).toHaveCount(0, { timeout: PROPAGATION_TIMEOUT });
      await expect.poll(() => shownRoom(pageA)).toBe('dev-pit');

      await pageA.click('button[data-room="town-center"]');
      await expect(rosterOnB(idA)).toHaveCount(1, { timeout: PROPAGATION_TIMEOUT });
      await expect.poll(() => shownRoom(pageA)).toBe('town-center');

      expect(await pageA.locator('ul.debug-roster li').count()).toBeLessThanOrEqual(1);
    }

    // AC3: a look change (including a new name) propagates to the other
    // browser without a reload.
    await pageA.click('button.debug-random-look');
    await expectLookMatches(rosterOnB(idA), pageA, PROPAGATION_TIMEOUT);

    // #35: saving in the Penguin Creator, reopened from the HUD mid-session,
    // propagates the same way.
    await pageA.locator('.hud__button--penguin').click();
    await pageA.locator('.penguin-creator [aria-label="HAT"] [data-value="SNORKEL"]').click();
    await pageA
      .locator('.penguin-creator [aria-label="Idle animation"] [data-value="SIT"]')
      .click();
    await pageA.locator('.penguin-creator__submit').click();
    await expect(pageA.locator('.penguin-creator')).toBeHidden();
    await expect
      .poll(async () => {
        const look = await readJsonAttribute(pageA.locator('.debug-overlay'), 'data-own-look');
        return look as { hat?: string; emote?: string } | null;
      })
      .toMatchObject({ hat: 'SNORKEL', emote: 'SIT' });
    await expectLookMatches(rosterOnB(idA), pageA, PROPAGATION_TIMEOUT);
  } finally {
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png') }).catch(() => {});

    await contextA.close();
    await contextB.close();

    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
  }
});
