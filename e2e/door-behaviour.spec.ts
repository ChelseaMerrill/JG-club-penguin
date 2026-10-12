import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { STAIRWELL_DEFINITIONS } from '../src/game/rooms/definitions/stairwell';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #170 PR A: door behaviour after `design/door-nav.js`. The hover pill, the
 * 250 ms fade (which swallows Stage clicks), locked doors (UNDER
 * CONSTRUCTION, no walk), Tab and Enter on doors, and Anthony on Enter.
 * Evidence goes under `test-results/170-a-*`, one directory per test.
 */

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
/** #146 post 3 (Town Center's DEV PIT door), one minute into its window. */
const TOWN_CENTER_DEV_PIT = 3 * 600_000 + 60_000;

declare global {
  interface Window {
    __phishingTest?: {
      setNow(ms: number): Promise<void>;
      correctChoice(): number | null;
    };
    __fadeSamples?: { opacity: number; roomId: string | undefined; state: string | undefined }[];
  }
}

function proofDir(name: string): string {
  const dir = `test-results/170-a-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

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

async function boot(page: Page, query = '?asPlayer&hud'): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.evaluate(() => {
    const landing = document.querySelector<HTMLElement>('#ui .landing');
    if (landing) landing.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await expect
    .poll(async () => (await debugInfo(page))?.roomEventLog?.length ?? 0)
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
}

async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
  await waitForElevatorHidden(page);
  await expect
    .poll(async () => (await debugInfo(page))?.roomEventLog?.at(-1))
    .toEqual({ type: 'room:enter', roomId });
}

/** A Stage pixel point (1600x900) as a page point, through the canvas's own box. */
async function pagePoint(page: Page, point: { x: number; y: number }) {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  return {
    x: box.x + (point.x * box.width) / GAME_WIDTH,
    y: box.y + (point.y * box.height) / GAME_HEIGHT,
  };
}

function door(room: RoomDefinition, label: string): RoomDoor {
  const found = room.doors.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`${room.id} has no ${label} door`);
  return found;
}

/**
 * Moves the pointer onto `target` at a point that hovers it (the centre, or
 * nearer its top or bottom where an NPC's click zone covers the centre) and
 * returns that Stage point.
 */
async function hoverDoor(page: Page, target: RoomDoor): Promise<{ x: number; y: number }> {
  const { x, y, width, height } = target.hotspot;
  for (const point of [
    { x: x + width / 2, y: y + height / 2 },
    { x: x + width / 2, y: y + 20 },
    { x: x + width / 2, y: y + height - 20 },
  ]) {
    const at = await pagePoint(page, point);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    try {
      await expect
        .poll(async () => (await debugInfo(page))?.hoveredDoor, { timeout: 1_000 })
        .toBe(target.label);
      return point;
    } catch {
      // An NPC's click zone covers this point; try the next.
    }
  }
  throw new Error(`could not hover ${target.label}`);
}

const pill = (page: Page) => page.locator('.door-hover');

/** The pill's Stage-pixel anchor, rounded to whole pixels (the pointer maps back through the canvas scale). */
async function pillLeftTop(page: Page): Promise<{ x: number; y: number }> {
  const { left, top } = await pill(page).evaluate((el) => ({
    left: (el as HTMLElement).style.left,
    top: (el as HTMLElement).style.top,
  }));
  return { x: Math.round(parseFloat(left)), y: Math.round(parseFloat(top)) };
}

/** `point` as `pillLeftTop` reports it: within a pixel either way. */
function near(point: { x: number; y: number }) {
  const close = (value: number) => ({
    asymmetricMatch: (actual: number) => Math.abs(actual - value) <= 1,
  });
  return { x: close(point.x), y: close(point.y) };
}

test('hover: "CLICK TO ENTER · X" follows the pointer over a door, and goes off it (D3)', async ({
  page,
}) => {
  const dir = proofDir('hover');
  const errors = collectErrors(page);
  await boot(page);

  const devPit = door(townCenter, 'DEV PIT');
  const at = await hoverDoor(page, devPit);
  await expect(pill(page)).toBeVisible();
  await expect(pill(page)).toHaveText('CLICK TO ENTER · DEV PIT');
  await expect(pill(page)).not.toHaveClass(/door-hover--locked/);
  expect(await pillLeftTop(page)).toEqual(near(at));
  await page.screenshot({ path: `${dir}/open.png` });

  // It follows the pointer.
  const next = { x: at.x - 10, y: at.y + 12 };
  const nextAt = await pagePoint(page, next);
  await page.mouse.move(nextAt.x, nextAt.y);
  await expect.poll(() => pillLeftTop(page)).toEqual(near(next));

  // Off the door, it goes.
  const floor = await pagePoint(page, { x: 800, y: 600 });
  await page.mouse.move(floor.x, floor.y);
  await expect(pill(page)).toBeHidden();
  expect((await debugInfo(page))?.hoveredDoor).toBeNull();
  expect(errors).toEqual([]);
});

test('locked: grey "X · UNDER CONSTRUCTION", and a click shows the hint with no walk (D4, RT170-9)', async ({
  page,
}) => {
  const dir = proofDir('locked');
  const errors = collectErrors(page);
  await boot(page);
  await changeRoom(page, 'office-hallway');

  const locked = door(officeHallway, 'TEAM ROOM 5');
  expect(locked.targetRoomId).toBeNull();
  const at = await hoverDoor(page, locked);
  await expect(pill(page)).toHaveText('TEAM ROOM 5 · UNDER CONSTRUCTION');
  await expect(pill(page)).toHaveClass(/door-hover--locked/);
  await page.screenshot({ path: `${dir}/hover-locked.png` });

  const before = await debugInfo(page);
  const click = await pagePoint(page, at);
  await page.mouse.click(click.x, click.y);
  await expect
    .poll(async () => (await debugInfo(page))?.lockedHint, { intervals: [50] })
    .toBe('TEAM ROOM 5');
  await expect(pill(page)).toHaveText('UNDER CONSTRUCTION');
  await page.screenshot({ path: `${dir}/under-construction-hint.png` });
  const after = await debugInfo(page);
  expect(after?.roomId).toBe('office-hallway');
  expect(after?.localPenguin?.tile).toEqual(before?.localPenguin?.tile);
  expect(after?.localPenguin?.moving).toBe(false);
  expect(after?.localPenguinMoveLog?.length).toBe(before?.localPenguinMoveLog?.length);
  expect(after?.doorReachedLog ?? []).not.toContain('TEAM ROOM 5');
  expect(errors).toEqual([]);
});

test('fade: a door fades to opaque before the restart, swallows Stage clicks, then clears (D5, RT170-10)', async ({
  page,
}) => {
  const dir = proofDir('fade');
  const errors = collectErrors(page);
  await boot(page);

  // Sample the fade and the Room every frame.
  await page.evaluate(() => {
    window.__fadeSamples = [];
    const layer = document.querySelector<HTMLElement>('.door-fade')!;
    const sample = () => {
      window.__fadeSamples!.push({
        opacity: Number(getComputedStyle(layer).opacity),
        roomId: window.__roomDebug?.roomId,
        state: window.__roomDebug?.fade?.state,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  // Dev Pit's art arrives 1.5 s late, so the restart (and the opaque fade
  // over it) lasts long enough to look at.
  await page.route('**/rooms/dev-pit.png', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  // Resolves on the first frame the fade is partway in, with its opacity.
  const partway = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const layer = document.querySelector<HTMLElement>('.door-fade')!;
        const check = () => {
          const opacity = Number(getComputedStyle(layer).opacity);
          if (opacity > 0.05 && opacity < 0.95) resolve(opacity);
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );

  const devPit = door(townCenter, 'DEV PIT');
  const click = await pagePoint(page, {
    x: devPit.hotspot.x + devPit.hotspot.width / 2,
    y: devPit.hotspot.y + devPit.hotspot.height / 2,
  });
  await page.mouse.click(click.x, click.y);
  expect(await partway).toBeGreaterThan(0);
  await page.screenshot({ path: `${dir}/mid-fade.png` });
  await expect
    .poll(async () => (await debugInfo(page))?.fade?.state, {
      timeout: WALK_TIMEOUT,
      intervals: [20],
    })
    .toBe('opaque');
  await page.screenshot({ path: `${dir}/opaque.png` });

  // Up, the fade layer is what the pointer hits anywhere on the Stage, so a
  // floor click mid-fade reaches nothing.
  const floor = await pagePoint(page, { x: 800, y: 600 });
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.className ?? null,
    floor,
  );
  expect(topmost).toContain('door-fade');
  // The doors' keyboard layer is inert for the whole transition (review MINOR-1).
  await expect(page.locator('.door-focus')).toHaveAttribute('inert', '');
  expect((await debugInfo(page))?.fade?.blocking).toBe(true);
  expect((await debugInfo(page))?.roomId).toBe('town-center');
  await page.mouse.click(floor.x, floor.y);

  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');
  await expect
    .poll(async () => (await debugInfo(page))?.fade?.state, { timeout: 5_000 })
    .toBe('hidden');
  const end = await debugInfo(page);
  // Landed on the door's entry tile, not walked off by the swallowed click.
  expect(end?.localPenguin?.tile).toEqual(devPit.entryTile);
  expect(end?.localPenguinMoveLog ?? []).toEqual([]);
  expect(end?.roomEventLog?.slice(-2)).toEqual([
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'dev-pit' },
  ]);

  const samples = await page.evaluate(() => window.__fadeSamples ?? []);
  const opaqueInTownCenter = samples.filter(
    (sample) => sample.roomId === 'town-center' && sample.opacity >= 0.99,
  );
  expect(opaqueInTownCenter.length, 'opaque before the restart').toBeGreaterThan(0);
  const firstDevPit = samples.findIndex((sample) => sample.roomId === 'dev-pit');
  expect(firstDevPit).toBeGreaterThan(0);
  expect(samples.at(-1)?.opacity).toBe(0);
  expect(errors).toEqual([]);
});

test('the Map never fades (D5)', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => {
    window.__fadeSamples = [];
    const sample = () => {
      window.__fadeSamples!.push({
        opacity: 0,
        roomId: window.__roomDebug?.roomId,
        state: window.__roomDebug?.fade?.state,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('[data-map-number="02"]').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');
  const states = await page.evaluate(() => (window.__fadeSamples ?? []).map((s) => s.state));
  expect(states.every((state) => state === 'hidden')).toBe(true);
  expect(errors).toEqual([]);
});

test('keyboard: Tab reaches each label once (twins skipped), focus shows the pill, Enter uses the door (D6, RT170-12)', async ({
  page,
}) => {
  const dir = proofDir('keyboard');
  const errors = collectErrors(page);
  await boot(page);

  // Floor 5's JG HQ door and its "↙ FLOOR 5 · JG HQ" pill twin.
  await changeRoom(page, 'stairwell-5');
  const floor5 = STAIRWELL_DEFINITIONS.find((room) => room.id === 'stairwell-5')!;
  const buttons = page.locator('.door-focus__door');
  await expect(buttons).toHaveCount(floor5.doors.length);
  const stops = await buttons.evaluateAll((els) =>
    els.map((el) => ({
      label: el.getAttribute('data-door-label'),
      tab: (el as HTMLElement).tabIndex,
    })),
  );
  const seen = new Set<string>();
  expect(stops).toEqual(
    floor5.doors.map((exit) => {
      const tab = seen.has(exit.label) ? -1 : 0;
      seen.add(exit.label);
      return { label: exit.label, tab };
    }),
  );
  expect(stops.filter((stop) => stop.tab === -1).length).toBeGreaterThan(0);

  // Tab walks the stops in order, skipping the twin.
  await buttons.first().focus();
  const tabbed: (string | null)[] = [
    await page.evaluate(() => document.activeElement?.getAttribute('data-door-label') ?? null),
  ];
  for (let i = 1; i < stops.filter((stop) => stop.tab === 0).length; i += 1) {
    await page.keyboard.press('Tab');
    tabbed.push(
      await page.evaluate(() => document.activeElement?.getAttribute('data-door-label') ?? null),
    );
  }
  expect(tabbed).toEqual(stops.filter((stop) => stop.tab === 0).map((stop) => stop.label));

  // Back in Town Center: focus shows DEV PIT's pill, Enter walks there and changes Room.
  await changeRoom(page, 'town-center');
  const devPit = door(townCenter, 'DEV PIT');
  await page.locator('.door-focus__door[data-door-label="DEV PIT"]').focus();
  await expect(pill(page)).toHaveText('CLICK TO ENTER · DEV PIT');
  expect((await debugInfo(page))?.hoveredDoor).toBe('DEV PIT');
  await expect(page.locator('.door-focus__door[data-door-label="DEV PIT"]')).toHaveAttribute(
    'aria-label',
    'CLICK TO ENTER · DEV PIT',
  );
  await page.screenshot({ path: `${dir}/focus-dev-pit.png` });
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(devPit.entryTile);
  expect(errors).toEqual([]);
});

test('keyboard: the doors are inert while an overlay is open, and wake when it closes (D6)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  const layer = page.locator('.door-focus');
  await expect(layer).not.toHaveAttribute('inert', /.*/);
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(layer).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-screen')).toBeHidden();
  await expect(layer).not.toHaveAttribute('inert', /.*/);
  expect(errors).toEqual([]);
});

test('Enter on a door Anthony guards opens him once, with no Room change (D7, n3)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page, '?asPlayer&hud&phishing');
  await expect.poll(() => page.evaluate(() => Boolean(window.__phishingTest))).toBe(true);
  await page.evaluate((at) => window.__phishingTest!.setNow(at), TOWN_CENTER_DEV_PIT);
  await expect
    .poll(async () => (await debugInfo(page))?.guard?.doorLabel, { timeout: WALK_TIMEOUT })
    .toBe('DEV PIT');

  await page.locator('.door-focus__door[data-door-label="DEV PIT"]').focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText('DOOR BOSS · PHISHING QUIZ');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.moving, { timeout: WALK_TIMEOUT })
    .toBe(false);
  const info = await debugInfo(page);
  expect(info?.roomId).toBe('town-center');
  expect((info?.npcArrivedLog ?? []).filter((id) => id === 'anthony')).toEqual(['anthony']);
  expect(info?.doorReachedLog ?? []).not.toContain('DEV PIT');
  expect(errors).toEqual([]);
});
