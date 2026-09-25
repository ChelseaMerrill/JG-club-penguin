import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { tileToScreen } from '../src/game/rooms/iso';
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

/** `?asPlayer`'s `enterSpawnRoom()` always lands on Town Center first (#15 D6), ignoring any `?room=`; every other Room is reached from there via `__roomDebug.changeRoom`. */
async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
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
const stallHotspotCenter = {
  x: stallHotspot.rect.x + stallHotspot.rect.width / 2,
  y: stallHotspot.rect.y + stallHotspot.rect.height / 2,
};

const slot3 = igloo.furnitureSlots?.find((s) => s.id === 'slot-3');
if (!slot3) throw new Error('expected the Igloo to have a slot-3 Furniture slot');
const slot3Point = tileToScreen(slot3.tile, igloo.grid.origin);

async function buyBeanbagAtRoofDeck(page: Page): Promise<void> {
  await changeRoom(page, 'roof-deck');
  // Floor 5 -> the Roof Deck plays the elevator screen (#52) over the Stage
  // first; a click during it never reaches the stall.
  await expect(page.locator('.elevator-screen')).toBeHidden();
  await clickStagePoint(page, stallHotspotCenter);
  await expect(page.locator('.market')).toBeVisible();
  await page.locator('[data-item-id="beanbag"] .market__item-buy').click();
  await expect(page.locator('[data-item-id="beanbag"] .market__item-buy')).toHaveText('OWNED');
  await page.locator('.market__close').click();
  await expect(page.locator('.market')).toBeHidden();
}

test('buying the Beanbag, placing it in slot 3 via edit mode, and it stays there after leaving and re-entering the Igloo (#41)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  await buyBeanbagAtRoofDeck(page);

  // The HUD's own IGLOO button (#15), exercised end to end.
  await page.locator('.hud__button--igloo').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('igloo');

  // Owner-only: the button only shows in the Igloo, for a signed-in Player
  // (`?asPlayer` registers one).
  await expect(page.locator('.igloo-editor__button')).toBeVisible();
  await page.locator('.igloo-editor__button').click();

  // Slot 3's clickable marker opens the picker, without moving the Penguin.
  const moveLogBefore = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
  await clickStagePoint(page, slot3Point);
  await expect(page.locator('.igloo-slot-picker')).toBeVisible();
  await expect(page.locator('.igloo-slot-picker__title')).toHaveText('SLOT 3');
  expect((await debugInfo(page))?.localPenguinMoveLog?.length ?? 0).toBe(moveLogBefore);

  // Only the owned Beanbag plus Empty are listed -- never an item never
  // bought, e.g. the Arcade Cabinet.
  const optionNames = await page.locator('.igloo-slot-picker__option-name').allTextContents();
  expect(optionNames).toEqual(['Empty', 'Beanbag']);
  await expect(page.locator('[data-option-item-id="arcade-cabinet"]')).toHaveCount(0);

  await page.locator('[data-option-item-id="beanbag"]').click();
  await expect(page.locator('.igloo-slot-picker')).toBeHidden();

  // Rendered in its slot (`__roomDebug.furniture`, #41's debug readout).
  await expect.poll(async () => (await debugInfo(page))?.furniture?.['slot-3']).toBe('beanbag');

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/igloo-slots/slot-3-placed.png' });

  // Leaving the Igloo exits edit mode.
  await changeRoom(page, 'town-center');
  await expect(page.locator('.igloo-editor__button')).toBeHidden();

  // Re-entering the Igloo (still the same page session -- a literal page
  // reload needs a signed-in Supabase session, which this e2e run doesn't
  // have; see the execution report for the human check on the deployment)
  // still shows the Beanbag in slot 3.
  await changeRoom(page, 'igloo');
  await expect.poll(async () => (await debugInfo(page))?.furniture?.['slot-3']).toBe('beanbag');
  await expect(page.locator('.igloo-editor__button')).toHaveText('EDIT IGLOO');

  await page.screenshot({ path: 'test-results/igloo-slots/slot-3-after-reentry.png' });

  expect(errors).toEqual([]);
});

test('with no Furniture owned, edit mode shows the hint to visit the Igloo Gear stall (#41)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);
  await changeRoom(page, 'igloo');

  await expect(page.locator('.igloo-editor__button')).toBeVisible();
  await page.locator('.igloo-editor__button').click();

  await expect(page.locator('.igloo-editor__hint')).toBeVisible();
  await expect(page.locator('.igloo-editor__hint')).toHaveText(
    'Visit the Igloo Gear stall on the Roof Deck to buy Furniture.',
  );

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/igloo-slots/no-furniture-hint.png' });

  expect(errors).toEqual([]);
});
