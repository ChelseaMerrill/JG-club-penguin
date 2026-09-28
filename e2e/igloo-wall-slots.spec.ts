import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_LOOK, type RoomId } from '../src/contracts';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { CEILING_FURNITURE_DEPTH, tileToScreen } from '../src/game/rooms/iso';
import type { RoomFurnitureSlot } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { IGLOO_GEAR_CATALOG } from '../src/persistence/minigame-rules';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

// #135: the Igloo's wall and ceiling slots, end to end against the
// in-memory store (`?asPlayer`). Screenshots go to
// test-results/igloo-wall-slots/ (local only).

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const SHOTS = 'test-results/igloo-wall-slots';

/** Fails the test on any uncaught page error, console error or failed request. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
  await expect(page.locator('.elevator-screen')).toBeHidden();
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

function slotPoint(slot: RoomFurnitureSlot): { x: number; y: number } {
  return slot.placement === 'floor' ? tileToScreen(slot.tile, igloo.grid.origin) : slot.anchor;
}

function slot(n: number): RoomFurnitureSlot {
  const found = igloo.furnitureSlots?.find((s) => s.id === `slot-${n}`);
  if (!found) throw new Error(`expected the Igloo to have slot-${n}`);
  return found;
}

/**
 * Earns enough Tokens for the whole catalog (1,290), then buys every item.
 * One round of each Minigame: each has its own round interval, so no wait.
 */
async function buyEverything(page: Page): Promise<void> {
  await page.evaluate(
    async (ids) => {
      const t = window.__questsTest!;
      await t.recordRound('bug-squash', 500, {
        score: 500,
        squashed: 50,
        bestCombo: 1,
        escaped: 0,
      });
      await t.recordRound('pancake-flip', 0, {
        golden: 20,
        flipNow: 0,
        raw: 0,
        burnt: 0,
        stacked: 20,
        bestStreak: 0,
      });
      await t.recordRound('snow-cone-stand', 0, { cone25: 30 });
      await t.recordRound('coffee-rush', 15, { small: 0, medium: 0, large: 30, perfect: 20 });
      for (const id of ids) await t.purchase(id);
    },
    IGLOO_GEAR_CATALOG.map((item) => item.id),
  );
}

async function openPickerFor(page: Page, n: number): Promise<void> {
  await clickStagePoint(page, slotPoint(slot(n)));
  await expect(page.locator('.igloo-slot-picker')).toBeVisible();
}

async function place(page: Page, n: number, itemId: string): Promise<void> {
  await openPickerFor(page, n);
  await page.locator(`[data-option-item-id="${itemId}"]`).click();
  await expect(page.locator('.igloo-slot-picker')).toBeHidden();
  await expect.poll(async () => (await debugInfo(page))?.furniture?.[`slot-${n}`]).toBe(itemId);
}

const WALL_ITEM_NAMES = IGLOO_GEAR_CATALOG.filter((item) => item.placement === 'wall')
  .map((item) => item.name)
  .sort();
const FLOOR_ITEM_NAMES = IGLOO_GEAR_CATALOG.filter((item) => item.placement === 'floor')
  .map((item) => item.name)
  .sort();

/** The picker's option names: 'Empty' first, then the owned items (in acquisition order, so sorted here). */
async function pickerNames(page: Page): Promise<string[]> {
  const [first, ...rest] = await page.locator('.igloo-slot-picker__option-name').allTextContents();
  return [first, ...rest.sort()];
}

test('hangs a wall item, moves it between wall slots, keeps it after re-entering, and fills every slot type (#135)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);
  await buyEverything(page);

  await changeRoom(page, 'igloo');
  await page.locator('.igloo-editor__button').click();

  // A wall slot lists only the owned wall items (including the awards).
  await openPickerFor(page, 7);
  await expect(page.locator('.igloo-slot-picker__title')).toHaveText('SLOT 7 · WALL');
  expect(await pickerNames(page)).toEqual(['Empty', ...WALL_ITEM_NAMES]);
  await page.locator('[data-option-item-id="jg-pennant"]').click();
  await expect.poll(async () => (await debugInfo(page))?.furniture?.['slot-7']).toBe('jg-pennant');

  // Moving it to another wall slot empties the first.
  await place(page, 9, 'jg-pennant');
  expect((await debugInfo(page))?.furniture?.['slot-7']).toBeNull();

  // The ceiling slot lists only the Disco Ball; a floor slot no wall,
  // ceiling or award item.
  await openPickerFor(page, 11);
  await expect(page.locator('.igloo-slot-picker__title')).toHaveText('SLOT 11 · CEILING');
  expect(await pickerNames(page)).toEqual(['Empty', 'Disco Ball']);
  await page.locator('.igloo-slot-picker__close').click();
  await openPickerFor(page, 1);
  await expect(page.locator('.igloo-slot-picker__title')).toHaveText('SLOT 1 · FLOOR');
  expect(await pickerNames(page)).toEqual(['Empty', ...FLOOR_ITEM_NAMES]);
  await page.locator('.igloo-slot-picker__close').click();

  // Still there after leaving and re-entering the Igloo.
  await changeRoom(page, 'town-center');
  await changeRoom(page, 'igloo');
  await expect.poll(async () => (await debugInfo(page))?.furniture?.['slot-9']).toBe('jg-pennant');

  // Fill every slot type: the five floor items (a Player owns each item
  // once, so with five floor items one floor slot stays empty), two awards
  // and two other wall items, and the Disco Ball.
  await page.locator('.igloo-editor__button').click();
  const floorIds = IGLOO_GEAR_CATALOG.filter((item) => item.placement === 'floor').map(
    (item) => item.id,
  );
  for (const [i, id] of floorIds.entries()) await place(page, i + 1, id);
  await place(page, 7, 'award-bptw');
  await place(page, 8, 'award-inc5000');
  await place(page, 10, 'ship-it-sign');
  await place(page, 11, 'disco-ball');
  await page.locator('.igloo-editor__button').click();
  await expect(page.locator('.igloo-editor__button')).toHaveText('EDIT IGLOO');

  expect((await debugInfo(page))?.furniture).toEqual({
    'slot-1': floorIds[0],
    'slot-2': floorIds[1],
    'slot-3': floorIds[2],
    'slot-4': floorIds[3],
    'slot-5': floorIds[4],
    'slot-6': null,
    'slot-7': 'award-bptw',
    'slot-8': 'award-inc5000',
    'slot-9': 'jg-pennant',
    'slot-10': 'ship-it-sign',
    'slot-11': 'disco-ball',
  });

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/all-slots-filled.png` });

  // The other wall items and the third award, so all the wall art is seen.
  await page.locator('.igloo-editor__button').click();
  await place(page, 7, 'award-top-workplaces');
  await place(page, 8, 'dartboard');
  await place(page, 9, 'framed-team-photo');
  await place(page, 10, 'rgb-light-strip');
  await page.locator('.igloo-editor__button').click();
  await page.screenshot({ path: `${SHOTS}/all-slots-filled-alt-wall-items.png` });

  // #161 review (milliehime): a Player's name tag and chat bubble draw above
  // the Disco Ball; only the Penguin's body keeps its Tile depth.
  const local = (await debugInfo(page))?.localPenguin;
  expect(local?.nameTagDepth).toBeGreaterThan(CEILING_FURNITURE_DEPTH);
  // A named Penguin just under the ball, so the screenshot shows its tag on top.
  await page.evaluate((look) => window.__roomDebug?.spawnDebugPenguin?.({ col: 2, row: 1 }, look), {
    ...DEFAULT_LOOK,
    name: 'Under The Ball',
  });
  await page.screenshot({ path: `${SHOTS}/name-tag-over-disco-ball.png` });

  expect(errors).toEqual([]);
});

test('edit mode outlines the empty wall and ceiling slots, and only in edit mode (#135)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await changeRoom(page, 'igloo');

  await page.screenshot({ path: `${SHOTS}/not-editing-no-outlines.png` });
  await page.locator('.igloo-editor__button').click();
  await expect(page.locator('.igloo-editor__button')).toHaveText('DONE EDITING');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/edit-mode-empty-outlines.png` });

  // A click on an empty wall slot's outline opens its picker, not a walk.
  const moves = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
  await openPickerFor(page, 10);
  await expect(page.locator('.igloo-slot-picker__title')).toHaveText('SLOT 10 · WALL');
  await expect(page.locator('.igloo-slot-picker__hint')).toHaveText(
    'Nothing to hang here yet. Buy wall items at the Igloo Gear stall.',
  );
  expect((await debugInfo(page))?.localPenguinMoveLog?.length ?? 0).toBe(moves);

  expect(errors).toEqual([]);
});

test('the Market shows the three JG award cards with their logos and the wall line (#135)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await changeRoom(page, 'roof-deck');

  const stall = roofDeck.hotspots?.find((h) => h.id === 'igloo-gear-stall');
  if (!stall) throw new Error('expected the igloo-gear-stall hotspot');
  await clickStagePoint(page, {
    x: stall.rect.x + stall.rect.width / 2,
    y: stall.rect.y + stall.rect.height / 2,
  });
  await expect(page.locator('.market')).toBeVisible();

  for (const [id, alt] of [
    ['award-bptw', 'Best Places to Work'],
    ['award-inc5000', 'Inc. 5000'],
    ['award-top-workplaces', 'Top Workplaces'],
  ]) {
    const card = page.locator(`[data-item-id="${id}"]`);
    await expect(card.locator('.market__item-placement')).toHaveText('Hangs on the wall');
    const img = card.locator('.market__item-icon img');
    await expect(img).toHaveAttribute('alt', alt);
    // The logo actually decoded (no broken image).
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(
      true,
    );
  }
  await expect(page.locator('[data-item-id="disco-ball"] .market__item-placement')).toHaveText(
    'Hangs from the ceiling',
  );

  await page.locator('[data-item-id="award-bptw"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/market-award-cards.png` });

  expect(errors).toEqual([]);
});
