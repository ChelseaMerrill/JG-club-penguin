import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { npcSlotPoint } from '../src/game/rooms/iso';
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
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;
/** Nicole and Jethro roam a loop around their slot point; Millie, Jason and
 *  Darrin left the Icebox (owner request, 2026-10-02, Track D). */
const MOVING_NPCS = ['nicole', 'jethro'];
/** New from the Characters sheet: they sit at the conference table. */
const SEATED_NPCS = ['dan-bedian', 'paul-carnival', 'greg-westover'];
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
    .poll(async () => (await debugInfo(page))?.npcs?.nicole, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('Nicole and Jethro roam their loops; the three at the table stay seated', async ({ page }) => {
  test.slow();
  const dir = proofDir('npcs-move');
  const errors = await bootTheIcebox(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  for (const id of SEATED_NPCS) {
    const slot = theIcebox.npcSlots.find((s) => s.npcId === id)!;
    const seat = npcSlotPoint(slot, theIcebox.grid.origin);
    expect(await npc(page, id)).toMatchObject({ x: seat.x, y: seat.y, moving: false });
  }

  const start = await npc(page, 'nicole');
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // nicRoam holds for the first 15% of its 26s loop, then heads toward
  // translate(70px, -40px): right and up. Poll on the game clock (see
  // MOTION_TIMEOUT) for her to leave her start that way.
  await expect
    .poll(async () => (await npc(page, 'nicole')).x - start.x, { timeout: MOTION_TIMEOUT })
    .toBeGreaterThan(1);
  expect((await npc(page, 'nicole')).y).toBeLessThan(start.y);

  // A close-up of each NPC, to check its bubble/name tag stay put and the
  // table covers the three sitting at it.
  for (const id of [...MOVING_NPCS, ...SEATED_NPCS]) {
    const pos = await npc(page, id);
    await page.screenshot({
      path: `${dir}/${id}-close-up.png`,
      clip: { x: pos.x - 110, y: pos.y - 170, width: 220, height: 210 },
    });
  }

  expect(errors).toEqual([]);
});

test('clicking a roaming Nicole pauses her, opens her dialog, and closing it resumes her loop', async ({
  page,
}) => {
  test.slow();
  const dir = proofDir('click-pauses');
  const errors = await bootTheIcebox(page);

  // Click her (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'nicole');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'nicole')).paused).toBe(true);
  const pausedAt = await npc(page, 'nicole');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('nicole');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Nicole Roberts');

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'nicole');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await npc(page, 'nicole')).moving).toBe(true);
  // nicRoam holds at each waypoint for a few seconds of its 26s loop: poll on
  // the game clock (see MOTION_TIMEOUT) rather than a fixed wait, in case the
  // pause landed inside one.
  await expect
    .poll(
      async () => {
        const p = await npc(page, 'nicole');
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
  const errors = await bootTheIcebox(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of theIcebox.npcSlots) {
    const rest = npcSlotPoint(slot, theIcebox.grid.origin);
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
