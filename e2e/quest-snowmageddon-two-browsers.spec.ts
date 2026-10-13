/**
 * Runs against the real shared Supabase project (#81), the same two shared
 * test users every other `*-two-browsers.spec.ts` uses. See "Running the
 * two-browser e2e specs" in the README.
 *
 * #154's Snowmageddon Quest, genuinely Presence- and hit-driven here, in
 * `e2e/snowball-hit.spec.ts`'s own style: B walks to a Tile; A enters
 * Snowball mode and throws at it. Once A's own client resolves the hit
 * locally (the same `snowball:hit` broadcast `snowball-hit.spec.ts` polls
 * for), A's client also reports it through `record_snowball_hit` (D5) and
 * refreshes Quests, so A's Quests panel shows Snowmageddon's progress rise to
 * 1 / 5 -- a real server round trip, not the dev store's test hook (that path
 * is `e2e/quest-snowmageddon.spec.ts`'s).
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import { assertTestUsersAbsent, playerIdFromStorageState } from './support/presence-guard';
import {
  completeCreatorIfShown,
  READY_TIMEOUT,
  readOwnPlayerId,
  waitUntilJoined,
} from './support/two-browser-session';
import type { RoomDebugInfo } from './support/room-debug-types';
import type { SnowballDebugInfo } from './support/snowball-debug-types';

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const OUTPUT_DIR = 'test-results/quest-snowmageddon-two-browsers';
const VIDEO_DIR = 'playwright-output/quest-snowmageddon-videos';
const HIT_TIMEOUT_MS = 5_000;
const WALK_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 50;

/** B's Tile: walkable, clear of NPCs and HUD widgets, 7 Tiles from the shared spawn Tile {6,8}. */
const TARGET_TILE: Tile = { col: 9, row: 4 };

async function roomDebug(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function snowballDebug(page: Page): Promise<SnowballDebugInfo | undefined> {
  return page.evaluate(() => window.__snowballDebug);
}

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

async function clickTile(page: Page, tile: Tile) {
  const { x, y } = await tilePoint(page, tile);
  await page.mouse.click(x, y);
}

async function snowmageddonProgress(page: Page): Promise<string | null> {
  await page.locator('.quest-widget').click();
  const row = page.locator('.quests [data-quest-id="snowmageddon"] .quests__row-progress');
  const text = await row.textContent();
  // Leaves the panel the way it found it, for a poll loop to call repeatedly.
  await page.locator('.hud__button--quests').click();
  return text;
}

test('quest-snowmageddon-two-browsers', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  test.skip(!hasTestUsers('A', 'B'), 'requires E2E_USER_A/B credentials in .env.test.local');

  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const stateA = await passwordSessionState('A', origin);
  const stateB = await passwordSessionState('B', origin);

  await assertTestUsersAbsent([
    { label: 'A', playerId: playerIdFromStorageState(stateA) },
    { label: 'B', playerId: playerIdFromStorageState(stateB) },
  ]);

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
    await pageA.goto('/?debug&masknames&hud');
    await pageB.goto('/?debug&masknames&hud');
    await completeCreatorIfShown(pageA, 'Penguin A');
    await completeCreatorIfShown(pageB, 'Penguin B');
    await waitUntilJoined(pageA);
    await waitUntilJoined(pageB);

    const idB = await readOwnPlayerId(pageB);

    // B walks to TARGET_TILE; wait for two-way readiness (snowball-hit.spec.ts's own technique).
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

    // A enters Snowball mode and throws at B's Tile.
    await pageA.locator('.hud__button--snowball').click();
    await expect.poll(async () => (await snowballDebug(pageA))?.mode).toBe(true);
    await expect
      .poll(async () => (await snowballDebug(pageA))?.ammo, { timeout: READY_TIMEOUT })
      .toBeGreaterThan(0);

    const before = await snowmageddonProgress(pageA);
    expect(before).toBe('0 / 5');

    const target = await tilePoint(pageA, TARGET_TILE);
    await pageA.mouse.click(target.x, target.y);

    await expect
      .poll(async () => (await snowballDebug(pageA))?.throwLog.length, { timeout: HIT_TIMEOUT_MS })
      .toBeGreaterThan(0);

    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'a-threw.png') });

    // A's own client reports the hit (record_snowball_hit) and refreshes
    // Quests; the panel's own 1 / 5 is the proof a real round trip happened.
    await expect.poll(() => snowmageddonProgress(pageA), { timeout: HIT_TIMEOUT_MS }).toBe('1 / 5');

    await pageA.locator('.quest-widget').click();
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'a-snowmageddon-1-of-5.png') });
  } finally {
    await contextA.close();
    await contextB.close();
    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
    rmSync(VIDEO_DIR, { recursive: true, force: true });
  }
});
