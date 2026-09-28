import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: the Kitchen's NPCs perform their designed motions. Screenshots (and
 * a short video) go under `test-results/npc-motion-the-melt/`, one directory
 * per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-the-melt';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;
const MOVING_NPCS = ['tom'];
/** Tonya and Jesse are Penguins in the design, so they aren't placed (#133). */
const STILL_NPCS = ['chelsea'];
/**
 * Phaser clamps each frame's delta to 16.7ms for its first 120 frames (its
 * TimeStep `panicMax` cool-down), and NPC motions run on that game clock. On a
 * slow frame rate (software WebGL on a loaded machine) the clock then runs
 * far behind the wall clock, so a spec polls, up to this long, for an NPC to
 * move rather than sampling it on a fixed wall-clock schedule.
 */
const MOTION_TIMEOUT = 45_000;

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

/** `?room=the-melt` boots straight into the Kitchen, so no Elevator screen plays. */
async function bootTheMelt(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=the-melt');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.tom, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('the Kitchen: Tom walks his designed path; Chelsea stays put', async ({ page }) => {
  test.slow();
  const dir = proofDir('npcs-move');
  const errors = await bootTheMelt(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  for (const slot of theMelt.npcSlots.filter((slot) => STILL_NPCS.includes(slot.npcId))) {
    const rest = tileToScreen(slot.tile, theMelt.grid.origin);
    expect(await npc(page, slot.npcId)).toMatchObject({ x: rest.x, y: rest.y, moving: false });
  }

  const start = await npc(page, 'tom');
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // tomWalk holds at his slot point for the first 15% of its 16s loop, then
  // heads left and down toward translate(-240px, 60px) (the unit tests pin
  // the exact stop). Poll on the game clock (see MOTION_TIMEOUT) for him to
  // leave his slot point in that direction.
  await expect
    .poll(async () => (await npc(page, 'tom')).x - start.x, { timeout: MOTION_TIMEOUT })
    .toBeLessThan(-1);
  expect((await npc(page, 'tom')).y).toBeGreaterThan(start.y);

  const tom = await npc(page, 'tom');
  await page.screenshot({
    path: `${dir}/tom-close-up.png`,
    clip: { x: tom.x - 110, y: tom.y - 170, width: 220, height: 210 },
  });

  expect(errors).toEqual([]);
});

test('clicking a moving Tom pauses him, opens his dialog, and closing it resumes his walk', async ({
  page,
}) => {
  test.slow();
  const dir = proofDir('click-pauses');
  const errors = await bootTheMelt(page);

  // Let him get going, then click his (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'tom');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'tom')).paused).toBe(true);
  const pausedAt = await npc(page, 'tom');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('tom');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText("Tom O'Neill");
  const grabButton = dialog.getByRole('button', { name: 'GRAB THE POT' });
  await expect(grabButton).toBeVisible();

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'tom');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await npc(page, 'tom')).moving).toBe(true);
  // tomWalk holds position for long stretches of its 16s loop (see the
  // npcs-move test above), so poll on the game clock (see MOTION_TIMEOUT)
  // rather than a fixed wait for his point to actually differ from where he
  // paused.
  await expect
    .poll(
      async () => {
        const p = await npc(page, 'tom');
        return p.x !== pausedAt.x || p.y !== pausedAt.y;
      },
      { timeout: MOTION_TIMEOUT },
    )
    .toBe(true);
  await page.screenshot({ path: `${dir}/resumed.png` });

  expect(errors).toEqual([]);
});

test('with prefers-reduced-motion, every NPC stands still at its slot tile', async ({ page }) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootTheMelt(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of theMelt.npcSlots) {
    const rest = tileToScreen(slot.tile, theMelt.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of the Kitchen NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootTheMelt(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/the-melt-npc-motion.webm`);
  await video?.delete();
});
