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

test('coffee-rush', async ({ page }) => {
  const errors = collectErrors(page);

  // Installed before navigation, same as e2e/pancake-flip.spec.ts, so the
  // shell's `performance.now()` deadline and Coffee Rush's own
  // `setInterval` tick are both faked from the first script run.
  await page.clock.install();
  await page.goto('/?minigame=coffee-rush');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  const cups = page.locator('.coffee-rush__cup');
  await expect(cups).toHaveCount(4);

  // The head ticket's size decides the fill line (40/65/88%); read it off
  // the real ticket DOM (not a test hook) so the hold below lands near that
  // line regardless of which size the round dealt. Fill only grows in
  // discrete 2.6-point steps (one per 100ms tick), so this picks a tick
  // count comfortably *under* the line (2 ticks of margin below the exact
  // floor) rather than the continuous-time value: landing exactly on or
  // just past the line risks a real overfill (any overfill spills the cup,
  // per the engine's own rule), which this test doesn't want to depend on.
  const FILL_TARGET_PCT: Record<string, number> = { SMALL: 40, MEDIUM: 65, LARGE: 88 };
  const headSizeLabel = await page.locator('.coffee-rush__ticket-size').first().textContent();
  const targetPct = FILL_TARGET_PCT[headSizeLabel ?? 'SMALL'] ?? 40;
  const POUR_RATE_PCT_PER_TICK = 2.6;
  const TICK_MS = 100;
  const safeTicks = Math.max(1, Math.floor(targetPct / POUR_RATE_PCT_PER_TICK) - 2);
  const holdMs = safeTicks * TICK_MS;

  // Select a cup with A/D (a real keypress, not a test hook), then hold and
  // release SPACE to pour one real cup: `clock.runFor` fires the game's own
  // 100ms tick cadence for real (unlike `fastForward`, which would skip
  // intermediate ticks and never let the cup actually fill), so the pour
  // genuinely grows toward the fill line and lands within it.
  await page.keyboard.press('d');
  await page.keyboard.down(' ');
  await page.clock.runFor(holdMs);
  await page.keyboard.up(' ');

  const score = Number(await page.locator('[data-counter="score"]').textContent());
  expect(score).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/coffee-rush/play.png' });

  // Ending the rest of the 90s round the same way (running the clock
  // forward for real) would cost minutes of wall-clock time in this app
  // (the Room's canvas keeps rendering behind the overlay), so this uses
  // the one test hook this game adds (issue #50 decision, alongside
  // `bug-squash`'s `setStubScore`/`finishNow` and `pancake-flip`'s
  // `finishPancakeFlipNow`) to end the round now.
  await page.evaluate(() => window.__minigameTest!.finishCoffeeRushNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  await page.screenshot({ path: 'test-results/coffee-rush/done.png' });

  expect(errors).toEqual([]);
});
