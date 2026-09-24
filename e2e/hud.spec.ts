import { expect, test, type Page } from '@playwright/test';

const ROOM_IDS = ['town-center', 'dev-pit', 'the-melt', 'roof-deck', 'igloo'] as const;

declare global {
  interface Window {
    __hudTest?: {
      emitRoomEnter(roomId: string): void;
      openCreatorLog: number[];
    };
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

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();

  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  await expect(page.locator('.hud__title')).toHaveText('TOWN CENTER');

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
    (window as unknown as { canvasPointerDowns: number }).canvasPointerDowns = 0;
    document.querySelector('#game canvas')?.addEventListener('pointerdown', () => {
      (window as unknown as { canvasPointerDowns: number }).canvasPointerDowns += 1;
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

  const canvasPointerDowns = await page.evaluate(
    () => (window as unknown as { canvasPointerDowns: number }).canvasPointerDowns,
  );
  expect(canvasPointerDowns).toBe(0);

  expect(errors).toEqual([]);
});
