import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

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

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);
  return errors;
}

for (const roomId of ['town-center', 'dev-pit', 'the-melt', 'roof-deck'] as const) {
  test(`npcs-${roomId}: NPCs show at their designed positions`, async ({ page }) => {
    const errors = await bootRoom(page, roomId);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/npcs-${roomId}/screenshot.png` });

    expect(errors).toEqual([]);
  });
}

test('Dev Pit: clicking Ian arrives, opens his dialog, and GRAB THE HAMMER opens Bug Squash', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'dev-pit');

  const ian = devPit.npcSlots.find((slot) => slot.npcId === 'ian');
  if (!ian) throw new Error('expected dev-pit to have an "ian" NPC slot');
  const point = tileToScreen(ian.tile, devPit.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Ian Ballard');

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE HAMMER' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('BUG SQUASH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-dev-pit/bug-squash-launched.png' });

  expect(errors).toEqual([]);
});

/**
 * Clicking near Ian's head (not just his own tile centre) still opens his
 * dialog (#36 round-1 review item 6): the hit `Zone` covers roughly
 * feet-105..feet+5, so a click well above the tile centre -- toward the
 * figure's head, not its feet -- must still land on it.
 */
test("Dev Pit: clicking near Ian's head (not just his feet) still opens his dialog", async ({
  page,
}) => {
  const errors = await bootRoom(page, 'dev-pit');

  const ian = devPit.npcSlots.find((slot) => slot.npcId === 'ian');
  if (!ian) throw new Error('expected dev-pit to have an "ian" NPC slot');
  const feetPoint = tileToScreen(ian.tile, devPit.grid.origin);
  // Comfortably inside the hit zone's feet-105..feet+5 vertical range,
  // clearly above the tile centre (toward the head, not the feet).
  const headPoint = { x: feetPoint.x, y: feetPoint.y - 70 };

  await clickStagePoint(page, headPoint);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');
  await expect(page.locator('.npc-dialog')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Roof Deck: clicking Josh arrives, opens his dialog, and WORK A SHIFT opens Snow Cone Stand', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'roof-deck');

  const josh = roofDeck.npcSlots.find((slot) => slot.npcId === 'josh');
  if (!josh) throw new Error('expected roof-deck to have a "josh" NPC slot');
  const point = tileToScreen(josh.tile, roofDeck.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('josh');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Josh Cantor-Stone');

  const grabButton = dialog.getByRole('button', { name: 'WORK A SHIFT' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('SNOW CONE STAND');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-roof-deck/snow-cone-stand-launched.png' });

  expect(errors).toEqual([]);
});

test('The Melt: clicking Tom arrives, opens his dialog, and GRAB THE POT opens Coffee Rush', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'the-melt');

  const tom = theMelt.npcSlots.find((slot) => slot.npcId === 'tom');
  if (!tom) throw new Error('expected the-melt to have a "tom" NPC slot');
  const point = tileToScreen(tom.tile, theMelt.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('tom');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText("Tom O'Neill");

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE POT' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('COFFEE RUSH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-the-melt/coffee-rush-launched.png' });

  expect(errors).toEqual([]);
});

test('Roof Deck: clicking Casey arrives, opens her dialog, and her stall button opens the real Market panel', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'roof-deck');

  const casey = roofDeck.npcSlots.find((slot) => slot.npcId === 'casey');
  if (!casey) throw new Error('expected roof-deck to have a "casey" NPC slot');
  const point = tileToScreen(casey.tile, roofDeck.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('casey');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Casey Snow');

  await dialog.locator('.npc-dialog__actions button').click();

  await expect
    .poll(async () => (await debugInfo(page))?.openStallLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('igloo-gear');
  // #40 is on `main`: the real Market panel opens, not just a logged no-op.
  await expect(page.locator('.market')).toBeVisible();
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});
