import { expect, test, type Page } from '@playwright/test';
import { ROOM_IDS } from '../src/contracts';
import type { HudTestHandle } from '../src/ui/hud/hud-test-handle';

declare global {
  interface Window {
    __hudTest?: HudTestHandle;
    canvasPointerDowns: number;
  }
}

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('hud-town-center', async ({ page }) => {
  const errors = collectErrors(page);

  // A viewport where the 1600x900 Stage renders at scale 1 with the 9px
  // gutter per side (`computeStageFit` in src/ui/stage.ts):
  // min((1618-18)/1600, (918-18)/900) = min(1, 1) = 1.
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?hud');

  await expect(page.locator('.hud')).toBeVisible();
  // The signed-in state: no login card or Landing page over the HUD.
  await expect(page.locator('.landing')).toBeHidden();
  await expect(page.locator('.player-badge')).toBeHidden();

  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  // Case-insensitive: the CSS applies text-transform: uppercase, so #13's
  // mixed-case Room titles render correctly without this assertion caring.
  await expect(page.locator('.hud__title')).toHaveText(/^town center$/i);

  await page.screenshot({ path: 'test-results/hud-town-center/screenshot.png' });

  expect(errors).toEqual([]);
});

test('hud-penguin-opens-creator', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();

  for (const roomId of ROOM_IDS) {
    await page.evaluate((id) => window.__hudTest!.emitRoomEnter(id), roomId);

    const before = await page.evaluate(() => window.__hudTest!.openCreatorLog.length);
    await page.locator('.hud__button--penguin').click();
    const after = await page.evaluate(() => window.__hudTest!.openCreatorLog.length);

    expect(after).toBeGreaterThan(before);
  }

  expect(errors).toEqual([]);
});

test('hud-clicks-stay-in-hud', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  await page.evaluate(() => {
    window.canvasPointerDowns = 0;
    document.querySelector('#game canvas')?.addEventListener('pointerdown', () => {
      window.canvasPointerDowns += 1;
    });
  });

  // Every visible HUD button (EMOTE/SNOWBALL/QUESTS and the MENU sign-out
  // panel are hidden until clicked/unlocked, so they're not in this list).
  const buttonSelectors = [
    '.hud__button--penguin',
    '.hud__button--map',
    '.hud__button--igloo',
    '.hud__button--menu',
  ];

  for (const selector of buttonSelectors) {
    const button = page.locator(selector);
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;

    const landsInsideHud = await page.evaluate(
      ([px, py]) => !!document.elementFromPoint(px, py)?.closest('.hud'),
      [x, y],
    );
    expect(landsInsideHud).toBe(true);

    await button.click();
  }

  // MENU was clicked last and its panel is now open; close it so the page
  // is left in a clean state.
  await page.keyboard.press('Escape');

  const canvasPointerDownsAfterHudClicks = await page.evaluate(() => window.canvasPointerDowns);
  expect(canvasPointerDownsAfterHudClicks).toBe(0);

  // The other half: a point outside every HUD widget (the Stage centre)
  // hits the canvas, not `.hud`, and a click there does reach the canvas's
  // own pointerdown listener.
  const canvasBox = await page.locator('#game canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;

  const centerHitsCanvas = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.tagName,
    [centerX, centerY],
  );
  expect(centerHitsCanvas).toBe('CANVAS');

  await page.mouse.click(centerX, centerY);

  const canvasPointerDownsAfterCenterClick = await page.evaluate(() => window.canvasPointerDowns);
  expect(canvasPointerDownsAfterCenterClick).toBe(1);

  expect(errors).toEqual([]);
});
