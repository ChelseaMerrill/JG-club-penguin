import { expect, test, type Page } from '@playwright/test';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

// `__roomDebug`'s ambient type comes from `./support/room-debug-types`.
declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
    __questsTest?: QuestsTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const SHOTS = 'test-results/quests';

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

/** Fails the test on any uncaught page error or console error. */
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

/**
 * `?asPlayer` binds a fixture Player and enters Town Center through the real
 * navigator (so `room:enter` fires); `?leaderboard=seed` gives the dev
 * store's Player a finished Penguin (the name gate, #75), so the main
 * Quest starts at 1 / 5 as it does for every real Player.
 */
async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?asPlayer&leaderboard=seed&${query}`);
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

async function changeRoom(page: Page, roomId: RoomDebugInfo['roomId']): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe(roomId);
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}/screenshot.png` });
}

/** Finishes the open Minigame round, waits for it to save, and quits back to the Room. */
async function finishRound(page: Page, finish: () => Promise<void>): Promise<void> {
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();
  await finish();
  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-saving')).toBeHidden();
  await page.locator('.minigame__done .minigame__button--quit').click();
  await expect(page.locator('.minigame')).toHaveCount(0);
}

const toast = (page: Page) => page.locator('.hud__toast');

test('the widget tracks the main Quest and opens the Quests panel; TRACK and BADGES work', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page, 'hud');

  const widget = page.locator('.quest-widget');
  await expect(widget.locator('.quest-widget__label')).toHaveText('QUEST');
  await expect(widget.locator('.quest-widget__count')).toHaveText('1 / 5');
  await expect(widget.locator('.quest-widget__title')).toHaveText(
    'Ship something before the ice melts',
  );
  await expect(widget.locator('.quest-widget__hint-text')).toHaveText(
    'Visit the Dev Pit · DEV PIT',
  );
  await expect(page.locator('.hud__button--quests')).toBeVisible();
  await shot(page, 'widget');

  await widget.click();
  const panel = page.locator('.quests');
  await expect(panel).toBeVisible();
  await expect(widget).toBeHidden();
  // Main + one per registered Minigame (Bug Squash, Pancake Flip, Snow Cone Stand, Coffee Rush).
  await expect(panel.locator('[data-quests-tab="active"]')).toHaveText('ACTIVE · 5');
  await expect(panel.locator('[data-quests-tab="done"]')).toHaveText('DONE · 0');
  await expect(panel.locator('.quests__row')).toHaveCount(5);
  const main = panel.locator('[data-quest-id="main"]');
  await expect(main.locator('.quests__row-progress')).toHaveText('1 / 5');
  await expect(main.locator('.quests__row-location')).toHaveText('MAIN · ANY ROOM');
  await expect(main.locator('.quests__row-reward')).toHaveText('150');
  await expect(main.locator('.quests__row-status')).toHaveText('TRACKING');
  const pancake = panel.locator('[data-quest-id="pancake-flip"]');
  await expect(pancake.locator('.quests__row-location')).toHaveText(
    'THE KITCHEN · TALK TO CHELSEA',
  );
  await expect(pancake.locator('.quests__row-progress')).toHaveText('0 / 20');
  await expect(pancake.locator('.quests__row-reward')).toHaveText('BADGE · +50');
  await shot(page, 'panel');

  // TRACK: the choice moves the widget and survives a reload (device only).
  await pancake.click();
  await panel.locator('.quests__track').click();
  await expect(pancake.locator('.quests__row-status')).toHaveText('TRACKING');
  await page.locator('.hud__button--quests').click();
  await expect(panel).toBeHidden();
  await expect(widget.locator('.quest-widget__title')).toHaveText('Pancake Flip');
  await expect(widget.locator('.quest-widget__hint-text')).toHaveText(
    'Stack 20 in one round · THE KITCHEN',
  );
  await boot(page, 'hud');
  await expect(widget.locator('.quest-widget__title')).toHaveText('Pancake Flip');

  // BADGES opens the Trophy Case, closing the panel.
  await widget.click();
  await panel.locator('[data-quests-tab="badges"]').click();
  await expect(page.locator('.trophy-case')).toBeVisible();
  await expect(panel).toBeHidden();

  expect(errors).toEqual([]);
});

const stallHotspot = roofDeck.hotspots?.find((h) => h.id === 'igloo-gear-stall');
if (!stallHotspot) throw new Error('expected the Roof Deck to have an igloo-gear-stall hotspot');

test('steps complete in any order with 3-second toasts; the main Quest pays 150 once with a QUEST COMPLETE banner', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page, 'minigame=bug-squash');
  const widget = page.locator('.quest-widget');
  await page.evaluate(() => localStorage.clear());

  // Step 3 first: a full Bug Squash round at score 0 (no best) counts.
  await finishRound(page, () => page.evaluate(() => window.__minigameTest!.finishNow()));
  await expect(toast(page)).toHaveText('Quest: Finish a full round of Bug Squash ✓ (2 / 5)');

  // Step 2: the first Dev Pit visit.
  await changeRoom(page, 'dev-pit');
  await expect(toast(page)).toHaveText('Quest: Visit the Dev Pit ✓ (3 / 5)');
  await expect(widget.locator('.quest-widget__count')).toHaveText('3 / 5');
  await shot(page, 'step-toast');
  // The step toast lasts 3 s, not the default 4 s.
  await expect(toast(page)).toBeHidden({ timeout: 3_600 });

  // Step 4: a full Pancake Flip round.
  await page.evaluate(() => window.__minigameTest!.launch('pancake-flip'));
  await finishRound(page, () => page.evaluate(() => window.__minigameTest!.finishPancakeFlipNow()));
  await expect(toast(page)).toHaveText('Quest: Finish a full round of Pancake Flip ✓ (4 / 5)');
  await expect(widget.locator('.quest-widget__hint-text')).toHaveText(
    'Buy at the Igloo Gear stall · THE MARKET',
  );

  // Step 5, last: buy the Beanbag at the Igloo Gear stall.
  await changeRoom(page, 'roof-deck');
  await clickStagePoint(page, {
    x: stallHotspot.rect.x + stallHotspot.rect.width / 2,
    y: stallHotspot.rect.y + stallHotspot.rect.height / 2,
  });
  await expect(page.locator('.market')).toBeVisible();
  await page.locator('[data-item-id="beanbag"] .market__item-buy').click();

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__heading')).toHaveText('QUEST COMPLETE');
  await expect(banner.locator('.quest-banner__title')).toHaveText(
    'Ship something before the ice melts',
  );
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+150 TOKENS');
  // 100 start + 0 + 0 (both rounds scored nothing) - 50 Beanbag + 150 Quest.
  await expect(page.locator('.hud__tokens-value')).toHaveText('200');
  await page.locator('.market__close').click();
  await shot(page, 'quest-complete-banner');

  // The tracked Quest moves on to the next active one.
  await expect(widget.locator('.quest-widget__title')).toHaveText('Bug Squash');
  await expect(widget.locator('.quest-widget__count')).toHaveText('0 / 500');

  // A second purchase re-reads progress but never pays or shows the banner again.
  await expect(banner).toBeHidden({ timeout: 5_000 });
  await page.evaluate(() => window.__questsTest!.purchase('rgb-light-strip'));
  await expect(page.locator('.hud__tokens-value')).toHaveText('140');
  await page.waitForTimeout(500);
  await expect(banner).toBeHidden();

  expect(errors).toEqual([]);
});

test('every Quest done: the widget shows ALL QUESTS DONE with a line and opens the DONE tab', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page, 'hud');
  const widget = page.locator('.quest-widget');

  await changeRoom(page, 'dev-pit');
  await page.evaluate(async () => {
    const t = window.__questsTest!;
    await t.recordRound('bug-squash', 500, { score: 500, squashed: 50, bestCombo: 1, escaped: 0 });
    await t.recordRound('pancake-flip', 0, {
      golden: 0,
      flipNow: 0,
      raw: 0,
      burnt: 0,
      stacked: 20,
      bestStreak: 0,
    });
    await t.recordRound('snow-cone-stand', 0, { cone25: 8 });
    await t.recordRound('coffee-rush', 15, {
      small: 15,
      medium: 0,
      large: 0,
      perfect: 0,
      spilled: 0,
      lost: 0,
    });
    await t.purchase('beanbag');
  });

  await expect(widget.locator('.quest-widget__label')).toHaveText('ALL QUESTS DONE');
  await expect(widget.locator('.quest-widget__title')).toHaveText(
    /^(Overachiever\. Noted\.|Work hard, waddle harder\.|Shipped it\. Go touch snow\.|Nothing left to ship\. Suspicious\.|Excellence is our approach to everything\.)$/,
  );
  await expect(page.locator('.quest-banner')).toBeHidden({ timeout: 6_000 });
  await shot(page, 'all-done-widget');

  await widget.click();
  const panel = page.locator('.quests');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-quests-tab="done"]')).toHaveText('DONE · 5');
  await expect(panel.locator('[data-quests-tab="done"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.quests__row')).toHaveCount(5);

  expect(errors).toEqual([]);
});
