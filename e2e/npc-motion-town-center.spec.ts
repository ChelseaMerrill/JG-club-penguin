import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { npcSlotPoint } from '../src/game/rooms/iso';
import { NPCS } from '../src/npcs/npcs';
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
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;
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

  // Every NPC placed here roams except Jory Hutchins (#137), who stays on
  // her slot and bounces on the couch in place (her `jump`, #150; see the
  // Jory tests below). The design's Front Desk receptionist is a Penguin,
  // so she isn't placed (#133).
  expect(Object.keys((await debugInfo(page))?.npcs ?? {}).sort()).toEqual(
    [...MOVING_NPCS, 'jory'].sort(),
  );
  for (const id of MOVING_NPCS) expect((await npc(page, id)).moving).toBe(true);
  expect((await npc(page, 'jory')).moving).toBe(false);

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

/** Jory's slot point: she never leaves it (#150's `jump` is in place). */
function joryRest(): { x: number; y: number } {
  const slot = townCenter.npcSlots.find((candidate) => candidate.npcId === 'jory');
  if (!slot) throw new Error('Jory has no Town Center slot');
  return npcSlotPoint(slot, townCenter.grid.origin);
}

test('Jory bounces on the couch as the design shows, her nameplate moving with her (#150)', async ({
  page,
}) => {
  const dir = proofDir('jory-jump');
  const errors = await bootTownCenter(page);
  const rest = joryRest();
  const nameplateTopY = npcLayout(NPCS.jory).nameplateTopY;

  // Sample two 0.9 s cycles of `jump`.
  const samples: NpcMotionDebugInfo[] = [];
  const started = Date.now();
  while (Date.now() - started < 1_800) {
    samples.push(await npc(page, 'jory'));
    await page.waitForTimeout(40);
  }
  for (const sample of samples) {
    expect(sample).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(sample.body.x).toBeCloseTo(0, 5);
    expect(sample.body.rotation).toBeCloseTo(0, 5);
  }
  const feetYs = samples.map((s) => rest.y + s.body.y);
  const nameplateYs = samples.map((s) => rest.y + s.body.y + s.body.scaleY * nameplateTopY);
  const scaleYs = samples.map((s) => s.body.scaleY);
  expect(rest.y - Math.min(...feetYs)).toBeGreaterThanOrEqual(20);
  expect(Math.max(...nameplateYs) - Math.min(...nameplateYs)).toBeGreaterThanOrEqual(15);
  expect(Math.min(...scaleYs)).toBeLessThanOrEqual(0.96);
  expect(Math.max(...scaleYs)).toBeGreaterThanOrEqual(1.04);

  // Six close-ups across one cycle.
  for (let frame = 0; frame < 6; frame += 1) {
    await page.screenshot({
      path: `${dir}/f${frame}.png`,
      clip: { x: rest.x - 110, y: rest.y - 190, width: 220, height: 230 },
    });
    await page.waitForTimeout(150);
  }

  expect(errors).toEqual([]);
});

test('clicking a bouncing Jory still opens her dialog, and she keeps bouncing (#150)', async ({
  page,
}) => {
  const dir = proofDir('jory-dialog');
  const errors = await bootTownCenter(page);
  const rest = joryRest();

  await clickStagePoint(page, { x: rest.x, y: rest.y + npcLayout(NPCS.jory).hitArea.centerY });
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('jory');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Jory Hutchins');

  // Her jump is in place, so the dialog doesn't pause it.
  const bodies = new Set<string>();
  for (let sample = 0; sample < 10; sample += 1) {
    const jory = await npc(page, 'jory');
    expect(jory.paused).toBe(false);
    bodies.add(`${jory.body.y.toFixed(2)},${jory.body.scaleY.toFixed(3)}`);
    await page.waitForTimeout(60);
  }
  expect(bodies.size).toBeGreaterThan(1);
  await page.screenshot({ path: `${dir}/open.png` });

  await dialog.locator('.npc-dialog__close').click();
  await expect(dialog).toBeHidden();

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
    const rest = npcSlotPoint(slot, townCenter.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  // Jory doesn't bounce (#150): her figure and nameplate stay untransformed.
  const still = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  expect(first.jory?.body).toEqual(still);
  expect(later.jory?.body).toEqual(still);
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
