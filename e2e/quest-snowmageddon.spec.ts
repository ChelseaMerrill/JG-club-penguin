import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';
import './support/badge-popup-types';

/**
 * #154 "Snowmageddon: hit 5 penguins today", end to end on the dev in-memory
 * store: `__questsTest.recordSnowballHit` records 5 distinct hits (no real
 * Snowball mode or second browser needed -- that's
 * `e2e/quest-snowmageddon-two-browsers.spec.ts`'s job), the panel's progress
 * rises to 5 / 5, the Quest claims itself for a QUEST COMPLETE banner paying
 * 75 Tokens, and the Trophy Case then shows Snowmageddon earned (not
 * "coming soon"). Screenshots go under test-results/quest-snowmageddon/<test>/.
 */

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const SHOTS = 'test-results/quest-snowmageddon';
const TITLE = 'Snowmageddon: hit 5 penguins today';

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

test.beforeAll(() => {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?asPlayer&leaderboard=seed&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.evaluate(() => {
    const landing = document.querySelector<HTMLElement>('#ui .landing');
    if (landing) landing.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await expect(page.locator('.quest-widget')).toBeVisible();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}/screenshot.png` });
}

async function tokens(page: Page): Promise<number> {
  return Number(await page.locator('.hud__tokens-value').textContent());
}

test('recording 5 distinct snowball hits today completes the Quest and earns the Badge', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await boot(page);

  const widget = page.locator('.quest-widget');
  await widget.click();
  const panel = page.locator('.quests');
  const row = panel.locator('[data-quest-id="snowmageddon"]');
  await expect(row.locator('.quests__row-title')).toHaveText(TITLE);
  await expect(row.locator('.quests__row-location')).toHaveText('ANYWHERE · SNOWBALL');
  await expect(row.locator('.quests__row-progress')).toHaveText('0 / 5');
  await page.locator('.hud__button--quests').click();

  const before = await tokens(page);

  // Four distinct hits: progress rises, no banner yet.
  for (let i = 1; i <= 4; i += 1) {
    await page.evaluate(
      (n) => window.__questsTest!.recordSnowballHit(`target-${n}`, `throw-${n}`),
      i,
    );
  }
  await widget.click();
  await expect(row.locator('.quests__row-progress')).toHaveText('4 / 5');
  await shot(page, 'four-of-five');
  await page.locator('.hud__button--quests').click();

  // The fifth distinct hit claims the Quest itself: a QUEST COMPLETE banner.
  await page.evaluate(() => window.__questsTest!.recordSnowballHit('target-5', 'throw-5'));

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__heading')).toHaveText('QUEST COMPLETE');
  await expect(banner.locator('.quest-banner__title')).toHaveText(TITLE);
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+75 TOKENS');
  await expect.poll(() => tokens(page)).toBe(before + 75);
  await shot(page, 'quest-complete-banner');

  // The Badge's own +50 popup, via the Session Badge check #154 forces
  // immediately after the completion (progress-session.ts's completeQuest).
  const popup = page.locator('.badge-popup');
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(popup).toContainText('Snowmageddon');
  await expect(popup).toContainText('+50 TOKENS');
  await expect.poll(() => tokens(page)).toBe(before + 125);
  await shot(page, 'snowmageddon-badge-popup');
  await popup.click();
  await expect(popup).toBeHidden();

  // A sixth hit (already complete) adds no further progress.
  const sixth = await page.evaluate(() =>
    window.__questsTest!.recordSnowballHit('target-6', 'throw-6'),
  );
  expect(sixth.counted).toBe(false);

  // The Trophy Case shows Snowmageddon earned, not "coming soon".
  await widget.click();
  await panel.locator('[data-quests-tab="badges"]').click();
  const trophyCase = page.locator('.trophy-case');
  await expect(trophyCase).toBeVisible();
  const badgeTile = trophyCase.locator('[data-badge-id="snowmageddon"]');
  await expect(badgeTile).toBeVisible();
  await expect(badgeTile).toHaveClass(/trophy-case__badge--earned/);
  await expect(badgeTile).not.toHaveClass(/trophy-case__badge--coming-soon/);
  await expect(badgeTile.locator('.trophy-case__badge-icon')).toHaveText('✓');
  await shot(page, 'trophy-case-snowmageddon-earned');

  expect(errors).toEqual([]);
});
