import { expect, test, type Page } from '@playwright/test';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
// A generous fixed box (in 1600x900 Stage pixels) around a Penguin's own
// tile centre, big enough to hold the whole figure (including a raised
// arm) and its cap with room to spare, without depending on the renderer's
// own offscreen frame size (`PENGUIN_FRAME_WIDTH`/`HEIGHT`), which is a
// different coordinate space from the in-Room sprite's Stage pixels.
// Scaled by `PLAYER_PENGUIN_SCALE` (#131: in-Room Player Penguins now draw
// at the design's 0.58 scale), so the crop stays tight enough for the cap to
// still be legible in the screenshot rather than dominated by empty space.
const PENGUIN_CROP_HALF_WIDTH = 52; // 90 * 0.58
const PENGUIN_CROP_ABOVE = 93; // 160 * 0.58
const PENGUIN_CROP_BELOW = 23; // 40 * 0.58

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** `window.__roomDebug`, deep-cloned across the page boundary (functions never survive this). */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`, the same wait `room-transitions.spec.ts` uses. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/**
 * A `page.screenshot({ clip })` rectangle around the local Penguin's own
 * tile, converting its tile to a 1600x900 Stage pixel point (`tileToScreen`,
 * the same maths `RoomScene` itself places a Penguin sprite with) and then
 * to page pixels via the canvas's own bounding box, the same scale
 * `room-transitions.spec.ts`'s `clickStagePoint` uses (#92 round 2 nit 8).
 * `?asPlayer` always spawns in Town Center (`enterSpawnRoom`), so this uses
 * that Room's own grid origin.
 */
async function localPenguinClip(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const info = await debugInfo(page);
  const tile = info?.localPenguin?.tile;
  if (!tile) throw new Error('expected __roomDebug.localPenguin.tile after boot');

  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('game canvas has no bounding box');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;

  const stagePoint = tileToScreen(tile, townCenter.grid.origin);
  const left = stagePoint.x - PENGUIN_CROP_HALF_WIDTH;
  const top = stagePoint.y - PENGUIN_CROP_ABOVE;
  const width = PENGUIN_CROP_HALF_WIDTH * 2;
  const height = PENGUIN_CROP_ABOVE + PENGUIN_CROP_BELOW;

  return {
    x: canvasBox.x + left * scaleX,
    y: canvasBox.y + top * scaleY,
    width: width * scaleX,
    height: height * scaleY,
  };
}

// #92 D4: the JG CAP was redrawn to the new crown/brim/seam/button in
// `design/Penguin Creator.dc.html`; screenshots of the Creator preview and a
// Room Penguin -- both drawn by the same `renderHat` (#31/#35 share one
// renderer) -- so one redraw covers both, as the execution plan expects.
test('jg-cap: Creator preview', async ({ page }) => {
  const errors = collectErrors(page);

  // Stage at scale 1 (see hud.spec.ts), so the screenshot is 1:1 with the design.
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?creator');

  await expect(page.locator('.penguin-creator')).toBeVisible();
  // DEFAULT_LOOK's hat is JG CAP (`penguin-creator.test.ts`'s summary check).
  await expect(page.locator('.penguin-creator__summary')).toHaveText(/^JG CAP/);
  await expect(page.locator('.penguin-creator__figure svg')).toBeVisible();

  await page.screenshot({ path: 'test-results/jg-cap/creator.png' });

  expect(errors).toEqual([]);
});

test('jg-cap: Room Penguin', async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1618, height: 918 });
  // `?asPlayer` binds a fixture Player with DEFAULT_LOOK (hat: JG CAP).
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await waitForBoot(page);

  // Cropped to the local Penguin itself (#92 round 2 nit 8), not the whole
  // Room, so the cap is actually legible in the screenshot.
  const clip = await localPenguinClip(page);
  await page.screenshot({ path: 'test-results/jg-cap/room-penguin.png', clip });

  expect(errors).toEqual([]);
});
