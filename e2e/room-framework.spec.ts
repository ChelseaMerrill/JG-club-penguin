import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

interface RoomDebugInfo {
  roomId: string;
  scrollX: number;
  scrollY: number;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

test('room-framework', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__roomDebug))
    .toMatchObject({
      roomId: 'town-center',
      scrollX: 0,
      scrollY: 0,
    });
  await page.screenshot({ path: 'test-results/room-framework/town-center.png' });

  await page.goto('/?room=dev-pit');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__roomDebug))
    .toMatchObject({
      roomId: 'dev-pit',
      scrollX: 0,
      scrollY: 0,
    });
  await page.screenshot({ path: 'test-results/room-framework/dev-pit.png' });

  expect(errors).toEqual([]);
});
