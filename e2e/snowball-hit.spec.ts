import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import {
  completeCreatorIfShown,
  READY_TIMEOUT,
  readOwnPlayerId,
  waitUntilJoined,
} from './support/two-browser-session';
import type { RoomDebugInfo } from './support/room-debug-types';
import type { SnowballDebugInfo, SnowHatDebugInfo } from './support/snowball-debug-types';

/** AC3: both browsers' videos land here; every run replaces the directory. */
const OUTPUT_DIR = 'test-results/snowball-hit';
const VIDEO_DIR = 'playwright-output/snowball-hit-videos';
const SNOW_HAT_MS = 10_000;
const SNOWBALL_CAPACITY = 3;
const POLL_INTERVAL_MS = 50;
/** Generous bound on a whole walk finishing and being seen by the other browser. */
const WALK_TIMEOUT_MS = 20_000;
/** A snowball's 600 ms flight plus the hit broadcast's round trip. */
const HIT_TIMEOUT_MS = 5_000;
/** How long a suppressed click gets to (wrongly) start a walk or a Room change before we check it didn't. */
const SETTLE_MS = 1_500;

/** B's Tile: walkable, clear of NPCs and HUD widgets, and 7 Tiles from the shared spawn Tile {6,8}. */
const TARGET_TILE: Tile = { col: 9, row: 4 };
/** An empty Tile far from B (and from every HUD widget), for T2's ammo throws. */
const EMPTY_TILE: Tile = { col: 11, row: 0 };
/** Another empty Tile, for T1's hover and right-click. */
const HOVER_TILE: Tile = { col: 8, row: 6 };
/** Darrin's NPC slot (a clickable circle) in Town Center. */
const DARRIN_TILE: Tile = { col: 3, row: 4 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function roomDebug(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function snowballDebug(page: Page): Promise<SnowballDebugInfo | undefined> {
  return page.evaluate(() => window.__snowballDebug);
}

async function snowHat(page: Page, playerId: string): Promise<SnowHatDebugInfo | undefined> {
  return (await snowballDebug(page))?.snowHats[playerId];
}

/** A Stage-pixel point as a page point, via the canvas's own bounding box (`e2e/movement-sync.spec.ts`'s technique). */
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

async function clickTile(page: Page, tile: Tile, button: 'left' | 'right' = 'left') {
  const { x, y } = await tilePoint(page, tile);
  await page.mouse.click(x, y, { button });
}

/** Sleeps until this machine's clock (shared with both pages) reaches `at`. */
async function sleepUntil(at: number): Promise<void> {
  const remaining = at - Date.now();
  if (remaining > 0) await sleep(remaining);
}

test('snowball-hit', async ({ browser, baseURL }) => {
  // Two sign-ins, B's walk, the 11 s snow-hat window, then T1/O2/T2.
  test.setTimeout(120_000);
  test.skip(!hasTestUsers('A', 'B'), 'requires E2E_USER_A/B credentials in .env.test.local');

  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const stateA = await passwordSessionState('A', origin);
  const stateB = await passwordSessionState('B', origin);

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  const contextA = await browser.newContext({
    storageState: stateA,
    recordVideo: { dir: VIDEO_DIR },
  });
  const contextB = await browser.newContext({
    storageState: stateB,
    recordVideo: { dir: VIDEO_DIR },
  });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto('/?debug&masknames');
    await pageB.goto('/?debug&masknames');
    await completeCreatorIfShown(pageA, 'Penguin A');
    await completeCreatorIfShown(pageB, 'Penguin B');
    await waitUntilJoined(pageA);
    await waitUntilJoined(pageB);

    const idA = await readOwnPlayerId(pageA);
    const idB = await readOwnPlayerId(pageB);

    // --- Fixture: B walks to TARGET_TILE; wait for two-way readiness (v4
    // change 7): A shows B standing there, and B shows A (otherwise B's
    // channel drops A's broadcasts).
    await clickTile(pageB, TARGET_TILE);
    await expect
      .poll(
        async () => {
          const remoteB = (await roomDebug(pageA))?.remotePenguins?.find((p) => p.playerId === idB);
          return remoteB !== undefined && !remoteB.moving ? remoteB.tile : null;
        },
        { timeout: WALK_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] },
      )
      .toEqual(TARGET_TILE);
    await expect
      .poll(
        async () =>
          (await roomDebug(pageB))?.remotePenguins?.some((p) => p.playerId === idA) ?? false,
        { timeout: READY_TIMEOUT },
      )
      .toBe(true);

    // --- A enters Snowball mode with full ammo.
    await pageA.locator('.hud__button--snowball').click();
    await expect.poll(async () => (await snowballDebug(pageA))?.mode).toBe(true);
    await expect(pageA.locator('.hud__snowball-panel')).toBeVisible();
    await expect
      .poll(async () => (await snowballDebug(pageA))?.ammo, { timeout: READY_TIMEOUT })
      .toBe(SNOWBALL_CAPACITY);

    const beforeThrow = await roomDebug(pageA);
    const localTileBefore = beforeThrow?.localPenguin?.tile;
    const moveLogBefore = beforeThrow?.localPenguinMoveLog ?? [];
    expect(localTileBefore).toEqual(townCenter.spawnTile);

    // --- T1: the reticle follows the hovered Tile.
    const hover = await tilePoint(pageA, HOVER_TILE);
    await pageA.mouse.move(hover.x, hover.y);
    await expect.poll(async () => (await snowballDebug(pageA))?.reticle).toEqual(HOVER_TILE);
    const target = await tilePoint(pageA, TARGET_TILE);
    await pageA.mouse.move(target.x, target.y);
    await expect.poll(async () => (await snowballDebug(pageA))?.reticle).toEqual(TARGET_TILE);
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'a-aiming.png') });

    // --- AC1: A throws at B's Tile; both browsers show B's snow hat.
    await pageA.mouse.click(target.x, target.y);

    await expect
      .poll(async () => (await snowHat(pageA, idB)) !== undefined, { timeout: HIT_TIMEOUT_MS })
      .toBe(true);
    await expect
      .poll(async () => (await snowHat(pageB, idB)) !== undefined, { timeout: HIT_TIMEOUT_MS })
      .toBe(true);
    const hatOnA = (await snowHat(pageA, idB)) as SnowHatDebugInfo;
    const hatOnB = (await snowHat(pageB, idB)) as SnowHatDebugInfo;
    expect(hatOnA.until - hatOnA.appliedAt).toBe(SNOW_HAT_MS);
    expect(hatOnB.until - hatOnB.appliedAt).toBe(SNOW_HAT_MS);
    expect(hatOnA.rendered).toBe(true);
    expect(hatOnB.rendered).toBe(true);
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'a-snow-hat.png') });
    await pageB.screenshot({ path: path.join(OUTPUT_DIR, 'b-snow-hat.png') });
    console.log(
      `[snowball-hit] AC1: hat applied on B's screen ${hatOnB.appliedAt - hatOnA.appliedAt}ms after A's`,
    );
    expect((await snowballDebug(pageA))?.throwLog).toHaveLength(1);

    // The throw click moved nothing.
    const afterThrow = await roomDebug(pageA);
    expect(afterThrow?.localPenguin?.tile).toEqual(localTileBefore);
    expect(afterThrow?.localPenguinMoveLog).toEqual(moveLogBefore);

    // Still on, and still drawn, at each client's own appliedAt + 9 s ...
    const checks = [
      { page: pageA, hat: hatOnA, label: 'A' },
      { page: pageB, hat: hatOnB, label: 'B' },
    ].sort((a, b) => a.hat.appliedAt - b.hat.appliedAt);
    for (const { page, hat, label } of checks) {
      await sleepUntil(hat.appliedAt + 9_000);
      expect((await snowHat(page, idB))?.rendered, `${label} at appliedAt + 9s`).toBe(true);
    }
    // ... and gone by appliedAt + 11 s.
    for (const { page, hat, label } of checks) {
      const deadline = hat.appliedAt + 11_000;
      let gone = false;
      while (Date.now() <= deadline) {
        const current = await snowHat(page, idB);
        if (current === undefined || !current.rendered) {
          gone = true;
          break;
        }
        await sleep(POLL_INTERVAL_MS);
      }
      expect(gone, `${label}: snow hat still shown at appliedAt + 11s`).toBe(true);
    }

    const afterHat = await roomDebug(pageA);
    expect(afterHat?.localPenguin?.tile).toEqual(localTileBefore);
    expect(afterHat?.localPenguinMoveLog).toEqual(moveLogBefore);

    // --- T1: right-click cancels the aim, keeps the mode, throws and moves nothing.
    const throwsBeforeCancel = (await snowballDebug(pageA))?.throwLog.length;
    await clickTile(pageA, HOVER_TILE, 'right');
    await expect.poll(async () => (await snowballDebug(pageA))?.reticle).toBeNull();
    await sleep(SETTLE_MS);
    const afterCancel = await snowballDebug(pageA);
    expect(afterCancel?.mode).toBe(true);
    expect(afterCancel?.reticle).toBeNull();
    expect(afterCancel?.throwLog).toHaveLength(throwsBeforeCancel ?? -1);
    expect((await roomDebug(pageA))?.localPenguinMoveLog).toEqual(moveLogBefore);

    // --- O2: an NPC or door click while aiming neither walks nor changes Room.
    const logsBefore = await roomDebug(pageA);
    await clickTile(pageA, DARRIN_TILE);
    const devPit = townCenter.doors.find((door) => door.targetRoomId === 'dev-pit');
    if (!devPit) throw new Error('Town Center has no Dev Pit door');
    const doorPoint = await pagePoint(pageA, {
      x: devPit.hotspot.x + devPit.hotspot.width / 2,
      y: devPit.hotspot.y + devPit.hotspot.height / 2,
    });
    await pageA.mouse.click(doorPoint.x, doorPoint.y);
    await sleep(SETTLE_MS);
    const afterSuppressed = await roomDebug(pageA);
    expect(afterSuppressed?.roomId).toBe('town-center');
    expect(afterSuppressed?.npcArrivedLog).toEqual(logsBefore?.npcArrivedLog);
    expect(afterSuppressed?.doorReachedLog).toEqual(logsBefore?.doorReachedLog);
    expect(afterSuppressed?.localPenguinMoveLog).toEqual(moveLogBefore);
    expect(afterSuppressed?.localPenguin?.tile).toEqual(localTileBefore);

    // --- T2: with full ammo, three throws land; a fourth click does nothing.
    await expect
      .poll(async () => (await snowballDebug(pageA))?.ammo, { timeout: 15_000 })
      .toBe(SNOWBALL_CAPACITY);
    const throwsBefore = (await snowballDebug(pageA))?.throwLog.length ?? 0;
    const empty = await tilePoint(pageA, EMPTY_TILE);
    for (let i = 0; i < SNOWBALL_CAPACITY; i += 1) await pageA.mouse.click(empty.x, empty.y);
    await expect
      .poll(async () => (await snowballDebug(pageA))?.throwLog.length, { timeout: HIT_TIMEOUT_MS })
      .toBe(throwsBefore + SNOWBALL_CAPACITY);
    await pageA.mouse.click(empty.x, empty.y);
    await sleep(500);
    expect((await snowballDebug(pageA))?.throwLog).toHaveLength(throwsBefore + SNOWBALL_CAPACITY);
    await expect(pageA.locator('.hud__snowball-pip--full')).toHaveCount(0);
    await expect(pageA.locator('.hud__snowball-ammo-text')).toHaveText('0 LEFT · REFILLS 1 / 4S');
    expect((await roomDebug(pageA))?.localPenguinMoveLog).toEqual(moveLogBefore);

    // --- T1: SNOWBALL leaves the mode.
    await pageA.locator('.hud__button--snowball').click();
    await expect.poll(async () => (await snowballDebug(pageA))?.mode).toBe(false);
    await expect(pageA.locator('.hud__snowball-panel')).toBeHidden();
  } finally {
    await contextA.close();
    await contextB.close();
    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
    rmSync(VIDEO_DIR, { recursive: true, force: true });
  }
});
