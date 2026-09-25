import { expect, test, type Page } from '@playwright/test';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** `window.__roomDebug`, deep-cloned across the page boundary (functions never survive this). */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`, the same wait `room-transitions.spec.ts` uses. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box (`room-transitions.spec.ts`'s own helper). */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

const kitchenDoor = roofDeck.doors.find((door) => door.label === 'KITCHEN');
if (!kitchenDoor) throw new Error('expected the Roof Deck to have a KITCHEN door');
const hotspotCentre = {
  x: kitchenDoor.hotspot.x + kitchenDoor.hotspot.width / 2,
  y: kitchenDoor.hotspot.y + kitchenDoor.hotspot.height / 2,
};

// #100: the 2026-09-25 design resync (PR #101) adds a blinking "KITCHEN"
// floor arrow to the Roof Deck, this Room's first door -- see
// `src/game/rooms/definitions/roof-deck.ts`'s door for how its hotspot and
// the Kitchen's own entryTile were traced from the design.
test('roof-deck-kitchen-exit: clicking the KITCHEN arrow walks the Penguin to the Kitchen at its entry tile (#100)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('roof-deck');

  // The blinking arrow, frozen in its visible state by `export:room-art`
  // (#100 D1), baked into `public/rooms/roof-deck.png`.
  await page.screenshot({ path: 'test-results/roof-deck-kitchen-exit/roof-deck-arrow.png' });

  await clickStagePoint(page, hotspotCentre);

  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('the-melt');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(kitchenDoor.entryTile);
  await expect(page.locator('.hud__title')).toHaveText(/^the kitchen$/i);

  // Exactly `[leave roof-deck, enter the-melt]` at the tail of the log --
  // the leave/enter pair this one door click produced, whatever came before
  // it (the Session's own initial Town Center enter, then the `changeRoom`
  // above).
  const log = (await debugInfo(page))?.roomEventLog;
  expect(log?.slice(-2)).toEqual([
    { type: 'room:leave', roomId: 'roof-deck' },
    { type: 'room:enter', roomId: 'the-melt' },
  ]);

  await page.screenshot({ path: 'test-results/roof-deck-kitchen-exit/the-kitchen-arrival.png' });

  expect(errors).toEqual([]);
});
