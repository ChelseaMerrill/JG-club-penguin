import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RoomId, Tile } from '../src/contracts';
import { computeDebugOverlay } from '../src/game/rooms/debug-overlay';
import { renderNpcSvg } from '../src/game/npcs/render-npc-svg';
import { lobby } from '../src/game/rooms/definitions/lobby';
import { stairwell0 } from '../src/game/rooms/definitions/stairwell';
import { npcSlotPoint, tileToScreen } from '../src/game/rooms/iso';
import type { RoomDoor } from '../src/game/rooms/room-definition';
import { NPCS } from '../src/npcs/npcs';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';
import { elevatorSeen, watchElevator } from './support/stairwell';
import './support/creator-debug-types';

// #169: the JG HQ Lobby, where every Session starts (floor L), on the
// `?asPlayer` fixture Player. Imports each definition module directly rather
// than the registry, for the reason `prototype-rooms.spec.ts` gives.
// Evidence goes to `test-results/169-*/` (local only, never committed).

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const FIXTURE_PLAYER_ID = 'e2e-fixture-player';
const SPAWN_DIR = 'test-results/169-spawn';
const EXITS_DIR = 'test-results/169-exits';
const LOBBY_DIR = 'test-results/169-lobby';
const FLOOR_DIR = 'test-results/169-floor-display';

declare global {
  interface Window {
    __chatDebug?: Record<string, string>;
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

/** `window.__roomDebug`, deep-cloned across the page boundary. */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function roomIs(page: Page, roomId: RoomId, timeout = WALK_TIMEOUT): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout, intervals: [100] })
    .toBe(roomId);
}

async function tileIs(page: Page, tile: Tile): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: WALK_TIMEOUT })
    .toEqual(tile);
}

/** Converts a Stage pixel point to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

function doors(label: string, room = lobby): RoomDoor[] {
  const found = room.doors.filter((candidate) => candidate.label === label);
  if (found.length === 0) throw new Error(`expected ${room.id} to have a "${label}" door`);
  return found;
}

function centre(door: RoomDoor): { x: number; y: number } {
  return {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
}

/**
 * Records whether the Elevator overlay is ever shown, from the very first
 * script run: before `watchElevator` could attach (the overlay doesn't
 * exist yet), so even the spawn's first frames count.
 */
async function watchElevatorFromBoot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = (): void => {
      const overlay = document.querySelector<HTMLElement>('.elevator-screen');
      if (overlay && !overlay.hidden) document.documentElement.dataset.elevatorSeen = 'yes';
    };
    new MutationObserver(seen).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  });
}

/** The share of near-white (#F4F4F4-ish) pixels in `rect` of a Stage screenshot, decoded in the page. */
async function lightShare(
  page: Page,
  png: Buffer,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number> {
  return page.evaluate(
    async ({ dataUri, rect }) => {
      const img = new Image();
      img.src = dataUri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
      let light = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 225 && data[i + 1]! > 225 && data[i + 2]! > 225) light += 1;
      }
      return light / (rect.width * rect.height);
    },
    { dataUri: `data:image/png;base64,${png.toString('base64')}`, rect },
  );
}

/** Draws the walk mask, doors and NPC slots over the canvas (the `prototype-rooms.spec.ts` overlay, trimmed). */
async function drawDebugOverlay(page: Page): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('game canvas has no bounding box');
  await page.evaluate(
    ({ markers, canvasBox, width, height }) => {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      Object.assign(svg.style, {
        position: 'fixed',
        left: `${canvasBox.x}px`,
        top: `${canvasBox.y}px`,
        width: `${canvasBox.width}px`,
        height: `${canvasBox.height}px`,
        zIndex: '99999',
        pointerEvents: 'none',
      });
      for (const marker of markers) {
        if (marker.kind === 'tile') {
          const polygon = document.createElementNS(NS, 'polygon');
          polygon.setAttribute('points', marker.points);
          polygon.setAttribute(
            'fill',
            marker.walkable ? 'rgba(0,189,255,0.28)' : 'rgba(255,0,80,0.35)',
          );
          polygon.setAttribute('stroke', marker.walkable ? '#00BDFF' : '#FF0050');
          svg.append(polygon);
        } else if (marker.kind === 'door' || marker.kind === 'hotspot') {
          const rect = document.createElementNS(NS, 'rect');
          for (const [key, value] of Object.entries({
            x: marker.x,
            y: marker.y,
            width: marker.width,
            height: marker.height,
          })) {
            rect.setAttribute(key, String(value));
          }
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', '#FFD400');
          rect.setAttribute('stroke-width', '4');
          svg.append(rect);
        } else {
          const circle = document.createElementNS(NS, 'circle');
          circle.setAttribute('cx', String(marker.x));
          circle.setAttribute('cy', String(marker.y));
          circle.setAttribute('r', '8');
          circle.setAttribute('fill', marker.kind === 'npc' ? '#FF00E5' : '#FFA500');
          svg.append(circle);
        }
      }
      document.body.append(svg);
    },
    { markers: computeDebugOverlay(lobby), canvasBox, width: GAME_WIDTH, height: GAME_HEIGHT },
  );
}

const stairClimbPanel = (page: Page) => page.locator('.stair-climb-panel');
const floorDisplay = (page: Page) => page.locator('.floor-display');

test.describe('the JG HQ Lobby (#169)', () => {
  test('(a) a Session spawns in the Lobby: no Elevator, its title, the own "stairs or elevator?" bubble and Security\'s line', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await watchElevatorFromBoot(page);

    await page.goto('/?asPlayer=Pebble&hud');
    await waitForBoot(page);
    await roomIs(page, 'lobby');
    await expect
      .poll(async () => (await debugInfo(page))?.roomEventLog)
      .toEqual([{ type: 'room:enter', roomId: 'lobby' }]);
    await expect(page.locator('.hud__title')).toHaveText('JG HQ LOBBY');
    await expect(page.locator('.hud__subtitle')).toHaveText(
      '108 STATE ST · STREET LEVEL · JAHNEL GROUP IS ON 5',
    );
    expect((await debugInfo(page))?.localPenguin?.tile).toEqual(lobby.spawnTile);
    await expect
      .poll(() => page.evaluate(() => window.__chatDebug))
      .toEqual({ [FIXTURE_PLAYER_ID]: 'stairs or elevator?' });

    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ path: `${SPAWN_DIR}/player-bubble.png` });
    // Security's static bubble ("Badge in. JG is on 5.") sits above his
    // nameplate, where the design draws it (its pill spans 685-855 x
    // 476-506): its top band, left of the own Penguin and above the text.
    const security = npcSlotPoint(
      lobby.npcSlots.find((slot) => slot.npcId === 'security-lobby')!,
      lobby.grid.origin,
    );
    expect(security).toEqual({ x: 770, y: 615 });
    expect(await lightShare(page, shot, { x: 705, y: 482, width: 95, height: 4 })).toBeGreaterThan(
      0.9,
    );
    await page.screenshot({
      path: `${SPAWN_DIR}/security-close-up.png`,
      clip: { x: 620, y: 440, width: 300, height: 240 },
    });
    // The desk hides all but his head, so his whole proposed guard figure
    // (for the screenshot approval) is drawn on its own too.
    const figure = NPCS['security-lobby'];
    if (figure.kind !== 'human') throw new Error('Security should be a Human');
    const sheet = await page.context().newPage();
    try {
      await sheet.setViewportSize({ width: 360, height: 400 });
      await sheet.setContent(
        `<body style="margin:0;background:#202124;display:grid;place-items:center;height:400px">${renderNpcSvg(figure.figure).replace('<svg ', '<svg width="300" height="325" ')}</body>`,
      );
      await sheet.screenshot({ path: `${SPAWN_DIR}/security-figure.png` });
    } finally {
      await sheet.close();
    }

    expect(
      await page.evaluate(() => document.documentElement.dataset.elevatorSeen),
    ).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('(a) the spawn line is said once: walking out and back in says nothing again', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer');
    await waitForBoot(page);
    await expect
      .poll(() => page.evaluate((id) => window.__chatDebug?.[id], FIXTURE_PLAYER_ID))
      .toBe('stairs or elevator?');
    // Clear the debug record, then go out by the STAIRS and come back.
    await page.evaluate(() => {
      window.__chatDebug = {};
    });
    await clickStagePoint(page, centre(doors('STAIRS · FLOOR L')[0]!));
    await roomIs(page, 'stairwell-0');
    await clickStagePoint(page, centre(doors('LOBBY', stairwell0)[0]!));
    await roomIs(page, 'lobby');
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__chatDebug)).toEqual({});

    expect(errors).toEqual([]);
  });

  test('(a) `?asPlayer&room=town-center` spawns straight into Town Center: no Elevator, no spawn line', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await watchElevatorFromBoot(page);

    await page.goto('/?asPlayer&room=town-center');
    await waitForBoot(page);
    await roomIs(page, 'town-center');
    await expect
      .poll(async () => (await debugInfo(page))?.roomEventLog)
      .toEqual([{ type: 'room:enter', roomId: 'town-center' }]);
    await page.waitForTimeout(1000);
    expect(
      await page.evaluate((id) => window.__chatDebug?.[id], FIXTURE_PLAYER_ID),
    ).toBeUndefined();
    expect(
      await page.evaluate(() => document.documentElement.dataset.elevatorSeen),
    ).toBeUndefined();

    expect(errors).toEqual([]);
  });

  test('(a) a new Player after WADDLE IN, and a returning Player, both arrive in the Lobby', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1618, height: 918 });

    await page.goto('/?creator');
    await expect(page.locator('.penguin-creator')).toBeVisible();
    await page.locator('#penguin-creator-name').fill('Waddles');
    await page.locator('.penguin-creator__submit').click();
    await expect(page.locator('.penguin-creator')).toBeHidden();
    await expect(page.locator('.hud')).toBeVisible();
    await roomIs(page, 'lobby');
    await expect(page.locator('.hud__title')).toHaveText('JG HQ LOBBY');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SPAWN_DIR}/new-player.png` });

    await page.goto('/?creator=returning');
    await expect(page.locator('.hud')).toBeVisible();
    await expect(page.locator('.penguin-creator')).toBeHidden();
    await roomIs(page, 'lobby');
    await expect(page.locator('.hud__title')).toHaveText('JG HQ LOBBY');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SPAWN_DIR}/returning-player.png` });

    expect(errors).toEqual([]);
  });

  test('(b)(c) STAIRS · FLOOR L, door and pill, opens floor L with START CLIMB unstarted; LOBBY, its pill and ↓ come back', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer&hud');
    await waitForBoot(page);
    await roomIs(page, 'lobby');
    await watchElevator(page);

    const [stairsDoor, stairsPill] = doors('STAIRS · FLOOR L');
    const [lobbyDoor, lobbyPill] = doors('LOBBY', stairwell0);
    for (const [name, out, back] of [
      ['door', stairsDoor!, lobbyDoor!],
      ['pill', stairsPill!, lobbyPill!],
    ] as const) {
      await clickStagePoint(page, centre(out));
      await roomIs(page, 'stairwell-0');
      await tileIs(page, { col: 0, row: 7 });
      // Arriving from the Lobby never starts a climb: START CLIMB does.
      await expect(stairClimbPanel(page)).toHaveAttribute('data-state', 'not-started');
      await expect(page.locator('.stair-climb-panel__start')).toHaveText('START CLIMB');
      await expect(page.locator('.hud__title')).toHaveText(stairwell0.title);
      await page.screenshot({ path: `${EXITS_DIR}/stairs-${name}-to-floor-L.png` });

      await clickStagePoint(page, centre(back));
      await roomIs(page, 'lobby');
      await tileIs(page, { col: 0, row: 4 });
      await expect(page.locator('.hud__title')).toHaveText('JG HQ LOBBY');
      await page.screenshot({ path: `${EXITS_DIR}/lobby-${name}-from-floor-L.png` });
    }

    await clickStagePoint(page, centre(stairsDoor!));
    await roomIs(page, 'stairwell-0');
    await page.keyboard.down('ArrowDown');
    await roomIs(page, 'lobby');
    await page.keyboard.up('ArrowDown');
    await tileIs(page, { col: 0, row: 4 });
    await page.screenshot({ path: `${EXITS_DIR}/lobby-by-down-key.png` });

    expect(await elevatorSeen(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  for (const which of ['door', 'pill'] as const) {
    test(`(d) the ELEVATOR ${which} rides up to FLOOR 5 (~6 s), then Town Center at its ELEVATOR sill (interim until #170 C)`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const errors = collectErrors(page);

      await page.goto('/?asPlayer&hud');
      await waitForBoot(page);
      await roomIs(page, 'lobby');

      const elevator = doors('ELEVATOR · FLOOR 5')[which === 'door' ? 0 : 1]!;
      await clickStagePoint(page, centre(elevator));
      await expect(page.locator('.elevator-screen')).toBeVisible({ timeout: WALK_TIMEOUT });
      const shownAt = Date.now();
      await expect(page.locator('.elevator-screen__heading')).toHaveText('WADDLING UP TO FLOOR 5');
      if (which === 'door') await page.screenshot({ path: `${EXITS_DIR}/elevator-to-floor-5.png` });
      await waitForElevatorHidden(page);
      expect(Date.now() - shownAt).toBeGreaterThanOrEqual(5_500);
      await roomIs(page, 'town-center');
      await tileIs(page, { col: 0, row: 7 });
      await expect(page.locator('.hud__title')).toHaveText('TOWN CENTER');
      if (which === 'door')
        await page.screenshot({ path: `${EXITS_DIR}/elevator-town-center.png` });

      expect(errors).toEqual([]);
    });
  }

  test('(e) the floor display loops ▲/▼ through L-5 over the plate above the elevator', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer');
    await waitForBoot(page);
    await roomIs(page, 'lobby');

    const display = floorDisplay(page);
    await expect(display).toBeVisible();
    await expect(display).toHaveAttribute('aria-hidden', 'true');
    await expect(display).toHaveCSS('pointer-events', 'none');
    const first = await display.getAttribute('data-floor');
    expect(first).toMatch(/^[▲▼] (L|[1-5])$/);
    await expect
      .poll(() => display.getAttribute('data-floor'), { timeout: 5_000, intervals: [100] })
      .not.toBe(first);

    await page.evaluate(() => document.fonts.ready);
    const clip = { x: 1000, y: 290, width: 170, height: 120 };
    await expect
      .poll(() => display.getAttribute('data-floor'), { timeout: 30_000, intervals: [100] })
      .toMatch(/^▲ [1-5]$/);
    await page.screenshot({ path: `${FLOOR_DIR}/up.png`, clip });
    await expect
      .poll(() => display.getAttribute('data-floor'), { timeout: 30_000, intervals: [100] })
      .toMatch(/^▼ /);
    await page.screenshot({ path: `${FLOOR_DIR}/down.png`, clip });

    // Gone in any Room without a display, and back on returning.
    await clickStagePoint(page, centre(doors('STAIRS · FLOOR L')[0]!));
    await roomIs(page, 'stairwell-0');
    await expect(display).toBeHidden();
    await clickStagePoint(page, centre(doors('LOBBY', stairwell0)[0]!));
    await roomIs(page, 'lobby');
    await expect(display).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("(f) clicking Security opens his line; the SIGN IN desk can't be walked onto", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer');
    await waitForBoot(page);
    await roomIs(page, 'lobby');

    // His nameplate, above the desk.
    await clickStagePoint(page, { x: 770, y: 524 });
    await expect
      .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: WALK_TIMEOUT })
      .toContain('security-lobby');
    const dialog = page.locator('.npc-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.npc-dialog__name')).toHaveText('Security');
    await expect(dialog.locator('.npc-dialog__line')).toHaveText('Badge in. JG is on 5.');
    await page.screenshot({ path: `${SPAWN_DIR}/security-dialog.png` });
    await dialog.locator('.npc-dialog__close').click();
    await expect(dialog).toBeHidden();

    // The desk's middle tile, (4,5): the Penguin never ends up on a desk tile.
    const deskTiles = [
      { col: 3, row: 5 },
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ];
    await clickStagePoint(page, tileToScreen({ col: 4, row: 5 }, lobby.grid.origin));
    await page.waitForTimeout(3000);
    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin?.moving, { timeout: WALK_TIMEOUT })
      .toBe(false);
    expect(deskTiles).not.toContainEqual((await debugInfo(page))?.localPenguin?.tile);

    expect(errors).toEqual([]);
  });

  test('(g) the Lobby matches its design at 1600x900: design, game, side-by-side and the walk-mask overlay', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);

    // 1618x918 gives the Stage its exact 1600x900 (the ring sits outside
    // it), so the game shot is 1:1 with the design.
    await page.setViewportSize({ width: 1618, height: 918 });
    await page.goto('/?asPlayer=You&hud');
    await waitForBoot(page);
    await roomIs(page, 'lobby');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const stage = await page.locator('#game canvas').boundingBox();
    if (!stage) throw new Error('canvas not visible');
    expect([Math.round(stage.width), Math.round(stage.height)]).toEqual([GAME_WIDTH, GAME_HEIGHT]);
    const game = await page.screenshot({ path: `${LOBBY_DIR}/game.png`, clip: stage });
    await drawDebugOverlay(page);
    await page.screenshot({ path: `${LOBBY_DIR}/overlay.png`, clip: stage });

    const designPage = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
    try {
      await designPage.goto(pathToFileURL(path.resolve('design/Room 00 JGHQ Lobby.dc.html')).href);
      const designStage = designPage.locator('[data-screen-label="JG HQ LOBBY"]');
      const rendered = await designStage
        .locator('svg')
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(
        !rendered,
        'BLOCKED: the design page needs its runtime from unpkg.com (network blocked?)',
      );
      await designPage.evaluate(() => document.fonts.ready);
      const design = await designStage.screenshot({ path: `${LOBBY_DIR}/design.png` });

      const composer = await browser.newPage({
        viewport: { width: GAME_WIDTH * 2, height: GAME_HEIGHT },
      });
      try {
        const src = (buffer: Buffer): string =>
          `data:image/png;base64,${buffer.toString('base64')}`;
        await composer.setContent(
          `<body style="margin:0;background:#000;display:flex"><img src="${src(design)}" width="1600" height="900"><img src="${src(game)}" width="1600" height="900"></body>`,
        );
        await composer.screenshot({ path: `${LOBBY_DIR}/side-by-side.png` });
      } finally {
        await composer.close();
      }
    } finally {
      await designPage.close();
    }

    expect(errors).toEqual([]);
  });
});
