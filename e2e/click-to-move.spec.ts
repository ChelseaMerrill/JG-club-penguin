import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_LOOK, type PenguinLook, type Tile } from '../src/contracts';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';
import { TILE_STEP_MS } from '../src/game/movement/speed';

/** Generous: the very first poll also waits out Phaser/WebGL's cold-start init. */
const BOOT_TIMEOUT = 15_000;
/** Generous per real, animated 250ms-per-tile walk this spec waits out. */
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

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
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
  await waitForBoot(page);

  const origin = townCenter.grid.origin;
  const spawnTile = townCenter.spawnTile;

  // Spawns at the Room's spawnTile, idle on `look.emote` (DEFAULT_LOOK's
  // WADDLE here, since this e2e visit is always signed out).
  const spawnInfo = await debugInfo(page);
  expect(spawnInfo?.localPenguin).toMatchObject({ tile: spawnTile, moving: false, anim: 'WADDLE' });
  expect(spawnInfo?.localPenguinMoveLog).toEqual([]);
  expect(spawnInfo?.localPenguinArrivedLog).toEqual([]);

  // --- No keyboard movement (#14 D6): only pointer clicks move the Penguin.
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(150);
  const afterKeysInfo = await debugInfo(page);
  expect(afterKeysInfo?.localPenguin).toMatchObject({ tile: spawnTile, moving: false });

  // --- A click on the Penguin's own tile is a no-op (#14 review fix 6): no
  // move, and nothing added to the move log.
  await clickStagePoint(page, tileToScreen(spawnTile, origin));
  await page.waitForTimeout(150);
  const afterOwnTileClick = await debugInfo(page);
  expect(afterOwnTileClick?.localPenguin).toMatchObject({ tile: spawnTile, moving: false });
  expect(afterOwnTileClick?.localPenguinMoveLog).toEqual([]);
  expect(afterOwnTileClick?.localPenguinArrivedLog).toEqual([]);

  // --- Click a far walkable tile: shortest path, WALK anim while moving,
  // idle on arrival, and the move log grows by one, recording that target
  // (#14 review fix 8). (2, 2) is still walkable under Town Center's real
  // mask (#16): row 2's mask keeps cols 0-3 open, and it's still reachable
  // from spawnTile (6, 8) via row 3's and row 5's fully-walkable rows.
  const farTile: Tile = { col: 2, row: 2 };
  const logBeforeFarClick = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
  await clickStagePoint(page, tileToScreen(farTile, origin));

  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.moving).toBe(true);
  expect((await debugInfo(page))?.localPenguin?.anim).toBe('WALK');
  expect((await debugInfo(page))?.localPenguinMoveLog).toHaveLength(logBeforeFarClick + 1);
  expect((await debugInfo(page))?.localPenguinMoveLog?.at(-1)).toEqual(farTile);

  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: farTile, moving: false, anim: 'WADDLE' });
  // Exactly one arrival, at the far tile, for this one completed walk (#43 D1).
  expect((await debugInfo(page))?.localPenguinArrivedLog).toEqual([farTile]);

  // --- R1 (#43 D1): a click that lands while walking, on the very tile the
  // current in-flight step is about to arrive at, still ends the walk with
  // an arrival — the queued move resolves to the tile the Penguin now
  // stands on, but a walk was genuinely in progress until this resolved, so
  // remotes still need to re-route to stop here. Walked entirely along Town
  // Center's row 5, fully walkable end to end (#16), so the path from col 2
  // to col 6 is a deterministic straight line and the tile one step along it
  // is always {col: 3, row: 5}.
  const r1WalkStart: Tile = { col: 2, row: 5 };
  const r1NextTile: Tile = { col: 3, row: 5 };
  const r1FarTarget: Tile = { col: 6, row: 5 };

  await clickStagePoint(page, tileToScreen(r1WalkStart, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: r1WalkStart, moving: false });

  const arrivalsBeforeR1 = (await debugInfo(page))?.localPenguinArrivedLog?.length ?? 0;

  await clickStagePoint(page, tileToScreen(r1FarTarget, origin));
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.moving).toBe(true);

  // Clicked well within the first 250ms-per-tile step, so it queues instead
  // of applying immediately, and lands exactly when that first step's tween
  // completes and arrives at {3,5}.
  await page.waitForTimeout(TILE_STEP_MS / 3);
  await clickStagePoint(page, tileToScreen(r1NextTile, origin));

  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: r1NextTile, moving: false });
  expect((await debugInfo(page))?.localPenguinArrivedLog?.length).toBe(arrivalsBeforeR1 + 1);
  expect((await debugInfo(page))?.localPenguinArrivedLog?.at(-1)).toEqual(r1NextTile);
  expect((await debugInfo(page))?.localPenguinMoveLog?.at(-1)).toEqual(r1NextTile);

  // --- Click an off-grid point: snaps to the nearest walkable tile.
  // Stage (800, 100) -- 150px above the grid origin -- inverts to tile
  // (-3, -3), off the 12x10 grid. `nearestWalkable`'s BFS expands in
  // Manhattan rings, so its distance to any in-bounds tile (col, row) is
  // (col + row + 6) (both offsets are already positive past 3 steps each
  // way). Under Town Center's real mask (#16, not the old fully-walkable
  // layout #14 was written against), the walkable tile minimizing col + row
  // is a tie at col + row = 2 between (2, 0) and (0, 2) -- no walkable tile
  // reaches col + row = 0 or 1 (row 0's mask opens at col 2 earliest; row 1's
  // and col 0's/col 1's masks are closed at the low end). The BFS's
  // lowest-row-then-column tie-break checks row 0 first, so (2, 0) wins.
  await clickStagePoint(page, { x: origin.x, y: origin.y - 150 });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: { col: 2, row: 0 }, moving: false });

  // --- A new click mid-walk queues a re-route rather than snapping forward
  // (#14 review fix 3): it's applied once the in-flight tile step
  // completes, so the move log only grows by 2 (one per click) once both
  // moves have actually started, and its last entry is the re-route's own
  // target, not some snapped intermediate tile (#14 review fix 8). Both
  // corners are still walkable under the real mask (row 9's and row 0's
  // masks both keep col 11 open), and both stay reachable from the current
  // tile: row 3 and row 5 are fully walkable end to end, so they connect
  // every other walkable tile in the grid into one component.
  const rerouteFirstTarget: Tile = { col: 11, row: 9 };
  const rerouteSecondTarget: Tile = { col: 11, row: 0 };
  const logBeforeReroute = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
  const arrivalsBeforeReroute = (await debugInfo(page))?.localPenguinArrivedLog?.length ?? 0;
  await clickStagePoint(page, tileToScreen(rerouteFirstTarget, origin));
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.moving).toBe(true);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguinMoveLog?.length)
    .toBe(logBeforeReroute + 1);
  // Still walking toward the first target: no arrival yet.
  expect((await debugInfo(page))?.localPenguinArrivedLog?.length).toBe(arrivalsBeforeReroute);

  await clickStagePoint(page, tileToScreen(rerouteSecondTarget, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguinMoveLog?.length, {
      timeout: LONG_WALK_TIMEOUT,
    })
    .toBe(logBeforeReroute + 2);
  expect((await debugInfo(page))?.localPenguinMoveLog?.at(-1)).toEqual(rerouteSecondTarget);
  // The re-route itself queued mid-walk: still no arrival for the
  // interrupted first target.
  expect((await debugInfo(page))?.localPenguinArrivedLog?.length).toBe(arrivalsBeforeReroute);

  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: rerouteSecondTarget, moving: false });
  // Exactly one arrival now that the re-routed walk actually ended, at its
  // own (re-routed) target, not the first target it was interrupted before.
  expect((await debugInfo(page))?.localPenguinArrivedLog?.length).toBe(arrivalsBeforeReroute + 1);
  expect((await debugInfo(page))?.localPenguinArrivedLog?.at(-1)).toEqual(rerouteSecondTarget);

  // --- Walking toward decreasing col (screen x) faces the Penguin left, and
  // mirrors its sprite (`flipX`, #14 review fix 8). The Penguin is currently
  // at rerouteSecondTarget, (11, 0); row 0's real mask only keeps cols 2, 10
  // and 11 walkable (#16), so the nearest walkable tile west of col 11 is
  // the adjacent col 10 -- a single leftward step, still enough to exercise
  // facing/flipX.
  const westOfCurrent: Tile = { col: 10, row: 0 };
  await clickStagePoint(page, tileToScreen(westOfCurrent, origin));
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.facing).toBe('left');
  expect((await debugInfo(page))?.localPenguin?.flipX).toBe(true);
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

  // Clicking the same NPC again while already on its interaction tile still
  // counts as arriving (no walk needed), so its dialog can reopen (#36).
  const arrivalsBefore = (await debugInfo(page))?.npcArrivedLog?.length ?? 0;
  await clickStagePoint(page, tileToScreen(npc.tile, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog?.length)
    .toBe(arrivalsBefore + 1);
  expect((await debugInfo(page))?.localPenguin).toMatchObject({ tile: npcInteractionTile });

  // --- Clicking a door hotspot walks to its approach tile and logs
  // door:reached. Hand-computed like the NPC case above, against DEV PIT's
  // real `door()`-styled hotspot (#16): centre (1270 + 35, 355 + 82.5) =
  // (1305, 437.5) inverts, via `screenToTile`'s linear map, to raw tile
  // (8, -2) -- off the 12x10 grid on the row axis only (col 8 is already in
  // range). `nearestWalkable`'s BFS distance from (8, -2) to an in-bounds
  // tile (col, row) is |col - 8| + (row + 2); minimizing that over the real
  // mask's walkable tiles ties at distance 4 between (10, 0) and (9, 1) --
  // no walkable tile gets closer (row 0's mask has nothing at col 6 or 7;
  // row 1's has nothing at col 8). The lowest-row-then-column tie-break
  // reaches row 0 first, where col 10 (checked before the closer-looking but
  // unwalkable col 6) is the first walkable hit, so (10, 0) wins.
  const door = townCenter.doors.find((candidate) => candidate.targetRoomId !== null);
  if (!door) throw new Error('expected town-center to have at least one enabled door');
  const doorApproachTile: Tile = { col: 10, row: 0 };
  const doorCenter = {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
  await clickStagePoint(page, doorCenter);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
    .toMatchObject({ tile: doorApproachTile, moving: false });
  expect((await debugInfo(page))?.doorReachedLog).toContain(door.label);

  // The Penguin, visible at rest. Its look is still `DEFAULT_LOOK` here
  // (the name is set below), so the World's name gate (#75) hides the name
  // tag: no placeholder for an unnamed Penguin.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/click-to-move/screenshot.png' });

  // --- Scene restart cleans up: no leftover texture listeners, exactly one
  // Penguin, each time.
  const baselineListenerCount = (await debugInfo(page))?.textureListenerCount;
  expect(typeof baselineListenerCount).toBe('number');
  expect((await debugInfo(page))?.penguinCount).toBe(1);
  // Signed out: no Room channel, so `RoomPenguinView` (#28) draws no remote Penguins.
  expect((await debugInfo(page))?.remotePenguinCount).toBe(0);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hasRestartHelper = await page.evaluate(
      () => typeof window.__roomDebug?.restartRoom === 'function',
    );
    expect(hasRestartHelper).toBe(true);

    const restartCountBefore = (await debugInfo(page))?.restartCount ?? 0;
    await page.evaluate(() => window.__roomDebug?.restartRoom?.());

    // Guards the listener-count/penguin-count checks below against a race
    // (#14 review fix 8): without first confirming the restart actually ran
    // (via its own counter), the poll below could observe stale,
    // pre-restart state and pass even if the restart itself leaked
    // something.
    await expect
      .poll(async () => (await debugInfo(page))?.restartCount, { timeout: LONG_WALK_TIMEOUT })
      .toBeGreaterThan(restartCountBefore);

    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: LONG_WALK_TIMEOUT })
      .toEqual(spawnTile);
    expect((await debugInfo(page))?.localPenguin?.moving).toBe(false);
    expect((await debugInfo(page))?.textureListenerCount).toBe(baselineListenerCount);
    expect((await debugInfo(page))?.penguinCount).toBe(1);
  }

  expect(errors).toEqual([]);
});

test('HUD clicks never move the Penguin (#14 review fix 8)', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);

  const before = await debugInfo(page);
  const spawnTile = before?.localPenguin?.tile;
  expect(spawnTile).toBeDefined();

  await page.locator('.hud__button--menu').click();
  await page.waitForTimeout(150);

  const after = await debugInfo(page);
  expect(after?.localPenguin?.tile).toEqual(spawnTile);
  expect(after?.localPenguin?.moving).toBe(false);

  // MENU opened its sign-out panel; close it so the page is left clean.
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test('sign-in updates the local Penguin look and playerId (#14 review fixes 1 and 4)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);

  const before = await debugInfo(page);
  expect(before?.localPenguin).toMatchObject({
    lookName: DEFAULT_LOOK.name,
    lookBody: DEFAULT_LOOK.body,
    playerId: 'local',
  });

  const newLook: PenguinLook = { ...DEFAULT_LOOK, body: '#00BDFF', name: 'Milli' };
  await page.evaluate(({ id, look }) => window.__roomDebug?.setRegisteredPlayer?.({ id, look }), {
    id: 'player-42',
    look: newLook,
  });

  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.lookBody).toBe('#00BDFF');
  const after = await debugInfo(page);
  expect(after?.localPenguin?.lookName).toBe('Milli');
  expect(after?.localPenguin?.playerId).toBe('player-42');

  expect(errors).toEqual([]);
});

test('wave/dance evidence screenshot (#14 review fix 8)', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);

  const spawnTile = townCenter.spawnTile;
  const waveTile: Tile = { col: spawnTile.col - 2, row: spawnTile.row };
  const danceTile: Tile = { col: spawnTile.col + 2, row: spawnTile.row };

  await page.evaluate(({ tile, look }) => window.__roomDebug?.spawnDebugPenguin?.(tile, look), {
    tile: waveTile,
    look: { ...DEFAULT_LOOK, emote: 'WAVE' } as PenguinLook,
  });
  await page.evaluate(({ tile, look }) => window.__roomDebug?.spawnDebugPenguin?.(tile, look), {
    tile: danceTile,
    look: { ...DEFAULT_LOOK, emote: 'DANCE' } as PenguinLook,
  });

  // Let a few animation frames render before capturing.
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/click-to-move/wave-dance.png' });

  expect(errors).toEqual([]);
});
