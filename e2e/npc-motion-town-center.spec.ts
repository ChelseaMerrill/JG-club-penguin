import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: Town Center's NPCs perform their designed motions. Screenshots (and
 * a short video) go under `test-results/npc-motion-town-center/`, one
 * directory per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-town-center';
/** `RoomScene`'s NPC click zone sits this far above the feet (`NPC_HIT_ZONE_OFFSET_Y`). */
const HIT_ZONE_OFFSET_Y = -50;
const MOVING_NPCS = ['darrin', 'jon', 'sydney'];

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

/** `?room=town-center` boots straight into Town Center, so no Elevator screen plays. */
async function bootTownCenter(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=town-center');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.darrin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('Town Center NPCs walk their designed paths; Darrin pumps his fists, Jon does his trick', async ({
  page,
}) => {
  const dir = proofDir('npcs-move');
  const errors = await bootTownCenter(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  // The Front Desk receptionist is a Penguin-kind NPC, so she isn't placed:
  // only Players appear as Penguins (owner decision, 2026-09-25).
  expect((await debugInfo(page))?.npcs?.['front-desk']).toBeUndefined();

  const start = await npc(page, 'darrin');
  const seen = [start];
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    seen.push(await npc(page, 'darrin'));
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // walkDarrin heads down-right toward translate(300px,150px) first.
  const last = seen[seen.length - 1];
  expect(last.x).toBeGreaterThan(start.x);
  expect(last.y).toBeGreaterThan(start.y);
  expect(new Set(seen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size).toBe(seen.length);

  // Close-ups: Darrin mid-pump with his "hype" flourish, and Jon mid-trick.
  const darrin = await npc(page, 'darrin');
  await page.screenshot({
    path: `${dir}/darrin-pump-close-up.png`,
    clip: { x: darrin.x - 110, y: darrin.y - 170, width: 220, height: 210 },
  });
  const jon = await npc(page, 'jon');
  await page.screenshot({
    path: `${dir}/jon-trick-close-up.png`,
    clip: { x: jon.x - 110, y: jon.y - 170, width: 220, height: 210 },
  });

  expect(errors).toEqual([]);
});

test('clicking a moving Darrin pauses him, opens his dialog, and closing it resumes his loop', async ({
  page,
}) => {
  const dir = proofDir('click-pauses');
  const errors = await bootTownCenter(page);

  // Let him get going, then click his (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'darrin');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'darrin')).paused).toBe(true);
  const pausedAt = await npc(page, 'darrin');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('darrin');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Darrin Jahnel');

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'darrin');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await npc(page, 'darrin')).moving).toBe(true);
  await page.waitForTimeout(1_000);
  const resumed = await npc(page, 'darrin');
  expect(resumed.x !== pausedAt.x || resumed.y !== pausedAt.y).toBe(true);
  await page.screenshot({ path: `${dir}/resumed.png` });

  expect(errors).toEqual([]);
});

test('with prefers-reduced-motion, every NPC stands still at its slot tile', async ({ page }) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootTownCenter(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of townCenter.npcSlots) {
    const rest = tileToScreen(slot.tile, townCenter.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of Town Center NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootTownCenter(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/town-center-npc-motion.webm`);
  await video?.delete();
});
