import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: the Icebox's NPCs perform their designed motions. Screenshots (and
 * a short video) go under `test-results/npc-motion-the-icebox/`, one
 * directory per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-the-icebox';
/** `RoomScene`'s NPC click zone sits this far above the feet (`NPC_HIT_ZONE_OFFSET_Y`). */
const HIT_ZONE_OFFSET_Y = -50;
/** All five of this Room's NPCs roam a loop around their slot point. */
const MOVING_NPCS = ['millie-icebox', 'nicole', 'jason', 'jethro', 'darrin-icebox'];

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

/** `?room=the-icebox` boots straight into the Icebox, so no Elevator screen plays. */
async function bootTheIcebox(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=the-icebox');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.jason, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('every Icebox NPC roams its designed loop around its slot point', async ({ page }) => {
  const dir = proofDir('npcs-move');
  const errors = await bootTheIcebox(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);

  const start = await npc(page, 'jason');
  const seen = [start];
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    seen.push(await npc(page, 'jason'));
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // jasRoam heads toward translate(100px, 65px) first: down and right.
  // jasRoam holds at each waypoint for a few percent of its 26s loop, so two
  // of these five samples can legitimately land in the same hold.
  expect(new Set(seen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size).toBeGreaterThan(1);
  const last = seen[seen.length - 1];
  expect(last.x).not.toBeCloseTo(start.x);

  // A close-up of each roaming NPC, to check its bubble/name tag stay put.
  for (const id of MOVING_NPCS) {
    const pos = await npc(page, id);
    await page.screenshot({
      path: `${dir}/${id}-close-up.png`,
      clip: { x: pos.x - 110, y: pos.y - 170, width: 220, height: 210 },
    });
  }

  expect(errors).toEqual([]);
});

test('clicking a roaming Jason pauses him, opens his dialog, and closing it resumes his loop', async ({
  page,
}) => {
  const dir = proofDir('click-pauses');
  const errors = await bootTheIcebox(page);

  // Let him get going, then click his (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'jason');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'jason')).paused).toBe(true);
  const pausedAt = await npc(page, 'jason');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('jason');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Jason Jahnel');

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'jason');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await npc(page, 'jason')).moving).toBe(true);
  // jasRoam holds at each waypoint for a few seconds of its 26s loop: poll
  // rather than a fixed wait, in case the pause landed inside one.
  await expect
    .poll(
      async () => {
        const p = await npc(page, 'jason');
        return p.x !== pausedAt.x || p.y !== pausedAt.y;
      },
      { timeout: 8_000 },
    )
    .toBe(true);
  await page.screenshot({ path: `${dir}/resumed.png` });

  expect(errors).toEqual([]);
});

test('with prefers-reduced-motion, every NPC stands still at its slot tile', async ({ page }) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootTheIcebox(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of theIcebox.npcSlots) {
    const rest = tileToScreen(slot.tile, theIcebox.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of the Icebox NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootTheIcebox(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/the-icebox-npc-motion.webm`);
  await video?.delete();
});
