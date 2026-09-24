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

  // Installed before navigation so the page's own `Date`/timers/`performance`
  // (the shell's deadline timer reads `performance.now()`) are all faked
  // from the very first script run.
  await page.clock.install();
  await page.goto('/?minigame=bug-squash');

  // How-to-play phase first.
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.locator('.minigame__button--start').click();

  // Play phase.
  await expect(page.locator('.minigame__play')).toBeVisible();
  await expect(page.locator('.minigame__howto')).toBeHidden();

  const timeValue = page.locator('[data-counter="time"]');

  await page.locator('.minigame__button--pause').click();
  await expect(page.locator('.minigame__button--pause')).toHaveText('RESUME');
  // Read the frozen value only after pausing takes effect, so a tick that
  // landed between the click and this read isn't mistaken for drift.
  const frozenAt = await timeValue.textContent();

  // Timer is frozen while paused: fast-forward the faked clock past a full
  // tick and confirm no change (a real `waitForTimeout` would only prove the
  // interval was cleared, not that the deadline itself stopped moving).
  await page.clock.fastForward(1500);
  await expect(timeValue).toHaveText(frozenAt ?? '');

  await page.screenshot({ path: 'test-results/minigame-play-pause-resume-finish/screenshot.png' });

  // P also toggles pause: resumes here.
  await page.keyboard.press('p');
  await expect(page.locator('.minigame__button--pause')).toHaveText('PAUSE');

  await page.clock.fastForward(1000);
  await expect(timeValue).not.toHaveText(frozenAt ?? '');

  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  expect(errors).toEqual([]);
});

test('minigame-quit-discards-the-round', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?minigame=bug-squash');
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.screenshot({ path: 'test-results/minigame-quit-discards-the-round/screenshot.png' });

  await page.locator('.minigame__footer .minigame__button--quit').click();

  await expect(page.locator('.minigame')).toHaveCount(0);
  await expect(page.locator('.minigame__done')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('minigame-done', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?minigame=bug-squash');
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.evaluate(() => window.__minigameTest!.setStubScore(500));
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-badge')).toBeVisible();
  // The tokens/best rows settle once `recordRound` resolves; the "SAVING…"
  // line disappears once they do.
  await expect(page.locator('.minigame__done-saving')).toBeHidden();
  await expect(page.locator('[data-done-stat="tokens"]')).toBeVisible();

  await page.screenshot({ path: 'test-results/minigame-done/screenshot.png' });

  expect(errors).toEqual([]);
});
