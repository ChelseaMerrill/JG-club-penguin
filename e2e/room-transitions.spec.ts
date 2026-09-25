import { expect, test, type Page } from '@playwright/test';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

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

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

function doorCenter(door: { hotspot: { x: number; y: number; width: number; height: number } }): {
  x: number;
  y: number;
} {
  return {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
}

test('room transitions: doors, changeRoom, HUD, reload (#15)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);

  // Every Session starts in Town Center (#15 acceptance criteria), with an
  // enter and no preceding leave (`enterSpawnRoom`, #26 D6).
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await expect
    .poll(async () => (await debugInfo(page))?.roomEventLog)
    .toEqual([{ type: 'room:enter', roomId: 'town-center' }]);

  // --- A disabled door (THE ICEBOX, `targetRoomId: null`) shows the
  // "coming soon" hint and leaves the Room unchanged.
  const icebox = townCenter.doors.find((door) => door.label === 'THE ICEBOX');
  if (!icebox) throw new Error('expected town-center to have a THE ICEBOX door');
  await clickStagePoint(page, doorCenter(icebox));
  await expect
    .poll(async () => (await debugInfo(page))?.doorReachedLog, { timeout: WALK_TIMEOUT })
    .toEqual(expect.arrayContaining(['THE ICEBOX']));
  await expect.poll(async () => (await debugInfo(page))?.comingSoonHint).toBe('THE ICEBOX');
  expect((await debugInfo(page))?.roomId).toBe('town-center');
  await page.screenshot({ path: 'test-results/room-transitions/coming-soon-hint.png' });

  // DOOR_HINT_DURATION_MS (`RoomScene.ts`) is 2000ms: still shown partway
  // through that window, then gone. The "still shown" half is a strict,
  // point-in-time check (it would catch the hint disappearing too early);
  // the "gone" half polls generously rather than a fixed wait, so parallel
  // e2e workers' CPU contention can't flake it.
  await page.waitForTimeout(1500);
  expect((await debugInfo(page))?.comingSoonHint).toBe('THE ICEBOX');
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, { timeout: 15_000 })
    .toBeNull();

  // --- The DEV PIT door walks the Penguin there, then loads Dev Pit at the
  // door's own entry tile (not Dev Pit's spawnTile).
  const devPitDoor = townCenter.doors.find((door) => door.label === 'DEV PIT');
  if (!devPitDoor) throw new Error('expected town-center to have a DEV PIT door');
  await clickStagePoint(page, doorCenter(devPitDoor));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(devPitDoor.entryTile);
  await page.screenshot({ path: 'test-results/room-transitions/dev-pit.png' });

  // --- Dev Pit's own TOWN CENTER door sends the Penguin back, at its entry tile.
  const townCenterDoor = devPit.doors.find((door) => door.label === 'TOWN CENTER');
  if (!townCenterDoor) throw new Error('expected dev-pit to have a TOWN CENTER door');
  await clickStagePoint(page, doorCenter(townCenterDoor));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('town-center');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(townCenterDoor.entryTile);

  // --- `__roomDebug.changeRoom('roof-deck')` lands on Roof Deck's own spawnTile.
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('roof-deck');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(roofDeck.spawnTile);
  await page.screenshot({ path: 'test-results/room-transitions/roof-deck.png' });

  // --- MENU -> RETURN TO TOWN CENTER: visible outside Town Center, sends the
  // Player back to Town Center's own spawnTile.
  await expect(page.locator('.hud__menu-return-to-town-center')).toBeHidden();
  await page.locator('.hud__button--menu').click();
  await expect(page.locator('.hud__menu-return-to-town-center')).toBeVisible();
  await page.locator('.hud__menu-return-to-town-center').click();
  await expect(page.locator('.hud__menu-panel')).toBeHidden();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('town-center');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(townCenter.spawnTile);
  await expect(page.locator('.hud__menu-return-to-town-center')).toBeHidden();

  // --- The HUD's IGLOO button lands on the Igloo's own spawnTile.
  await page.locator('.hud__button--igloo').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('igloo');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(igloo.spawnTile);
  await page.screenshot({ path: 'test-results/room-transitions/igloo.png' });

  // --- The event log is exactly this sequence: every room:leave's roomId
  // equals the room the previous room:enter just landed in, and the very
  // first enter (Session start, `enterSpawnRoom`) has no preceding leave
  // (#26 D6). The disabled-door click above never changes Room, so it left
  // no trace here.
  const log = (await debugInfo(page))?.roomEventLog;
  expect(log).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'dev-pit' },
    { type: 'room:leave', roomId: 'dev-pit' },
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'roof-deck' },
    { type: 'room:leave', roomId: 'roof-deck' },
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'igloo' },
  ]);

  expect(errors).toEqual([]);
});

test('reload spawns back in Town Center (#15)', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  // Move away from the boot Room first, so the reload check isn't trivially
  // true just because nothing ever changed it.
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('roof-deck');

  await page.reload();
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  expect(errors).toEqual([]);
});
