import { expect, test, type Page } from '@playwright/test';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

// #181: the design's own 1600x900 Stage, un-letterboxed as far as a 1600x900
// viewport allows, so the play/done screenshots below are at design size.
test.use({ viewport: { width: 1600, height: 900 } });

const IAN_SQUASH_LINES = ['Squashed.', 'Clean.', 'Green.', 'Ship it.'];
const IAN_ESCAPE_LINES = ['That one got into prod.', 'Build light down.', 'It is in the logs now.'];
const IAN_RESULT_LINES = [
  'Five escaped. Roll it back.',
  'Wall of fame. Do not let it go to your head.',
  'Passable. Squash faster next sprint.',
  'That is a lot of bugs in prod.',
];

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('bug-squash: five build lights, Ian lines, and real squashes reach the done screen (#181)', async ({
  page,
}) => {
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
  await expect(page.locator('.minigame__howto-list')).toContainText('Lose all five and CI fails.');
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  // Five build lights, all lit at the start of the round (#181: was three).
  await expect(page.locator('.bug-squash__light')).toHaveCount(5);
  await expect(page.locator('.bug-squash__light--lit')).toHaveCount(5);

  // Ian's line under the grid starts on the round-start line.
  const ianLine = page.locator('.bug-squash__ian-line');
  await expect(ianLine).toHaveText('Ian: "Tests running. Squash."');

  // An empty cell click shows Ian's empty-click line (re-resolved at click
  // time, so it always lands on a cell with no bug even if one has already
  // spawned by now).
  const emptyCell = page.locator(
    '.bug-squash__cell:not(.bug-squash__cell--cyan):not(.bug-squash__cell--flaky)',
  );
  await emptyCell.first().click();
  await expect(ianLine).toHaveText('Ian: "That was a feature."');

  await page.screenshot({ path: 'test-results/bug-squash-rules/play-and-done-screens/play.png' });

  const activeBug = page.locator('.bug-squash__cell:has(.bug-squash__bug:not([hidden]))').first();

  // Squash a handful of real bugs as they spawn, alternating clicks and the
  // cell's own keyboard shortcut. Bug Squash's spawn roll is real (unseeded)
  // randomness on a real interval, so poll for it across enough short waits
  // that a spawn is a near-certainty. The round can also end on its own here
  // (5 escapes, #181); an empty grid just means `activeBug` matches nothing,
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

    // Ian reacts to every squash, flaky hit, or escape along the way: his
    // line is always one of the design's known lines (#181), never blank or
    // stale from before the round started.
    const line = (await ianLine.textContent()) ?? '';
    const known = [...IAN_SQUASH_LINES, 'Flaky. Again!', ...IAN_ESCAPE_LINES];
    expect(known.some((text) => line === `Ian: "${text}"`)).toBe(true);
  }
  expect(squashCount).toBeGreaterThan(0);

  // Shortcuts past the rest of the 60s round (a no-op if 5 escapes already
  // ended it above) rather than waiting it out in real time.
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__play')).toBeHidden();

  // The done screen's own result line (#181), one of the design's four.
  const doneQuote = page.locator('.minigame__done-quote');
  await expect(doneQuote).toBeVisible();
  const quote = (await doneQuote.textContent()) ?? '';
  expect(IAN_RESULT_LINES.some((text) => quote === `Ian: "${text}"`)).toBe(true);

  await page.screenshot({ path: 'test-results/bug-squash-rules/play-and-done-screens/done.png' });

  expect(errors).toEqual([]);
});
