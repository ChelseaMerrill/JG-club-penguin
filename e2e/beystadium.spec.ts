import { expect, test, type Page } from '@playwright/test';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

/** Beystadium's engine ticks every 50 ms (the design's `setInterval(this.tick, 50)`). */
const TICK_MS = 50;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('beystadium: pick a Bey, perfect launch, strike, dodge, MATCH OVER', async ({ page }) => {
  const errors = collectErrors(page);

  // Installed before navigation, like e2e/coffee-rush.spec.ts, so the
  // game's 50 ms `setInterval` is faked from the first script run.
  await page.clock.install();
  // The Minigame test launcher; the test below starts it from Michael.
  await page.goto('/?minigame=beystadium');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toHaveText(
    'BEYSTADIUM · BEST OF 3 · VS MICHAEL',
  );
  await page.locator('.minigame__button--start').click();

  // Pick screen: the three Beys from the design; pick AVALANCHE.
  await expect(page.locator('.beystadium__pick')).toBeVisible();
  await expect(page.locator('.beystadium__bey-name')).toHaveText([
    'GLACIER',
    'AVALANCHE',
    'PERMAFROST',
  ]);
  await page.locator('[data-bey="1"]').click();
  await expect(page.locator('[data-bey="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/beystadium/pick.png' });

  // Freeze the page clock before the launch meter starts, so exactly 20
  // ticks run below: the meter sweeps 3.4 a tick, landing on 68, inside
  // the cyan zone [66, 86].
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1_000);
  await page.locator('.beystadium__to-stadium').click();
  await expect(page.locator('.beystadium__launch')).toBeVisible();
  await expect(page.locator('.beystadium__banner')).toHaveText('ROUND 1');
  await page.clock.runFor(20 * TICK_MS);
  await page.keyboard.press('Space');

  await expect(page.locator('.beystadium__fight')).toBeVisible();
  await expect(page.locator('.beystadium__clash')).toHaveText('PERFECT LAUNCH');
  await expect(page.locator('.beystadium__my-spin')).toHaveText('100');
  await expect(page.locator('.beystadium__my-name')).toHaveText('YOU · AVALANCHE');

  // The strike ring's cyan zone opens 1.55 s (31 ticks) into the fight.
  await page.clock.runFor(31 * TICK_MS);
  await expect(page.locator('.beystadium__ring-label')).toHaveText('STRIKE!');
  await page.keyboard.press('Space');
  await expect(page.locator('.beystadium__clash')).toHaveText('STRIKE!');
  await expect(page.locator('[data-counter="score"]')).toHaveText('1');

  // X arms a dodge (the ring now reads DODGING until the zone reopens).
  await page.clock.runFor(10 * TICK_MS);
  await page.keyboard.press('x');
  await expect(page.locator('.beystadium__clash')).toHaveText('DODGE READY');
  await expect(page.locator('.beystadium__ring-label')).toHaveText('DODGING');
  await page.screenshot({ path: 'test-results/beystadium/battle.png' });

  // A full best of 3 isn't worth playing out tick by tick here (the shell
  // test plays whole matches through the real store); the finish hook ends
  // the match as it stands, which pays as a loss.
  await page.evaluate(() => window.__minigameTest!.finishBeystadiumNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-kicker')).toHaveText('MATCH OVER');
  await expect(page.locator('.minigame__done-title')).toHaveText('3-0. AGAIN.');
  await expect(page.locator('[data-done-stat="match"] .minigame__done-stat-value')).toHaveText(
    '0 – 0',
  );
  await expect(page.locator('[data-done-stat="score"] .minigame__done-stat-label')).toHaveText(
    'STRIKES LANDED',
  );
  await expect(page.locator('[data-done-stat="score"] .minigame__done-stat-value')).toHaveText('1');
  await expect(
    page.locator('[data-done-stat="perfectLaunches"] .minigame__done-stat-value'),
  ).toHaveText('1');
  await expect(page.locator('.minigame__done-saving')).toBeHidden();
  await expect(page.locator('[data-done-stat="tokens"] .minigame__done-stat-value')).toHaveText(
    '+15',
  );
  await expect(page.locator('.minigame__done-quote')).toHaveText(
    'Michael: "Told you. Rematch whenever you want to lose again."',
  );
  await page.screenshot({ path: 'test-results/beystadium/done.png' });

  expect(errors).toEqual([]);
});

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

test('Team Room 4: Michael challenges you, BACK AWAY SLOWLY closes, LET IT RIP opens Beystadium (#121)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto(`/?room=${teamRoom4.id}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: 15_000 })
    .not.toBeUndefined();
  expect((await debugInfo(page))?.roomId).toBe('team-room-4');
  // Team Room 4 is on another floor: wait out the elevator screen, if any.
  await expect(page.locator('.elevator-screen')).toBeHidden();

  const michael = teamRoom4.npcSlots.find((slot) => slot.npcId === 'michael');
  if (!michael) throw new Error('expected team-room-4 to have a "michael" NPC slot');
  const michaelPoint = tileToScreen(michael.tile, teamRoom4.grid.origin);

  await clickStagePoint(page, michaelPoint);
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: 15_000 })
    .toContain('michael');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Michael Prete');
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText(
    'THE POD · IT ASSOCIATE · BEYSTADIUM CHAMP',
  );
  await expect(dialog).toContainText("You walked into the Pod. That's a challenge.");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/beystadium/michael-dialog.png' });

  await dialog.getByRole('button', { name: 'BACK AWAY SLOWLY' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeHidden();

  await clickStagePoint(page, michaelPoint);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'LET IT RIP' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toHaveText(
    'BEYSTADIUM · BEST OF 3 · VS MICHAEL',
  );
  await page.screenshot({ path: 'test-results/beystadium/launched-from-michael.png' });

  expect(errors).toEqual([]);
});
