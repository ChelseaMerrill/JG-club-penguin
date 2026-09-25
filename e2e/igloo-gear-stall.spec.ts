import { expect, test, type Page } from '@playwright/test';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

// `__roomDebug`'s ambient type comes from `./support/room-debug-types`;
// `__minigameTest` is this spec's own.
declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Hides the signed-out Landing page, the same way `e2e/click-to-move.spec.ts` does. */
async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

/** `window.__roomDebug`, deep-cloned across the page boundary. */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

const stallHotspot = roofDeck.hotspots?.find((h) => h.id === 'igloo-gear-stall');
if (!stallHotspot) throw new Error('expected the Roof Deck to have an igloo-gear-stall hotspot');
const hotspotCenter = {
  x: stallHotspot.rect.x + stallHotspot.rect.width / 2,
  y: stallHotspot.rect.y + stallHotspot.rect.height / 2,
};

test('the Igloo Gear hotspot opens the Market, buying the Beanbag updates the balance, and an unaffordable item fails without changing it', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?room=roof-deck');
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);
  expect((await debugInfo(page))?.roomId).toBe('roof-deck');

  await clickStagePoint(page, hotspotCenter);

  await expect(page.locator('.market')).toBeVisible();
  await expect(page.locator('[data-tab="igloo"]')).toHaveText('IGLOO');
  await expect(page.locator('.market__balance')).toHaveText('BALANCE 100');

  const beanbag = page.locator('[data-item-id="beanbag"]');
  await expect(beanbag.locator('.market__item-name')).toHaveText('Beanbag');
  await expect(beanbag.locator('.market__item-price-value')).toHaveText('50');
  await beanbag.locator('.market__item-buy').click();

  await expect(beanbag.locator('.market__item-buy')).toHaveText('OWNED');
  await expect(beanbag).toHaveClass(/market__item--owned/);
  await expect(page.locator('.market__balance')).toHaveText('BALANCE 50');
  // The HUD's own balance (already wired to `tokens:changed`, #34) updates too.
  await expect(page.locator('.hud__tokens-value')).toHaveText('50');

  const arcadeCabinet = page.locator('[data-item-id="arcade-cabinet"]');
  await expect(arcadeCabinet.locator('.market__item-price-value')).toHaveText('250');
  await arcadeCabinet.locator('.market__item-buy').click();

  await expect(page.locator('.market__error')).toHaveText('Not enough tokens');
  await expect(page.locator('.market__balance')).toHaveText('BALANCE 50');
  await expect(arcadeCabinet.locator('.market__item-buy')).toHaveText('BUY');
  await expect(arcadeCabinet).not.toHaveClass(/market__item--owned/);

  // Close and reopen: the Beanbag is still OWNED within this Session (#40
  // resolved decision 3 -- surviving an actual page reload needs a signed-in
  // Supabase session, which this e2e run doesn't have; see the execution
  // report for the human check on the deployment).
  await page.locator('.market__close').click();
  await expect(page.locator('.market')).toBeHidden();
  await clickStagePoint(page, hotspotCenter);
  await expect(page.locator('.market')).toBeVisible();
  await expect(beanbag.locator('.market__item-buy')).toHaveText('OWNED');
  await expect(beanbag).toHaveClass(/market__item--owned/);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/igloo-gear-stall/screenshot.png' });

  // No move: the hotspot opens the Market immediately, without walking there.
  const info = await debugInfo(page);
  expect(info?.localPenguinMoveLog).toEqual([]);

  expect(errors).toEqual([]);
});
