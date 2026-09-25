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

test('bug-squash: real squashes via clicks and keys reach the done screen', async ({ page }) => {
  const errors = collectErrors(page);

  // No `page.clock` here: Bug Squash's spawn/lifetime ramp runs on its own
  // real 100ms interval, and this drives it with real (short) waits instead
  // of faking the clock -- a fake-clock jump big enough to cover a round
  // also forces Phaser's own render loop through an expensive real-time
  // catch-up, which is what `e2e/minigame.spec.ts`'s stub-based tests never
  // hit (they only ever fast-forward the stub's single click handler, never
  // Bug Squash's own ticking).
  await page.goto('/?minigame=bug-squash');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.screenshot({ path: 'test-results/bug-squash/play/screenshot.png' });

  const activeBug = page.locator('.bug-squash__cell:has(.bug-squash__bug:not([hidden]))').first();

  // Squash a handful of real bugs as they spawn, alternating clicks and the
  // cell's own keyboard shortcut. Bug Squash's spawn roll is real (unseeded)
  // randomness on a real interval, so poll for it across enough short waits
  // that a spawn is a near-certainty. The round can also end on its own
  // here (3 escapes); an empty grid just means `activeBug` matches nothing,
  // so this keeps polling harmlessly either way.
  let squashCount = 0;
  for (let attempt = 0; attempt < 20 && squashCount < 4; attempt++) {
    await page.waitForTimeout(300);
    if ((await activeBug.count()) === 0) continue;

    if (attempt % 2 === 0) {
      await activeBug.click();
    } else {
      const key = await activeBug.locator('.bug-squash__cell-key').textContent();
      if (key) await page.keyboard.press(key);
    }
    squashCount += 1;
  }
  expect(squashCount).toBeGreaterThan(0);

  // Shortcuts past the rest of the 60s round (a no-op if 3 escapes already
  // ended it above) rather than waiting it out in real time.
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.screenshot({ path: 'test-results/bug-squash/done/screenshot.png' });

  expect(errors).toEqual([]);
});
