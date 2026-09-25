import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Facing, HexColor, PenguinLook, RoomId, Tile } from '../src/contracts';
import type { RegisteredPlayer } from '../src/game/movement/registered-player';
import type { PenguinAnim } from '../src/game/penguin/poses';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import {
  completeCreatorIfShown,
  readOwnPlayerId,
  waitUntilJoined,
} from './support/two-browser-session';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s `RoomDebugInfo` (see the note
// in `e2e/click-to-move.spec.ts`: importing it directly drags in
// `import.meta.env`, which the `e2e` tsconfig doesn't type-check). Kept
// identical, field for field, to every other redeclaration in this
// directory: TypeScript's global `Window` augmentation requires every
// redeclaration of `__roomDebug` to resolve to the same type.
interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
  flipX: boolean;
  lookName: string;
  lookBody: HexColor;
  playerId: string;
}

interface RemotePenguinDebugInfo {
  playerId: string;
  tile: Tile;
  moving: boolean;
  placedTile: Tile;
}

interface RoomDebugInfo {
  roomId: RoomId;
  scrollX: number;
  scrollY: number;
  localPenguin?: LocalPenguinDebugInfo;
  textureListenerCount?: number;
  npcArrivedLog?: string[];
  doorReachedLog?: string[];
  localPenguinMoveLog?: Tile[];
  restartRoom?: () => void;
  restartCount?: number;
  penguinCount?: number;
  remotePenguinCount?: number;
  remotePenguins?: RemotePenguinDebugInfo[];
  setRegisteredPlayer?: (player: RegisteredPlayer) => void;
  spawnDebugPenguin?: (tile: Tile, look: PenguinLook) => void;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

const OUTPUT_DIR = 'test-results/movement-sync';
const VIDEO_DIR = 'playwright-output/movement-sync-videos';
/** The #43 AC1 acceptance budget for another browser to see a move start. */
const MOVE_SYNC_TIMEOUT_MS = 500;
/** Generous bound on a whole walk (many tiles) actually finishing. */
const WALK_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 50;
/** AC2's re-route cadence: fast enough that the walk never actually arrives. */
const REROUTE_INTERVAL_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function remoteInfo(
  page: Page,
  playerId: string,
): Promise<RemotePenguinDebugInfo | undefined> {
  const info = await debugInfo(page);
  return info?.remotePenguins?.find((p) => p.playerId === playerId);
}

/** The Room `RoomScene` is showing, via the `VITE_E2E_HOOKS` `window.__roomDebug` hook. */
async function shownRoomId(page: Page): Promise<string | undefined> {
  return (await debugInfo(page))?.roomId;
}

/** Converts a Town Center tile to a page click point via the canvas's own bounding box (`e2e/click-to-move.spec.ts`'s technique). */
async function clickTownCenterTile(page: Page, tile: Tile): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const point = tileToScreen(tile, townCenter.grid.origin);
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

test('movement-sync', async ({ browser, baseURL }) => {
  // AC1's walk, then AC2's leave/re-route/return/arrival sequence.
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

    // --- AC1: A clicks a Town Center tile far from its current tile
    // (spawnTile {6,8}; {2,2} is 10 tiles away by Manhattan distance, and
    // reachable — the same far tile `e2e/click-to-move.spec.ts` uses).
    const ac1Target: Tile = { col: 2, row: 2 };
    const clickedAt = Date.now();
    await clickTownCenterTile(pageA, ac1Target);

    let movingLatencyMs: number | null = null;
    const distinctTiles = new Set<string>();
    let settledLocalTile: Tile | undefined;
    let settledRemoteTile: Tile | undefined;

    const ac1Deadline = Date.now() + WALK_TIMEOUT_MS;
    while (Date.now() < ac1Deadline) {
      const remote = await remoteInfo(pageB, idA);
      if (remote) {
        distinctTiles.add(`${remote.tile.col},${remote.tile.row}`);
        if (movingLatencyMs === null && remote.moving) {
          movingLatencyMs = Date.now() - clickedAt;
        }
        if (movingLatencyMs !== null && !remote.moving) {
          const localPenguin = (await debugInfo(pageA))?.localPenguin;
          if (localPenguin && !localPenguin.moving) {
            settledRemoteTile = remote.tile;
            settledLocalTile = localPenguin.tile;
            break;
          }
        }
      }
      await sleep(POLL_INTERVAL_MS);
    }

    expect(movingLatencyMs, 'B never observed A moving').not.toBeNull();
    console.log(`[movement-sync] AC1: B observed A moving after ${movingLatencyMs}ms`);
    expect(movingLatencyMs as number).toBeLessThanOrEqual(MOVE_SYNC_TIMEOUT_MS);
    expect(
      distinctTiles.size,
      `distinct tiles B observed for A: ${[...distinctTiles].join(' ')}`,
    ).toBeGreaterThanOrEqual(3);
    expect(settledLocalTile, 'A never settled').toBeDefined();
    expect(settledRemoteTile).toEqual(settledLocalTile);

    // --- AC2: B leaves to Dev Pit, A keeps re-routing without ever
    // arriving, B returns to Town Center mid-walk and should place A at
    // A's last arrived tile (AC1's settled tile) — not some in-between
    // tile from a live `move` broadcast, and not by waiting for A to stop.
    const arrivedTileAC1 = settledLocalTile as Tile;

    await pageB.click('button[data-room="dev-pit"]');
    await expect.poll(() => shownRoomId(pageB), { timeout: 5_000 }).toBe('dev-pit');

    // Two tiles far apart and reachable from {2,2} (row 3 and row 5 are
    // fully walkable, connecting the whole Town Center grid) — the same
    // re-route corners `e2e/click-to-move.spec.ts` uses.
    const rerouteTileOne: Tile = { col: 11, row: 9 };
    const rerouteTileTwo: Tile = { col: 11, row: 0 };
    let clicking = true;
    const clickLoop = (async () => {
      let toggle = true;
      while (clicking) {
        await clickTownCenterTile(pageA, toggle ? rerouteTileOne : rerouteTileTwo);
        toggle = !toggle;
        await sleep(REROUTE_INTERVAL_MS);
      }
    })();

    // Let a couple of re-routes happen before checking A never arrives.
    await sleep(REROUTE_INTERVAL_MS * 1.5);
    expect((await debugInfo(pageA))?.localPenguin?.moving).toBe(true);

    await pageB.click('button[data-room="town-center"]');
    await expect.poll(() => shownRoomId(pageB), { timeout: 5_000 }).toBe('town-center');
    await waitUntilJoined(pageB);

    await expect
      .poll(async () => (await remoteInfo(pageB, idA)) !== undefined, { timeout: 5_000 })
      .toBe(true);
    const placedTileForA = (await remoteInfo(pageB, idA))?.placedTile;
    expect(placedTileForA).toEqual(arrivedTileAC1);
    // Still true: B placed A from Presence's last-arrived tile without
    // waiting for A's current, still-in-progress walk to finish.
    expect((await debugInfo(pageA))?.localPenguin?.moving).toBe(true);

    // Stop re-routing and let A actually arrive.
    clicking = false;
    await clickLoop;
    await expect
      .poll(async () => (await debugInfo(pageA))?.localPenguin?.moving, {
        timeout: WALK_TIMEOUT_MS,
      })
      .toBe(false);
    const finalTileA = (await debugInfo(pageA))?.localPenguin?.tile;

    await expect
      .poll(async () => (await remoteInfo(pageB, idA))?.tile, { timeout: WALK_TIMEOUT_MS })
      .toEqual(finalTileA);
  } finally {
    await contextA.close();
    await contextB.close();

    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
  }
});
