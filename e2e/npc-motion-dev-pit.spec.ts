import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: the Dev Pit's NPCs perform their designed motions. Screenshots (and
 * a short video) go under `test-results/npc-motion-dev-pit/`, one directory
 * per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-dev-pit';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;
/** Ian walks an authored loop (owner request, 2026-09-25, Track D), Ryan
 *  walks-and-dances, Sam walks-and-spins. Dom was removed from this Room
 *  (same request). */
const MOVING_NPCS = ['ian', 'ryan', 'sam'];
/** Ashley and Steven stay at their slot: Steven's scribbling pen is an
 *  in-place prop only, so his own feet never move. */
const STILL_NPCS = ['ashley', 'steven'];

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

/** `?room=dev-pit` boots straight into the Dev Pit, so no Elevator screen plays. */
async function bootDevPit(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=dev-pit');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.steven, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test('Dev Pit NPCs perform their designed motions: Ian, Ryan and Sam walk', async ({ page }) => {
  const dir = proofDir('npcs-move');
  const errors = await bootDevPit(page);

  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  // Ashley and Steven never leave their slot tile.
  for (const id of STILL_NPCS) {
    const slot = devPit.npcSlots.find((s) => s.npcId === id);
    if (!slot) throw new Error(`expected dev-pit to have a "${id}" NPC slot`);
    const rest = tileToScreen(slot.tile, devPit.grid.origin);
    expect(await npc(page, id)).toMatchObject({ x: rest.x, y: rest.y, moving: false });
  }
  // Dom removed from the Dev Pit (owner request, 2026-09-25, Track D): no
  // slot, and no `__roomDebug.npcs` entry either.
  expect(devPit.npcSlots.some((slot) => slot.npcId === 'dom')).toBe(false);
  expect((await debugInfo(page))?.npcs?.dom).toBeUndefined();

  const start = await npc(page, 'ian');
  const seen = [start];
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    seen.push(await npc(page, 'ian'));
    await page.screenshot({ path: `${dir}/t${shot * 1.5}s.png` });
  }
  // ianWalk's first leg heads toward translate(-50px,-25px): west and up.
  // ianWalk holds at each waypoint for a few percent of its 18s loop, so
  // two of these five samples can legitimately land in the same hold.
  const last = seen[seen.length - 1];
  expect(new Set(seen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size).toBeGreaterThan(1);
  expect(last.x).not.toBeCloseTo(start.x);

  // Close-ups: Ian mid-walk, Ryan and Sam with their scribbling pens, and
  // Steven at his slot (still, but his pen prop moves in place).
  const ian = await npc(page, 'ian');
  await page.screenshot({
    path: `${dir}/ian-walk-close-up.png`,
    clip: { x: ian.x - 110, y: ian.y - 170, width: 220, height: 210 },
  });
  const ryan = await npc(page, 'ryan');
  await page.screenshot({
    path: `${dir}/ryan-scribble-close-up.png`,
    clip: { x: ryan.x - 110, y: ryan.y - 170, width: 220, height: 210 },
  });
  const sam = await npc(page, 'sam');
  await page.screenshot({
    path: `${dir}/sam-scribble-close-up.png`,
    clip: { x: sam.x - 110, y: sam.y - 170, width: 220, height: 210 },
  });
  const steven = await npc(page, 'steven');
  await page.screenshot({
    path: `${dir}/steven-scribble-close-up.png`,
    clip: { x: steven.x - 110, y: steven.y - 170, width: 220, height: 210 },
  });

  expect(errors).toEqual([]);
});

test('clicking a walking Ian pauses him, opens his dialog, and GRAB THE HAMMER opens Bug Squash (then resumes his loop)', async ({
  page,
}) => {
  const dir = proofDir('click-pauses');
  const errors = await bootDevPit(page);

  // Let him get going, then click his (moving) click target.
  await page.waitForTimeout(2_000);
  const before = await npc(page, 'ian');
  await clickStagePoint(page, { x: before.x, y: before.y + HIT_ZONE_OFFSET_Y });

  await expect.poll(async () => (await npc(page, 'ian')).paused).toBe(true);
  const pausedAt = await npc(page, 'ian');
  expect(pausedAt.moving).toBe(false);
  expect(Math.hypot(pausedAt.x - before.x, pausedAt.y - before.y)).toBeLessThan(30);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Ian Ballard');

  await page.waitForTimeout(1_000);
  const stillPaused = await npc(page, 'ian');
  expect(stillPaused).toMatchObject({ x: pausedAt.x, y: pausedAt.y, paused: true });
  await page.screenshot({ path: `${dir}/paused-with-dialog.png` });

  // GRAB THE HAMMER launches Bug Squash and closes the dialog (still true
  // now that Ian moves -- `npc-dialog.ts` emits `npc:dialog-closed` however
  // the dialog closes, which is what resumes a paused, roaming NPC's loop).
  const grabButton = dialog.getByRole('button', { name: 'GRAB THE HAMMER' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('BUG SQUASH');
  await expect(dialog).toBeHidden();

  await expect.poll(async () => (await npc(page, 'ian')).moving).toBe(true);
  // ianWalk holds at each waypoint for a few percent of its 18s loop: poll
  // rather than a fixed wait, in case the pause landed inside one.
  await expect
    .poll(
      async () => {
        const p = await npc(page, 'ian');
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
  const errors = await bootDevPit(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of devPit.npcSlots) {
    const rest = tileToScreen(slot.tile, devPit.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of the Dev Pit NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootDevPit(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/dev-pit-npc-motion.webm`);
  await video?.delete();
});
