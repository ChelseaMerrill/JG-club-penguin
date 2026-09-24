import { expect, test, type Page } from '@playwright/test';
import type { Facing, RoomId, Tile } from '../src/contracts';
import type { PenguinAnim } from '../src/game/penguin/poses';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s debug shape (see
// `e2e/room-framework.spec.ts` for why this is redeclared rather than
// imported: `dev-room-hook.ts` reads `import.meta.env`, which the `e2e`
// tsconfig doesn't type-check). Kept identical, field for field, to
// `e2e/room-framework.spec.ts`'s own copy: TypeScript's global `Window`
// augmentation requires every redeclaration of `__roomDebug` to resolve to
// the same type.
interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
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
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

const LONG_WALK_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Hides the signed-out Landing page, the same way `e2e/smoke.spec.ts` does. */
async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

/** `window.__roomDebug`, deep-cloned across the page boundary (functions never survive this). */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

test('click-to-move', async ({ page }) => {
  // This test walks the Penguin through many real, animated 250ms-per-tile
  // moves (far tile, off-grid snap, a re-route, a facing check, the NPC, the
  // door, plus two Scene restarts) end to end, well past Playwright's default
  // 30s per-test budget.
  test.setTimeout(120_000);

  const errors = collectErrors(page);

  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await hideLandingPage(page);

  // A generous timeout: the very first poll also waits out Phaser/WebGL's
  // cold-start init, which can be slow on a freshly booted webServer.
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .not.toBeUndefined();

  const origin = townCenter.grid.origin;
  const spawnTile = townCenter.spawnTile;

  // Spawns at the Room's spawnTile, idle on `look.emote` (DEFAULT_LOOK's
  // WADDLE here, since this e2e visit is always signed out).
  const spawnInfo = await debugInfo(page);
  expect(spawnInfo?.localPenguin).toMatchObject({ tile: spawnTile, moving: false, anim: 'WADDLE' });

  // --- No keyboard movement (#14 D6): only pointer clicks move the Penguin.
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(150);
  const afterKeysInfo = await debugInfo(page);
  expect(afterKeysInfo?.localPenguin).toMatchObject({ tile: spawnTile, moving: false });

  // --- Click a far walkable tile: shortest path, WALK anim while moving, idle on arrival.
  const farTile: Tile = { col: 2, row: 2 };
  await clickStagePoint(page, tileToScreen(farTile, origin));

  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.moving).toBe(true);
  expect((await debugInfo(page))?.localPenguin?.anim).toBe('WALK');

  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: farTile, moving: false, anim: 'WADDLE' });

  // --- Click an off-grid point: snaps to the nearest walkable tile.
  // Stage (800, 100) -- 150px above the grid origin -- inverts to tile
  // (-3, -3), off the 12x10 walkable mask. Reaching col >= 0 *and* row >= 0
  // both takes at least 3 one-axis-at-a-time steps, so the unique 6-step
  // nearest walkable tile is exactly (0, 0).
  await clickStagePoint(page, { x: origin.x, y: origin.y - 150 });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: { col: 0, row: 0 }, moving: false });

  // --- A new click mid-walk re-routes from the next tile boundary, not the walk's original start.
  const rerouteFirstTarget: Tile = { col: 11, row: 9 };
  const rerouteSecondTarget: Tile = { col: 11, row: 0 };
  await clickStagePoint(page, tileToScreen(rerouteFirstTarget, origin));
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.moving).toBe(true);
  await clickStagePoint(page, tileToScreen(rerouteSecondTarget, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: rerouteSecondTarget, moving: false });

  // --- Walking toward decreasing col (screen x) faces the Penguin left.
  const westOfCurrent: Tile = { col: 0, row: 0 };
  await clickStagePoint(page, tileToScreen(westOfCurrent, origin));
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.facing).toBe('left');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.moving, { timeout: LONG_WALK_TIMEOUT })
    .toBe(false);

  // --- Clicking the NPC walks to its interaction tile and logs npc:arrived.
  const npc = townCenter.npcSlots[0];
  // Masking the NPC's own tile leaves all 4 of its neighbors walkable and
  // tied at distance 1; the lowest-row tie-break picks the one directly
  // above it.
  const npcInteractionTile: Tile = { col: npc.tile.col, row: npc.tile.row - 1 };
  await clickStagePoint(page, tileToScreen(npc.tile, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: npcInteractionTile, moving: false });
  expect((await debugInfo(page))?.npcArrivedLog).toContain(npc.npcId);

  // --- Clicking a door hotspot walks to its approach tile and logs door:reached.
  const door = townCenter.doors.find((candidate) => candidate.targetRoomId !== null);
  if (!door) throw new Error('expected town-center to have at least one enabled door');
  const doorCenter = {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
  await clickStagePoint(page, doorCenter);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.moving, { timeout: LONG_WALK_TIMEOUT })
    .toBe(false);
  expect((await debugInfo(page))?.doorReachedLog).toContain(door.label);

  // The Penguin and its name tag, visible at rest.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/click-to-move/screenshot.png' });

  // --- Scene restart cleans up: no leftover texture listeners, one fresh Penguin each time.
  const baselineListenerCount = (await debugInfo(page))?.textureListenerCount;
  expect(typeof baselineListenerCount).toBe('number');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hasRestartHelper = await page.evaluate(
      () => typeof window.__roomDebug?.restartRoom === 'function',
    );
    expect(hasRestartHelper).toBe(true);

    await page.evaluate(() => window.__roomDebug?.restartRoom?.());

    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: LONG_WALK_TIMEOUT })
      .toEqual(spawnTile);
    expect((await debugInfo(page))?.localPenguin?.moving).toBe(false);
    expect((await debugInfo(page))?.textureListenerCount).toBe(baselineListenerCount);
  }

  expect(errors).toEqual([]);
});
