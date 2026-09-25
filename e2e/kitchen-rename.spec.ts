import { expect, test, type Page } from '@playwright/test';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const CHANGE_ROOM_TIMEOUT = 15_000;

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

// #92 D2: the Room shown to Players is "THE KITCHEN", not the pre-resync
// "THE MELT" -- the RoomId `the-melt` itself is unchanged (contracts,
// Presence, file names), only the displayed title.
test('kitchen-rename: the-melt Room displays as THE KITCHEN in the HUD', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('the-melt'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: CHANGE_ROOM_TIMEOUT })
    .toBe('the-melt');

  // The HUD's own title element takes its text from the Room definition
  // (`getRoomDefinition('the-melt').title`), so this also proves the
  // definition itself carries the new name.
  expect(theMelt.title).toBe('THE KITCHEN');
  await expect(page.locator('.hud__title')).toHaveText(/^the kitchen$/i);
  await expect(page.locator('.hud__title')).not.toHaveText(/melt/i);

  await page.screenshot({ path: 'test-results/kitchen-rename/the-kitchen-hud.png' });

  expect(errors).toEqual([]);
});
