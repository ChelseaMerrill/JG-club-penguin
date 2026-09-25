import { expect, test, type Page } from '@playwright/test';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

// The seed (`?leaderboard=seed`, src/minigames/dev-leaderboard-seed.ts) gives
// 12 Bug Squash rivals TEST PENGUIN A..L, bests 1500 down to 400 in steps of
// 100, and a completed look named E2E PENGUIN for this session's own Player.

async function playBugSquashToScore(page: Page, score: number): Promise<void> {
  await page.goto('/?minigame=bug-squash&leaderboard=seed');
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.evaluate((s) => window.__minigameTest!.setStubScore(s), score);
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
}

test("leaderboard panel: outside the top 10 shows a gap and the caller's own rank", async ({
  page,
}) => {
  // A score of 250 ranks below all 12 seeded rivals (lowest is 400) -> #13.
  await playBugSquashToScore(page, 250);

  const panel = page.locator('.minigame-leaderboard');
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await expect(panel.locator('.minigame-leaderboard__row')).toHaveCount(11); // top 10 + own
  await expect(panel.locator('.minigame-leaderboard__gap')).toHaveCount(1);

  const topRanks = await panel
    .locator('.minigame-leaderboard__row')
    .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rank));
  expect(topRanks.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)));

  const ownRow = panel.locator('[data-me="true"]');
  await expect(ownRow).toHaveAttribute('data-rank', '13');
  await expect(ownRow.locator('.minigame-leaderboard__name')).toHaveText('E2E PENGUIN');
  await expect(ownRow.locator('.minigame-leaderboard__score')).toHaveText('250');

  await page.screenshot({
    path: 'test-results/minigame-leaderboard/outside-top-10/screenshot.png',
  });
});

test('leaderboard panel: inside the top 10 shows no gap, own row in place', async ({ page }) => {
  // 1250 sits between C's 1300 and D's 1200 -> #4, no gap.
  await playBugSquashToScore(page, 1250);

  const panel = page.locator('.minigame-leaderboard');
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await expect(panel.locator('.minigame-leaderboard__row')).toHaveCount(10);
  await expect(panel.locator('.minigame-leaderboard__gap')).toHaveCount(0);

  const ownRow = panel.locator('[data-me="true"]');
  await expect(ownRow).toHaveAttribute('data-rank', '4');
  await expect(ownRow.locator('.minigame-leaderboard__name')).toHaveText('E2E PENGUIN');
  await expect(ownRow.locator('.minigame-leaderboard__score')).toHaveText('1250');

  await page.screenshot({
    path: 'test-results/minigame-leaderboard/inside-top-10/screenshot.png',
  });
});
