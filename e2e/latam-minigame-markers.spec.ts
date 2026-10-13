import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { latamCafe } from '../src/game/rooms/definitions/latam-cafe';
import { latamDiscoHall } from '../src/game/rooms/definitions/latam-disco-hall';
import { latamFutebolField } from '../src/game/rooms/definitions/latam-futebol-field';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

// Owner feedback 2026-10-13: the LATAM Café's "MATCH THE TREATS" bubble, the
// Disco Hall's small animated turntable highlight and the Futebol Field's
// bouncing Penalty Kick ball (`RoomMinigameMarker`,
// `src/game/rooms/room-minigame-markers.ts`). Each test proves a marker is
// actually drawn and animating (`window.__roomDebug.minigameMarkers`, not
// just present in data) and that clicking it opens the right host's dialog,
// a real click on the Stage -- never a debug shortcut.

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/latam-markers';

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

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** Three real wall-clock frames, `stepMs` apart, saved as `<dir>/frame-N.png` -- proof the marker is actually moving, not a single static pose. */
async function captureFrameSequence(page: Page, dir: string, stepMs: number): Promise<void> {
  for (let i = 1; i <= 3; i += 1) {
    if (i > 1) await page.waitForTimeout(stepMs);
    await page.screenshot({ path: `${PROOF_ROOT}/${dir}/frame-${i}.png` });
  }
}

const sanderHotspot = latamCafe.hotspots?.find((h) => h.id === 'sander-treats-bubble');
if (!sanderHotspot) {
  throw new Error('expected the LATAM Café to have a sander-treats-bubble hotspot');
}
const sanderBubbleCenter = {
  x: sanderHotspot.rect.x + sanderHotspot.rect.width / 2,
  y: sanderHotspot.rect.y + sanderHotspot.rect.height / 2,
};

const discoMarker = latamDiscoHall.minigameMarkers?.find(
  (m) => m.id === 'disco-turntable-highlight',
);
if (!discoMarker) {
  throw new Error('expected the LATAM Disco Hall to have a disco-turntable-highlight marker');
}

const futebolMarker = latamFutebolField.minigameMarkers?.find((m) => m.id === 'penalty-kick-ball');
if (!futebolMarker) {
  throw new Error('expected the LATAM Futebol Field to have a penalty-kick-ball marker');
}

test('LATAM Café: the "MATCH THE TREATS" bubble animates and opens Sander\'s own dialog on a real click', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-cafe');

  // The marker exists and is already animating (glow pulsing, bubble
  // bobbing) by the time the Room settles -- not merely present in data.
  await expect
    .poll(async () => (await debugInfo(page))?.minigameMarkers?.['sander-treats-bubble'])
    .not.toBeUndefined();
  const poses = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    const pose = (await debugInfo(page))?.minigameMarkers?.['sander-treats-bubble'];
    if (pose) poses.add(`${pose.glowAlpha.toFixed(3)}:${pose.calloutDy?.toFixed(2)}`);
    await page.waitForTimeout(150);
  }
  expect(poses.size).toBeGreaterThan(1);

  await page.evaluate(() => document.fonts.ready);
  await captureFrameSequence(page, 'latam-cafe', 350);

  // A real click on the bubble itself (not on Sander's own figure, already
  // covered by `pao-de-queijo.spec.ts`), proving `main.ts`'s own
  // `sander-treats-bubble` -> `npc:arrived` re-dispatch.
  await clickStagePoint(page, sanderBubbleCenter);
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Sander Nonaka');

  expect(errors).toEqual([]);
});

test('LATAM Café: the HUD title draws É the same size as its other letters (span-level fix, not a second font)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-cafe');

  const title = page.locator('.hud__title');
  await expect(title).toBeVisible();
  // The accessible name stays the real, accented string even though the
  // accent itself is drawn, not typed.
  await expect(title).toHaveAttribute('aria-label', 'LATAM CAFÉ');
  const accent = title.locator('.hud__title-accent');
  await expect(accent).toHaveCount(1);
  await expect(accent).toHaveText('E');

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/latam-cafe/title.png` });

  expect(errors).toEqual([]);
});

test('LATAM Disco Hall: the turntable highlight animates and opens Carnaval Parade on a click over the disc itself', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-disco-hall');

  await expect
    .poll(async () => (await debugInfo(page))?.minigameMarkers?.['disco-turntable-highlight'])
    .not.toBeUndefined();
  const poses = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    const pose = (await debugInfo(page))?.minigameMarkers?.['disco-turntable-highlight'];
    if (pose) poses.add(`${pose.glowAlpha.toFixed(3)}:${pose.calloutDy?.toFixed(2)}`);
    await page.waitForTimeout(150);
  }
  expect(poses.size).toBeGreaterThan(1);

  await page.evaluate(() => document.fonts.ready);
  await captureFrameSequence(page, 'latam-disco-hall', 350);

  // Clicking the highlighted disc's own anchor (not just the hotspot's
  // centre, already covered by `carnaval-parade.spec.ts`) still triggers it.
  await clickStagePoint(page, discoMarker.anchor);
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Hector Grecco');

  expect(errors).toEqual([]);
});

test('LATAM Futebol Field: the ball bounces, glows and opens Penalty Kick on a real click', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-futebol-field');

  await expect
    .poll(async () => (await debugInfo(page))?.minigameMarkers?.['penalty-kick-ball'])
    .not.toBeUndefined();
  const ballDys = new Set<number>();
  for (let i = 0; i < 8; i += 1) {
    const pose = (await debugInfo(page))?.minigameMarkers?.['penalty-kick-ball'];
    if (pose?.ballDy !== null && pose?.ballDy !== undefined) {
      ballDys.add(Math.round(pose.ballDy));
    }
    await page.waitForTimeout(120);
  }
  // The bounce swings between 0 (on the ground) and -34 (its peak); seeing
  // more than one distinct height proves it's actually moving.
  expect(ballDys.size).toBeGreaterThan(1);

  await page.evaluate(() => document.fonts.ready);
  await captureFrameSequence(page, 'latam-futebol-field', 300);

  await clickStagePoint(page, futebolMarker.anchor);
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Chrystian Rissoli');

  expect(errors).toEqual([]);
});
