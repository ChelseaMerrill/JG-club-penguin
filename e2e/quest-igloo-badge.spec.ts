import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { tileToScreen } from '../src/game/rooms/iso';
import type { RoomFurnitureSlot } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #143: the Igloo Badge Quest end to end against the in-memory store
 * (`?asPlayer`) -- talking to Casey, buying a JG award and hanging it on an
 * igloo wall, driven through the real NPC dialog, Market and Igloo editor
 * UI (not test-only shortcuts). Screenshots go under
 * test-results/quest-igloo-badge/ (local only).
 */

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/quest-igloo-badge';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

test.beforeAll(() => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
});

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

/** Reduced motion keeps every NPC standing on its slot tile, so its click point is stable. */
async function boot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.evaluate(() => {
    const landing = document.querySelector<HTMLElement>('#ui .landing');
    if (landing) landing.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await expect(page.locator('.quest-widget')).toBeVisible();
}

async function changeRoom(page: Page, roomId: RoomDebugInfo['roomId']): Promise<void> {
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

const stallHotspot = roofDeck.hotspots?.find((h) => h.id === 'igloo-gear-stall');
if (!stallHotspot) throw new Error('expected the Roof Deck to have an igloo-gear-stall hotspot');

async function clickCasey(page: Page): Promise<void> {
  const casey = (await debugInfo(page))?.npcs?.casey;
  if (!casey) throw new Error('no casey in __roomDebug.npcs on the Roof Deck');
  await clickStagePoint(page, { x: casey.x, y: casey.y + HIT_ZONE_OFFSET_Y });
}

function slotPoint(slotDef: RoomFurnitureSlot): { x: number; y: number } {
  return slotDef.placement === 'floor'
    ? tileToScreen(slotDef.tile, igloo.grid.origin)
    : slotDef.anchor;
}

function wallSlot(n: number): RoomFurnitureSlot {
  const found = igloo.furnitureSlots?.find((s) => s.id === `slot-${n}`);
  if (!found) throw new Error(`expected the Igloo to have slot-${n}`);
  return found;
}

const toast = (page: Page) => page.locator('.hud__toast');

test('talking to Casey, buying a JG award and hanging it pays the Igloo Badge Quest 75 Tokens', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await boot(page);
  const widget = page.locator('.quest-widget');

  await changeRoom(page, 'roof-deck');

  // Step 1: Casey's "Got any work for me?" starts the Quest and records
  // "talk to Casey".
  await clickCasey(page);
  const dialog = page.locator('.npc-dialog');
  // The local Penguin walks to Casey's interaction tile first.
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Casey Snow');
  const offer = page.getByRole('button', { name: 'Got any work for me?' });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toHaveText('Quest: Talk to Casey at the Igloo Gear stall ✓ (1 / 3)');
  await expect(widget).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_DIR}/talk-to-casey/screenshot.png` });

  // Step 2: buy a JG award at the Igloo Gear stall (the Market).
  await clickStagePoint(page, {
    x: stallHotspot!.rect.x + stallHotspot!.rect.width / 2,
    y: stallHotspot!.rect.y + stallHotspot!.rect.height / 2,
  });
  const market = page.locator('.market');
  await expect(market).toBeVisible();
  const award = page.locator('[data-item-id="award-bptw"]');
  await expect(award.locator('.market__item-name')).toHaveText('Best Places to Work');
  await award.locator('.market__item-buy').click();
  await expect(toast(page)).toHaveText('Quest: Buy a JG award from Casey ✓ (2 / 3)');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_DIR}/buy-jg-award/screenshot.png` });
  await page.locator('.market__close').click();
  await expect(market).toBeHidden();

  // Step 3: hang it on an igloo wall slot. Finishes the Quest.
  await changeRoom(page, 'igloo');
  await page.locator('.igloo-editor__button').click();
  await clickStagePoint(page, slotPoint(wallSlot(7)));
  const picker = page.locator('.igloo-slot-picker');
  await expect(picker).toBeVisible();
  await page.locator('[data-option-item-id="award-bptw"]').click();
  await expect(picker).toBeHidden();

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__heading')).toHaveText('QUEST COMPLETE');
  await expect(banner.locator('.quest-banner__title')).toHaveText(
    'Decorate your igloo with a JG badge',
  );
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+75 TOKENS');
  // 100 start - 60 (award) + 75 (Quest).
  await expect(page.locator('.hud__tokens-value')).toHaveText('115');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_DIR}/quest-complete/screenshot.png` });

  expect(errors).toEqual([]);
});
