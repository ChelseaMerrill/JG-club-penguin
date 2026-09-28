/**
 * #164 on the real seam: the Penguin editor's sign-in load from the real
 * shared Supabase project, with test user A. A `shop_items` 400 reproduces
 * the reported failure (`column shop_items.placement does not exist`): the
 * load-error state shows (never the Creator), TRY AGAIN restores A's saved
 * look unchanged once the route is removed, and Sign out reaches the
 * Landing page. Runs in the single-worker `realtime-shared-users` project;
 * see "Running the two-browser e2e specs" in the README.
 *
 * Writes: none while the failure is injected. The only possible write is
 * the setup's `completeCreatorIfShown`, a one-time first save if A has no
 * complete profile yet, before any route is added (#164 RT M2).
 */
import { expect, test, type Page } from '@playwright/test';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import { assertTestUsersAbsent, playerIdFromStorageState } from './support/presence-guard';
import { completeCreatorIfShown, waitUntilJoined } from './support/two-browser-session';
import './support/room-debug-types';

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const OUT = 'test-results/penguin-load-retry';
const SHOP_ITEMS = '**/rest/v1/shop_items**';

async function injectLoadFailure(page: Page): Promise<void> {
  await page.route(SHOP_ITEMS, (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: '42703',
        message: 'column shop_items.placement does not exist',
      }),
    }),
  );
}

/** #162's `localPenguin.visible`, once it exists on the branch; otherwise undefined. */
async function localPenguinVisible(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    () => (window.__roomDebug?.localPenguin as { visible?: boolean } | undefined)?.visible,
  );
}

async function watchCreator(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { creatorEverShown: boolean };
    w.creatorEverShown = false;
    new MutationObserver(() => {
      const creator = document.querySelector<HTMLElement>('.penguin-creator');
      if (creator && !creator.hidden) w.creatorEverShown = true;
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  });
}

test.describe('penguin-load-retry', () => {
  test.skip(
    !AUTH_STATE_A && !hasTestUsers('A'),
    'requires E2E_USER_A credentials in .env.test.local, or AUTH_STATE_A',
  );

  async function openAsA(browser: import('@playwright/test').Browser, baseURL: string | undefined) {
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    const stateA = AUTH_STATE_A ?? (await passwordSessionState('A', origin));
    await assertTestUsersAbsent([{ label: 'A', playerId: playerIdFromStorageState(stateA) }]);
    const context = await browser.newContext({ storageState: stateA });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1618, height: 918 });
    await page.goto('/?debug&masknames');
    await completeCreatorIfShown(page, 'Retry Tester');
    await waitUntilJoined(page);
    return { context, page };
  }

  test('recovers with TRY AGAIN and the saved look is unchanged', async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const { context, page } = await openAsA(browser, baseURL);
    const savedLook = await page.locator('.debug-overlay').getAttribute('data-own-look');
    expect(savedLook).not.toBeNull();

    await watchCreator(page);
    await injectLoadFailure(page);
    await page.reload();

    const panel = page.locator('.penguin-load-error');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.penguin-load-error__detail')).toContainText('shop_items.placement');
    await expect(page.locator('.hud')).toBeHidden();
    await expect(page.locator('.landing')).toBeHidden();
    // No Session and no Presence join while held on the error.
    for (let t = 0; t < 12; t += 1) {
      await expect(page.locator('.debug-overlay')).not.toHaveAttribute('data-subscribed', 'true');
      await page.waitForTimeout(250);
    }
    const hidden = await localPenguinVisible(page);
    if (hidden !== undefined) expect(hidden).toBe(false);
    await page.screenshot({ path: `${OUT}/recovers/error-state.png` });

    await page.locator('.penguin-load-error__retry').click();
    await expect(panel).toBeVisible();
    await expect(page.locator('.penguin-load-error__retry')).toBeEnabled();
    await expect(page.locator('.penguin-load-error__retry')).toBeFocused();

    await page.unroute(SHOP_ITEMS);
    await page.locator('.penguin-load-error__retry').click();
    await expect(panel).toBeHidden();
    await waitUntilJoined(page);

    const recoveredLook = await page.locator('.debug-overlay').getAttribute('data-own-look');
    expect(JSON.parse(recoveredLook ?? 'null')).toEqual(JSON.parse(savedLook ?? 'null'));
    expect(
      await page.evaluate(
        () => (window as unknown as { creatorEverShown: boolean }).creatorEverShown,
      ),
    ).toBe(false);
    const visible = await localPenguinVisible(page);
    if (visible !== undefined) expect(visible).toBe(true);
    await page.screenshot({ path: `${OUT}/recovers/recovered.png` });
    await context.close();
  });

  test('Sign out from the error state reaches the Landing page', async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const { context, page } = await openAsA(browser, baseURL);

    await injectLoadFailure(page);
    await page.reload();
    await expect(page.locator('.penguin-load-error')).toBeVisible({ timeout: 15_000 });

    await page.locator('.penguin-load-error__signout').click();

    await expect(page.locator('.landing')).toBeVisible();
    await expect(page.locator('.penguin-load-error')).toBeHidden();
    const visible = await localPenguinVisible(page);
    if (visible !== undefined) await expect.poll(() => localPenguinVisible(page)).toBe(true);
    await page.screenshot({ path: `${OUT}/sign-out/landing.png` });
    await context.close();
  });
});
