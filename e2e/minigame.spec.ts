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

test('minigame-play-pause-resume-finish', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?minigame=bug-squash');

  // How-to-play phase first.
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.locator('.minigame__howto-start').click();

  // Play phase.
  await expect(page.locator('.minigame__play')).toBeVisible();
  await expect(page.locator('.minigame__howto')).toBeHidden();

  const timeValue = page.locator('[data-counter="time"]');

  await page.locator('.minigame__pause').click();
  await expect(page.locator('.minigame__pause')).toHaveText('RESUME');
  // Read the frozen value only after pausing takes effect, so a tick that
  // landed between the click and this read isn't mistaken for drift.
  const frozenAt = await timeValue.textContent();

  // Timer is frozen while paused: wait past a full tick and confirm no change.
  await page.waitForTimeout(1500);
  await expect(timeValue).toHaveText(frozenAt ?? '');

  // P also toggles pause: resumes here.
  await page.keyboard.press('p');
  await expect(page.locator('.minigame__pause')).toHaveText('PAUSE');

  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  expect(errors).toEqual([]);
});

test('minigame-quit-discards-the-round', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?minigame=bug-squash');
  await page.locator('.minigame__howto-start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.locator('.minigame__quit').click();

  await expect(page.locator('.minigame')).toHaveCount(0);
  await expect(page.locator('.minigame__done')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('minigame-badge-round-shows-done-screen', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?minigame=bug-squash');
  await page.locator('.minigame__howto-start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.evaluate(() => window.__minigameTest!.setStubScore(500));
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-badge')).toBeVisible();

  await page.screenshot({ path: 'test-results/minigame-done/screenshot.png' });

  expect(errors).toEqual([]);
});
