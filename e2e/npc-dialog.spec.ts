import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import type { RoomDefinition } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { dialogLinePool } from '../src/npcs/dialog-lines';
import { NPCS } from '../src/npcs/npcs';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #144: NPC dialogs rotate their lines, and quest givers offer "Got any work
 * for me?". Screenshots go under `test-results/npc-dialog/` (local only).
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-dialog';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;

test.use({ viewport: { width: 1600, height: 900 } });

test.beforeAll(() => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
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

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** Reduced motion keeps every NPC standing on its slot tile, so its click point is fixed. */
async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

/** Clicks an NPC at its slot tile and waits for its dialog to open. */
async function openDialog(page: Page, room: RoomDefinition, npcId: string): Promise<void> {
  const slot = room.npcSlots.find((s) => s.npcId === npcId);
  if (!slot) throw new Error(`no ${npcId} slot in ${room.id}`);
  const feet = tileToScreen(slot.tile, room.grid.origin);
  await clickStagePoint(page, { x: feet.x, y: feet.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: LONG_WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText(NPCS[npcId as 'jon'].name);
}

async function closeDialog(page: Page): Promise<void> {
  await page.locator('.npc-dialog__close').click();
  await expect(page.locator('.npc-dialog')).toBeHidden();
}

test("Dev Pit: Ashley's dialog shows a different line each time it opens", async ({ page }) => {
  const errors = await bootRoom(page, 'dev-pit');
  const pool = dialogLinePool(NPCS.ashley);
  const line = page.locator('.npc-dialog__line');

  await openDialog(page, devPit, 'ashley');
  const first = await line.textContent();
  expect(pool).toContain(first);
  await closeDialog(page);

  await openDialog(page, devPit, 'ashley');
  const second = await line.textContent();
  expect(pool).toContain(second);
  expect(second).not.toBe(first);
  await page.screenshot({ path: `${PROOF_DIR}/ashley-dialog.png` });

  expect(errors).toEqual([]);
});

test('Town Center: Jon offers "Got any work for me?" and answers with his nothing-right-now line', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'town-center');

  await openDialog(page, townCenter, 'jon');
  const offer = page.getByRole('button', { name: 'Got any work for me?' });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(page.locator('.npc-dialog__line')).toHaveText(
    'Just enjoy the tour. Sunglasses stay on.',
  );
  await expect(page.locator('.npc-dialog')).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/quest-giver-offer.png` });

  expect(errors).toEqual([]);
});
