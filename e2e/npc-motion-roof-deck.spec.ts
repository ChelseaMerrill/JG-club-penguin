import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: the Roof Deck's NPCs perform their designed motions. Screenshots
 * (and a short video) go under `test-results/npc-motion-roof-deck/`, one
 * directory per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-roof-deck';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;
/** Kevin and Tristin are Penguins in the design, so they aren't placed (#133). */
const MOVING_NPCS = ['brandon', 'anthony', 'millie'];

test.use({ viewport: { width: 1600, height: 900 } });

function proofDir(name: string): string {
  const dir = `${PROOF_ROOT}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

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

async function npc(page: Page, npcId: string): Promise<NpcMotionDebugInfo> {
  const info = (await debugInfo(page))?.npcs?.[npcId];
  if (!info) throw new Error(`no __roomDebug.npcs entry for ${npcId}`);
  return info;
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** `?room=roof-deck` boots straight into the Roof Deck, so no Elevator screen plays. */
async function bootRoofDeck(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=roof-deck');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.brandon, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('Roof Deck NPCs walk their designed paths; Brandon gallops his loop', async ({ page }) => {
  const dir = proofDir('npcs-move');
  const errors = await bootRoofDeck(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  // Vendors behind their counters keep #36's idle bob and never leave their slot.
  const josh = await npc(page, 'josh');
  const joshRest = tileToScreen({ col: 11, row: 2 }, roofDeck.grid.origin);
  expect(josh).toMatchObject({ x: joshRest.x, y: joshRest.y, moving: false });

  const start = await npc(page, 'brandon');
  const seen = [start];
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    seen.push(await npc(page, 'brandon'));
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // mkBrandonGallop heads down-right toward translate(150px, 75px) first.
  const last = seen[seen.length - 1];
  expect(last.x).toBeGreaterThan(start.x);
  expect(last.y).toBeGreaterThan(start.y);
  expect(new Set(seen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size).toBe(seen.length);

  // A close-up of Brandon on his hobby horse, mid-gallop.
  const now = await npc(page, 'brandon');
  await page.screenshot({
    path: `${dir}/brandon-close-up.png`,
    clip: { x: now.x - 110, y: now.y - 170, width: 220, height: 210 },
  });
  const anthony = await npc(page, 'anthony');
  await page.screenshot({
    path: `${dir}/anthony-rod-close-up.png`,
    clip: { x: anthony.x - 110, y: anthony.y - 170, width: 240, height: 210 },
  });

  expect(errors).toEqual([]);
});

test('clicking a moving Brandon pauses him, opens his dialog, and closing it resumes his loop', async ({
  page,
}) => {
  const dir = proofDir('click-pauses');
  const errors = await bootRoofDeck(page);

  // Let him get going, then click his (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'brandon');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'brandon')).paused).toBe(true);
  const pausedAt = await npc(page, 'brandon');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('brandon');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Brandon Badgett');

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'brandon');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await npc(page, 'brandon')).moving).toBe(true);
  await page.waitForTimeout(1_000);
  const resumed = await npc(page, 'brandon');
  expect(resumed.x !== pausedAt.x || resumed.y !== pausedAt.y).toBe(true);
  await page.screenshot({ path: `${dir}/resumed.png` });

  expect(errors).toEqual([]);
});

test('with prefers-reduced-motion, every NPC stands still at its slot tile', async ({ page }) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootRoofDeck(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of roofDeck.npcSlots) {
    const rest = tileToScreen(slot.tile, roofDeck.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of the Roof Deck NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootRoofDeck(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/roof-deck-npc-motion.webm`);
  await video?.delete();
});
