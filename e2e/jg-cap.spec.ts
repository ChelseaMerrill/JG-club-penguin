import { expect, test, type Page } from '@playwright/test';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** `window.__roomDebug`, deep-cloned across the page boundary (functions never survive this). */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`, the same wait `room-transitions.spec.ts` uses. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

// #92 D4: the JG CAP was redrawn to the new crown/brim/seam/button in
// `design/Penguin Creator.dc.html`; screenshots of the Creator preview and a
// Room Penguin -- both drawn by the same `renderHat` (#31/#35 share one
// renderer) -- so one redraw covers both, as the execution plan expects.
test('jg-cap: Creator preview', async ({ page }) => {
  const errors = collectErrors(page);

  // Stage at scale 1 (see hud.spec.ts), so the screenshot is 1:1 with the design.
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?creator');

  await expect(page.locator('.penguin-creator')).toBeVisible();
  // DEFAULT_LOOK's hat is JG CAP (`penguin-creator.test.ts`'s summary check).
  await expect(page.locator('.penguin-creator__summary')).toHaveText(/^JG CAP/);
  await expect(page.locator('.penguin-creator__figure svg')).toBeVisible();

  await page.screenshot({ path: 'test-results/jg-cap/creator.png' });

  expect(errors).toEqual([]);
});

test('jg-cap: Room Penguin', async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1618, height: 918 });
  // `?asPlayer` binds a fixture Player with DEFAULT_LOOK (hat: JG CAP).
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await waitForBoot(page);

  await page.screenshot({ path: 'test-results/jg-cap/room-penguin.png' });

  expect(errors).toEqual([]);
});
