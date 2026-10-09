import { expect, test, type Page } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

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

async function bootLounge(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=remote-lounge');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('remote-lounge');
  return errors;
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  await page.mouse.click(
    box.x + (point.x * box.width) / GAME_WIDTH,
    box.y + (point.y * box.height) / GAME_HEIGHT,
  );
}

test('Remote Lounge: the globe spins with its land, and the roster lists all 17 remote JGers', async ({
  page,
}) => {
  const errors = await bootLounge(page);

  await expect(page.locator('.remote-lounge')).toBeVisible();
  await expect(page.locator('.remote-lounge__roster-item')).toHaveCount(17);
  // The land arrives once the world map has loaded.
  await expect
    .poll(() => page.locator('.globe path[fill="#d3ebf3"]').getAttribute('d'), {
      timeout: BOOT_TIMEOUT,
    })
    .toMatch(/^M/);
  await expect(page.locator('.remote-lounge__card')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/remote-lounge/globe.png' });

  expect(errors).toEqual([]);
});

test("Remote Lounge: a roster row flies the globe to that person's city and opens their card; Escape closes it", async ({
  page,
}) => {
  const errors = await bootLounge(page);

  const josh = page.locator('.remote-lounge__roster-item', { hasText: 'Joshua Jameson' });
  await josh.click();
  const card = page.locator('.remote-lounge__card');
  await expect(card).toBeVisible();
  await expect(card.locator('.remote-lounge__card-name')).toHaveText('Joshua Jameson');
  await expect(card).toContainText('Senior Software Engineer');
  await expect(card).toContainText('St. Petersburg, FL');
  await expect(card).toContainText(/\d+ mi/);
  await expect(card).toContainText('In Florida, a gator in the pool counts as a standup.');
  await expect(card.locator('.remote-lounge__card-index')).toHaveText('15 / 17');
  await expect(josh).toHaveAttribute('aria-pressed', 'true');
  // Zoomed in, the pins carry first-name labels.
  await expect(page.locator('.globe text', { hasText: 'Joshua' })).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'test-results/remote-lounge/card.png' });

  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card.locator('.remote-lounge__card-name')).toHaveText('Nick Carson');

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(josh).toHaveAttribute('aria-pressed', 'false');

  expect(errors).toEqual([]);
});

test('Remote Lounge: walking up to a remote JGer opens their card, not the NPC dialog', async ({
  page,
}) => {
  const errors = await bootLounge(page);

  // Where his figure is drawn and clicked (`__roomDebug.npcs`).
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.['steven-vickers'], { timeout: BOOT_TIMEOUT })
    .toBeDefined();
  const steven = (await debugInfo(page))!.npcs!['steven-vickers']!;
  await clickStagePoint(page, { x: steven.x, y: steven.y });

  const card = page.locator('.remote-lounge__card');
  await expect(card).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(card.locator('.remote-lounge__card-name')).toHaveText('Steven Vickers');
  // Title TBD on the Characters sheet: no title row.
  await expect(card.locator('.remote-lounge__card-title')).toBeHidden();
  await expect(page.locator('.npc-dialog')).toBeHidden();

  expect(errors).toEqual([]);
});

test('Remote Lounge: BACK TO HQ goes straight to Town Center and hides the lounge layer', async ({
  page,
}) => {
  // A Room change needs a Session: the dev fake Player's.
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('remote-lounge'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('remote-lounge');
  await expect(page.locator('.remote-lounge')).toBeVisible();

  await page.getByRole('button', { name: 'BACK TO HQ ↘' }).click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await expect(page.locator('.remote-lounge')).toBeHidden();

  expect(errors).toEqual([]);
});

test('Remote Lounge: the LATAM pin opens the LATAM Café (owner request, 2026-10-09)', async ({
  page,
}) => {
  // A Room change needs a Session: the dev fake Player's, as BACK TO HQ's own test uses.
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('remote-lounge'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('remote-lounge');

  // The LATAM pin has no roster row of its own, and closing a card tweens the
  // globe back to where it was, so the only way to it is the globe's own
  // spin. That spin advances a fixed step per frame, so a slow headless
  // browser (~20 fps here) takes about 2.5 min a turn; Rio is on the visible
  // half for half of it. The pin never holds still to be "stable", so the
  // click is dispatched on it directly.
  test.setTimeout(180_000);
  const latamPin = page.locator('.globe__latam-pin');
  await expect(latamPin).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: 'test-results/remote-lounge/latam-pin.png' });
  await latamPin.dispatchEvent('click');

  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-cafe');
  await expect(page.locator('.remote-lounge')).toBeHidden();

  expect(errors).toEqual([]);
});
