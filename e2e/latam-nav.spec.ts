import { expect, test, type Page } from '@playwright/test';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Boots with a fixture Player and the HUD shown, no sign-in (`?asPlayer&hud`). */
async function bootWithHud(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await expect(page.locator('.hud')).toBeVisible();
  return errors;
}

async function changeRoom(page: Page, roomId: string): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id as never), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe(roomId);
}

test('LATAM nav: two small pills under the title link the LATAM Café to its siblings and back', async ({
  page,
}) => {
  const errors = await bootWithHud(page);

  await changeRoom(page, 'latam-cafe');
  const nav = page.locator('.latam-nav');
  await expect(nav).toBeVisible();
  const pills = nav.locator('.latam-nav__pill');
  await expect(pills).toHaveCount(2);
  await expect(pills.nth(0)).toHaveText('DISCO HALL');
  await expect(pills.nth(1)).toHaveText('FUTEBOL FIELD');

  // Sits just under the HUD's title/subtitle block, not overlapping it.
  const titleBox = await page.locator('.hud__title-block').boundingBox();
  const navBox = await nav.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(navBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/latam-nav/cafe.png' });

  await nav.getByText('DISCO HALL').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-disco-hall');
  await expect(nav.locator('.latam-nav__pill')).toHaveText(['CAFE LOUNGE', 'FUTEBOL FIELD']);

  await nav.getByText('FUTEBOL FIELD').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-futebol-field');
  await expect(nav.locator('.latam-nav__pill')).toHaveText(['CAFE LOUNGE', 'DISCO HALL']);

  await nav.getByText('CAFE LOUNGE').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-cafe');
  await expect(nav.locator('.latam-nav__pill')).toHaveText(['DISCO HALL', 'FUTEBOL FIELD']);

  expect(errors).toEqual([]);
});

test('LATAM nav: hidden outside the LATAM Rooms', async ({ page }) => {
  const errors = await bootWithHud(page);

  await expect(page.locator('.latam-nav')).toBeHidden();

  await changeRoom(page, 'latam-cafe');
  await expect(page.locator('.latam-nav')).toBeVisible();

  await changeRoom(page, 'town-center');
  await expect(page.locator('.latam-nav')).toBeHidden();

  expect(errors).toEqual([]);
});
