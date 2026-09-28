import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #162: the own Penguin is hidden (and the Stage ignores clicks) from boot
 * until the Player's Session starts. These are the credential-free checks:
 * it's never left hidden on a signed-out or hook path, Room restarts keep
 * it, and while it's hidden the Stage ignores clicks but DOM overlays still
 * work. The real sign-in path is `own-penguin-sign-in.spec.ts` (shared test
 * users).
 */

const BOOT_TIMEOUT = 15_000;
const SHOTS = 'test-results/local-penguin-visibility';

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

async function waitForVisible(page: Page, visible: boolean): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.visible, { timeout: BOOT_TIMEOUT })
    .toBe(visible);
}

async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

async function setVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((next) => window.__roomDebug?.setLocalPenguinVisible?.(next), visible);
  await waitForVisible(page, visible);
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

test.describe('the own Penguin is visible whenever no Session is pending', () => {
  test('signed out: shown once the Landing page is up', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?room=town-center');
    await expect(page.locator('#ui .landing')).toBeVisible();
    await waitForVisible(page, true);
    await page.screenshot({ path: `${SHOTS}/signed-out.png` });
    expect(errors).toEqual([]);
  });

  test('?asPlayer: shown at once, and still shown after a Room change', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?asPlayer');
    await expect
      .poll(async () => (await debugInfo(page))?.roomEventLog, { timeout: BOOT_TIMEOUT })
      .toContainEqual({ type: 'room:enter', roomId: 'town-center' });
    await waitForVisible(page, true);
    const restartsBefore = (await debugInfo(page))?.restartCount ?? 0;
    await page.evaluate(() => window.__roomDebug?.changeRoom?.('dev-pit'));
    await expect
      .poll(async () => (await debugInfo(page))?.restartCount, { timeout: BOOT_TIMEOUT })
      .toBeGreaterThan(restartsBefore);
    await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('dev-pit');
    await waitForVisible(page, true);
    await page.screenshot({ path: `${SHOTS}/as-player.png` });
    expect(errors).toEqual([]);
  });

  test('?asPlayer under reduced motion: shown, with no body tween', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = collectErrors(page);
    await page.goto('/?asPlayer');
    await waitForVisible(page, true);
    expect((await debugInfo(page))?.localPenguin?.bodyTweenCount).toBe(0);
    await page.screenshot({ path: `${SHOTS}/reduced-motion.png` });
    expect(errors).toEqual([]);
  });
});

test('ignores Stage clicks while the own Penguin is hidden, and takes them again once shown', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  // Part 1, Town Center: a far tile, an NPC and a door.
  await page.goto('/?room=town-center');
  await hideLandingPage(page);
  await waitForVisible(page, true);
  await setVisible(page, false);

  const origin = townCenter.grid.origin;
  const spawnTile = townCenter.spawnTile;
  // (2, 2) is walkable and reachable from the spawn tile (see click-to-move.spec.ts).
  const farTile = { col: 2, row: 2 };
  await clickStagePoint(page, tileToScreen(farTile, origin));

  const npcId = townCenter.npcSlots[0].npcId;
  const npc = (await debugInfo(page))?.npcs?.[npcId];
  if (!npc) throw new Error(`no __roomDebug.npcs entry for ${npcId}`);
  await clickStagePoint(page, {
    x: npc.x,
    y: npc.y + npcLayout({ kind: 'human' }).hitArea.centerY,
  });

  const door = townCenter.doors.find((candidate) => candidate.label === 'DEV PIT');
  if (!door) throw new Error('expected town-center to have a DEV PIT door');
  await clickStagePoint(page, {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  });

  await page.waitForTimeout(1_500);
  const gated = await debugInfo(page);
  expect(gated?.localPenguin).toMatchObject({ visible: false, tile: spawnTile, moving: false });
  expect(gated?.localPenguinMoveLog).toEqual([]);
  expect(gated?.npcArrivedLog).toEqual([]);
  expect(gated?.doorReachedLog).toEqual([]);
  await expect(page.locator('.npc-dialog')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/gated/hidden.png` });

  // Shown again: the same far tile walks.
  await setVisible(page, true);
  await clickStagePoint(page, tileToScreen(farTile, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0)
    .toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOTS}/gated/shown.png` });

  // Part 2, the Igloo: the Trophy Case hotspot.
  await page.goto('/?room=igloo');
  await hideLandingPage(page);
  await waitForVisible(page, true);
  await setVisible(page, false);
  const hotspot = igloo.hotspots?.find((h) => h.id === 'trophy-case');
  if (!hotspot) throw new Error('expected the Igloo to have a trophy-case hotspot');
  await clickStagePoint(page, {
    x: hotspot.rect.x + hotspot.rect.width / 2,
    y: hotspot.rect.y + hotspot.rect.height / 2,
  });
  await page.waitForTimeout(1_000);
  await expect(page.locator('.trophy-case')).toBeHidden();
  expect((await debugInfo(page))?.localPenguinMoveLog).toEqual([]);

  expect(errors).toEqual([]);
});

test.describe('DOM overlays still work while the Stage is gated', () => {
  test('the Penguin Creator', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?creator');
    // Wait for the real signed-out signal first, so it can't show the
    // Penguin again after this test hides it.
    await waitForVisible(page, true);
    await setVisible(page, false);
    await page.locator('#penguin-creator-name').fill('Waddles');
    await page.locator('.penguin-creator__submit').click();
    await expect(page.locator('.penguin-creator')).toBeHidden();
    await expect(page.locator('.hud')).toBeVisible();
    expect((await debugInfo(page))?.localPenguinMoveLog).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/overlays/creator.png` });
    expect(errors).toEqual([]);
  });

  test('the HUD MENU', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?hud');
    await waitForVisible(page, true);
    await setVisible(page, false);
    await page.locator('.hud__button--menu').click();
    await expect(page.locator('.hud__menu-panel')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overlays/menu.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('.hud__menu-panel')).toBeHidden();
    expect((await debugInfo(page))?.localPenguinMoveLog).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the Landing page sign-in button', async ({ page }) => {
    const errors = collectErrors(page);
    const authorizeRequests: string[] = [];
    // A 204 commits no navigation, so the page (and __roomDebug) survive,
    // and the test never reaches Google.
    await page.route('**/auth/v1/authorize**', (route) => {
      authorizeRequests.push(route.request().url());
      return route.fulfill({ status: 204 });
    });
    await page.goto('/');
    await expect(page.locator('#ui .landing')).toBeVisible();
    await waitForVisible(page, true);
    await setVisible(page, false);
    expect((await debugInfo(page))?.localPenguinMoveLog).toEqual([]);

    const button = page.locator('.landing__play');
    const box = await button.boundingBox();
    if (!box) throw new Error('PLAY NOW not visible');
    const landsOnButton = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('.landing__play'),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(landsOnButton).toBe(true);
    await button.click();
    await expect.poll(() => authorizeRequests.length).toBe(1);
    expect((await debugInfo(page))?.localPenguinMoveLog).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/overlays/landing.png` });
    expect(errors).toEqual([]);
  });
});
