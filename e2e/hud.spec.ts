import { expect, test, type Page } from '@playwright/test';
import { ROOM_IDS, type Tile } from '../src/contracts';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { HudTestHandle } from '../src/ui/hud/hud-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';
import type { SnowballDebugInfo } from './support/snowball-debug-types';

declare global {
  interface Window {
    __hudTest?: HudTestHandle;
    canvasPointerDowns: number;
  }
}

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('hud-town-center', async ({ page }) => {
  const errors = collectErrors(page);

  // A viewport where the 1600x900 Stage renders at scale 1 with the 9px
  // gutter per side (`computeStageFit` in src/ui/stage.ts):
  // min((1618-18)/1600, (918-18)/900) = min(1, 1) = 1.
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?hud');

  await expect(page.locator('.hud')).toBeVisible();
  // The signed-in state: no login card or Landing page over the HUD.
  await expect(page.locator('.landing')).toBeHidden();

  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  // Case-insensitive: the CSS applies text-transform: uppercase, so #13's
  // mixed-case Room titles render correctly without this assertion caring.
  await expect(page.locator('.hud__title')).toHaveText(/^town center$/i);

  await page.screenshot({ path: 'test-results/hud-town-center/screenshot.png' });

  expect(errors).toEqual([]);
});

test('hud-penguin-opens-creator', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();

  for (const roomId of ROOM_IDS) {
    await page.evaluate((id) => window.__hudTest!.emitRoomEnter(id), roomId);

    const before = await page.evaluate(() => window.__hudTest!.openCreatorLog.length);
    await page.locator('.hud__button--penguin').click();
    const after = await page.evaluate(() => window.__hudTest!.openCreatorLog.length);

    expect(after).toBeGreaterThan(before);
  }

  expect(errors).toEqual([]);
});

test('hud-clicks-stay-in-hud', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  await page.evaluate(() => {
    window.canvasPointerDowns = 0;
    document.querySelector('#game canvas')?.addEventListener('pointerdown', () => {
      window.canvasPointerDowns += 1;
    });
  });

  // Every visible HUD button (EMOTE/SNOWBALL/QUESTS and the MENU sign-out
  // panel are hidden until clicked/unlocked, so they're not in this list).
  const buttonSelectors = [
    '.hud__button--penguin',
    '.hud__button--map',
    '.hud__button--igloo',
    '.hud__button--menu',
  ];

  for (const selector of buttonSelectors) {
    const button = page.locator(selector);
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;

    const landsInsideHud = await page.evaluate(
      ([px, py]) => !!document.elementFromPoint(px, py)?.closest('.hud'),
      [x, y],
    );
    expect(landsInsideHud).toBe(true);

    await button.click();
  }

  // MENU was clicked last and its panel is now open; close it so the page
  // is left in a clean state.
  await page.keyboard.press('Escape');

  const canvasPointerDownsAfterHudClicks = await page.evaluate(() => window.canvasPointerDowns);
  expect(canvasPointerDownsAfterHudClicks).toBe(0);

  // The other half: a point outside every HUD widget (the Stage centre)
  // hits the canvas, not `.hud`, and a click there does reach the canvas's
  // own pointerdown listener.
  const canvasBox = await page.locator('#game canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;

  const centerHitsCanvas = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.tagName,
    [centerX, centerY],
  );
  expect(centerHitsCanvas).toBe('CANVAS');

  await page.mouse.click(centerX, centerY);

  const canvasPointerDownsAfterCenterClick = await page.evaluate(() => window.canvasPointerDowns);
  expect(canvasPointerDownsAfterCenterClick).toBe(1);

  expect(errors).toEqual([]);
});

test('hud-chat-field-stays-in-hud', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => window.__hudTest!.emitRoomEnter('town-center'));

  await page.evaluate(() => {
    window.canvasPointerDowns = 0;
    document.querySelector('#game canvas')?.addEventListener('pointerdown', () => {
      window.canvasPointerDowns += 1;
    });
  });

  const input = page.locator('.hud__chat-input');
  await input.click();
  await input.pressSequentially('hello there', { delay: 10 });

  expect(await page.evaluate(() => window.canvasPointerDowns)).toBe(0);

  expect(errors).toEqual([]);
});

async function snowballDebug(page: Page): Promise<SnowballDebugInfo | undefined> {
  return page.evaluate(() => window.__snowballDebug);
}

async function roomDebug(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** A Stage-pixel point as a page point, via the canvas's own bounding box (`e2e/snowball-hit.spec.ts`'s technique). */
async function pagePoint(page: Page, stage: { x: number; y: number }) {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  return {
    x: canvasBox.x + stage.x * (canvasBox.width / GAME_WIDTH),
    y: canvasBox.y + stage.y * (canvasBox.height / GAME_HEIGHT),
  };
}

async function tilePoint(page: Page, tile: Tile) {
  return pagePoint(page, tileToScreen(tile, townCenter.grid.origin));
}

/** An empty Town Center Tile, clear of NPCs and HUD widgets, for aiming/throwing. */
const EMPTY_TILE: Tile = { col: 11, row: 0 };
/** A second empty Tile, distinct from `EMPTY_TILE`, for post-exit pointer moves. */
const AFTER_EXIT_TILE: Tile = { col: 10, row: 1 };

// #109: single-browser coverage of Snowball mode's two exits, via the
// `?asPlayer` hook's local-only stub controller (`src/main.ts`
// `initDevAsPlayerHook`) rather than `snowball-hit.spec.ts`'s real two-user
// setup (skipped locally without E2E_USER_A/B credentials).
test('snowball-escape-exits-the-mode', async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('.hud')).toBeVisible();
  await expect.poll(async () => (await snowballDebug(page))?.ammo).toBe(3);

  await page.locator('.hud__button--snowball').click();
  await expect.poll(async () => (await snowballDebug(page))?.mode).toBe(true);
  await expect(page.locator('.hud__snowball-panel')).toBeVisible();
  await expect(page.locator('.hud__button--snowball')).toHaveClass(/hud__button--active/);

  // Hovering while aiming moves the reticle onto the hovered Tile.
  const empty = await tilePoint(page, EMPTY_TILE);
  await page.mouse.move(empty.x, empty.y);
  await expect.poll(async () => (await snowballDebug(page))?.reticle).toEqual(EMPTY_TILE);

  const beforeEscape = await roomDebug(page);
  const tileBeforeEscape = beforeEscape?.localPenguin?.tile;
  const moveLogBeforeEscape = beforeEscape?.localPenguinMoveLog ?? [];

  await page.keyboard.press('Escape');

  await expect.poll(async () => (await snowballDebug(page))?.mode).toBe(false);
  await expect(page.locator('.hud__snowball-panel')).toBeHidden();
  await expect(page.locator('.hud__button--snowball')).not.toHaveClass(/hud__button--active/);
  // Escape neither threw nor moved the Penguin.
  expect((await snowballDebug(page))?.throwLog).toEqual([]);
  expect((await snowballDebug(page))?.ammo).toBe(3);
  expect((await snowballDebug(page))?.reticle).toBeNull();
  const afterEscape = await roomDebug(page);
  expect(afterEscape?.localPenguin?.tile).toEqual(tileBeforeEscape);
  expect(afterEscape?.localPenguinMoveLog).toEqual(moveLogBeforeEscape);

  // After exiting, the scene is no longer aiming: moving the pointer leaves the reticle null.
  const afterExit = await tilePoint(page, AFTER_EXIT_TILE);
  await page.mouse.move(afterExit.x, afterExit.y);
  expect((await snowballDebug(page))?.reticle).toBeNull();

  expect(errors).toEqual([]);
});

test('snowball-third-throw-from-full-ammo-exits-the-mode', async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('.hud')).toBeVisible();
  await expect.poll(async () => (await snowballDebug(page))?.ammo).toBe(3);

  await page.locator('.hud__button--snowball').click();
  await expect.poll(async () => (await snowballDebug(page))?.mode).toBe(true);

  const empty = await tilePoint(page, EMPTY_TILE);
  for (let i = 0; i < 3; i += 1) await page.mouse.click(empty.x, empty.y);

  await expect.poll(async () => (await snowballDebug(page))?.throwLog.length).toBe(3);
  await expect.poll(async () => (await snowballDebug(page))?.ammo).toBe(0);
  await expect.poll(async () => (await snowballDebug(page))?.mode).toBe(false);
  await expect(page.locator('.hud__snowball-panel')).toBeHidden();
  await expect(page.locator('.hud__button--snowball')).not.toHaveClass(/hud__button--active/);

  expect(errors).toEqual([]);
});
