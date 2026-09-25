import { expect, test, type Page } from '@playwright/test';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
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

test('snow-cone-stand', async ({ page }) => {
  const errors = collectErrors(page);

  // Installed before navigation, same as e2e/pancake-flip.spec.ts, so the
  // shell's `performance.now()` deadline and Snow Cone Stand's own
  // `setInterval` tick are both faked from the first script run.
  await page.clock.install();
  await page.goto('/?minigame=snow-cone-stand');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  const customers = page.locator('.snow-cone-stand__customer');
  await expect(customers).toHaveCount(3);

  // Read the front (top) customer's own order (its flavour dots), build the
  // matching cone with real key presses (keys 1-4, one per dot -- no test
  // hook), then serve it with a real SPACE press.
  const frontDots = customers
    .first()
    .locator('.snow-cone-stand__customer-dots .snow-cone-stand__dot');
  const scoopCount = await frontDots.count();
  expect(scoopCount).toBeGreaterThan(0);

  // Each dot carries its flavour's exact colour as the `--dot-color`
  // CSS custom property (`snow-cone-stand.ts`'s `renderScoops`), in the same
  // order as the keyboard's 1-4 mapping (`snow-cone-stand-engine.ts`'s own
  // `FLAVORS`), so this reads the order directly instead of guessing.
  const flavorColors = ['#00bdff', '#f4f4f4', '#bfe3f0', '#0c4b5f'];
  for (let i = 0; i < scoopCount; i++) {
    const color = await frontDots
      .nth(i)
      .evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue('--dot-color').trim().toLowerCase(),
      );
    const flavorIndex = flavorColors.indexOf(color);
    expect(flavorIndex).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(String(flavorIndex + 1));
  }
  await page.keyboard.press(' ');

  // A correctly-served cone shows a "+Tokens" toast and bumps the SERVED
  // counter -- confirms at least one real, correctly-keyed serve landed.
  const served = await page.locator('[data-counter="served"]').textContent();
  expect(Number(served)).toBeGreaterThanOrEqual(1);
  const score = await page.locator('[data-counter="score"]').textContent();
  expect(Number(score)).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/snow-cone-stand/play.png' });

  // Ending the rest of the 120s round the same way (running the clock
  // forward for real) would cost minutes of wall-clock time in this app
  // (the Room's canvas keeps rendering behind the overlay), so this uses
  // the one test hook this game adds (issue #49, alongside Pancake Flip's
  // own `finishPancakeFlipNow`) to end the round now.
  await page.evaluate(() => window.__minigameTest!.finishSnowConeStandNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.screenshot({ path: 'test-results/snow-cone-stand/done.png' });

  expect(errors).toEqual([]);
});
