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

test('pancake-flip', async ({ page }) => {
  const errors = collectErrors(page);

  // Installed before navigation, same as e2e/minigame.spec.ts, so the
  // shell's `performance.now()` deadline and Pancake Flip's own
  // `setInterval` tick are both faked from the first script run.
  await page.clock.install();
  await page.goto('/?minigame=pancake-flip');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  const pans = page.locator('.pancake-flip__pan');
  await expect(pans).toHaveCount(4);

  // Play real flips: `clock.runFor` fires the game's own 100ms tick cadence
  // for real (unlike `fastForward`, which would skip intermediate ticks and
  // never let a pancake actually cook), so pans actually cook. Selecting a
  // pan is a real click, flipping is a real ENTER keypress -- no test hook.
  // `runFor` is real-time-expensive with the Room's canvas still rendering
  // behind the overlay, so this only asks for the few seconds it takes one
  // of the two starting pans to reach Golden/Flip Now, not the full 90s.
  let flips = 0;
  for (let i = 0; i < 10 && flips < 2; i++) {
    await page.clock.runFor(500);
    const stages = await pans.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-stage')),
    );
    for (let index = 0; index < stages.length && flips < 2; index++) {
      const stage = stages[index];
      if (stage !== 'golden' && stage !== 'flip-now') continue;
      await pans.nth(index).locator('.pancake-flip__pan-surface').click();
      await page.keyboard.press('Enter');
      flips += 1;
    }
  }
  expect(flips).toBeGreaterThan(0);

  const stacked = await page.locator('[data-counter="stacked"]').textContent();
  expect(Number(stacked)).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/pancake-flip/play.png' });

  // Ending the rest of the 90s round the same way (running the clock
  // forward for real) would cost minutes of wall-clock time in this app
  // (the Room's canvas keeps rendering behind the overlay), so this uses
  // the one test hook this game adds (issue #39 decision, alongside the
  // untouched `bug-squash` `setStubScore`/`finishNow`) to end the round now,
  // the same way `bug-squash`'s own e2e spec skips its 60s round.
  await page.evaluate(() => window.__minigameTest!.finishPancakeFlipNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.screenshot({ path: 'test-results/pancake-flip/done.png' });

  expect(errors).toEqual([]);
});
