import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { bathroom } from '../src/game/rooms/definitions/bathroom';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { teamRoom1 } from '../src/game/rooms/definitions/team-room-1';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

// #51: every new Room is reachable by each of its enabled doors, both ways,
// and by its Map tile. Imports each definition module directly rather than
// the registry, for the reason `prototype-rooms.spec.ts` gives.

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;

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

function door(room: RoomDefinition, label: string): RoomDoor {
  const found = room.doors.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`expected ${room.id} to have a "${label}" door`);
  return found;
}

/** Clicks `through`'s hotspot centre and waits to land in its target Room, on its entry tile. */
async function walkThrough(page: Page, through: RoomDoor, expectedRoomId: RoomId): Promise<void> {
  expect(through.targetRoomId).toBe(expectedRoomId);
  await clickStagePoint(page, {
    x: through.hotspot.x + through.hotspot.width / 2,
    y: through.hotspot.y + through.hotspot.height / 2,
  });
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(expectedRoomId);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(through.entryTile);
}

async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
}

test('The Icebox: Town Center <-> Icebox through both doors, landing on each entry tile', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  await walkThrough(page, door(townCenter, 'THE ICEBOX'), 'the-icebox');
  await page.screenshot({ path: 'test-results/room-the-icebox/from-town-center.png' });

  await walkThrough(page, door(theIcebox, 'TOWN CENTER'), 'town-center');

  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'the-icebox' },
    { type: 'room:leave', roomId: 'the-icebox' },
    { type: 'room:enter', roomId: 'town-center' },
  ]);
  expect(errors).toEqual([]);
});

test('The Icebox: Dev Pit <-> Icebox through both doors, landing on each entry tile', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'dev-pit');

  await walkThrough(page, door(devPit, 'THE ICEBOX'), 'the-icebox');
  await page.screenshot({ path: 'test-results/room-the-icebox/from-dev-pit.png' });

  await walkThrough(page, door(theIcebox, 'DEV PIT'), 'dev-pit');

  expect(errors).toEqual([]);
});

test('The Icebox: Map tile 03 loads it on its own spawn tile, with its HUD title', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  const tile = page.locator('[data-map-number="03"]');
  await expect(tile).toHaveAttribute('data-map-room', 'the-icebox');
  await tile.click();

  await expect(page.locator('.map-screen')).toBeHidden();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('the-icebox');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(theIcebox.spawnTile);
  await expect(page.locator('.hud__title')).toHaveText(theIcebox.title);
  await page.screenshot({ path: 'test-results/room-the-icebox/from-map.png' });

  expect(errors).toEqual([]);
});

// #51 slice 2: the Hallway and the four Team Rooms it opens onto, walked
// both ways through each pair of doors.
const TEAM_ROOMS: readonly { room: RoomDefinition; hallwayDoor: string }[] = [
  { room: teamRoom1, hallwayDoor: 'TEAM ROOM 1' },
  { room: teamRoom2, hallwayDoor: 'TEAM ROOM 2' },
  { room: teamRoom3, hallwayDoor: 'TEAM ROOM 3' },
  { room: teamRoom4, hallwayDoor: 'TEAM ROOM 4' },
];

for (const { room, hallwayDoor } of TEAM_ROOMS) {
  test(`${room.title}: Hallway <-> ${room.id} through both doors, landing on each entry tile`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer');
    await waitForBoot(page);
    await changeRoom(page, 'office-hallway');

    await walkThrough(page, door(officeHallway, hallwayDoor), room.id);
    await page.screenshot({ path: `test-results/room-${room.id}/from-hallway.png` });

    await walkThrough(page, door(room, 'HALLWAY'), 'office-hallway');
    await page.screenshot({ path: `test-results/room-office-hallway/from-${room.id}.png` });

    expect(errors).toEqual([]);
  });
}

test("The Hallway: its TOWN CENTER door lands on Town Center's spawn tile", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'office-hallway');

  await walkThrough(page, door(officeHallway, 'TOWN CENTER'), 'town-center');

  expect(errors).toEqual([]);
});

test("The Bathroom: its HALLWAY door lands on the Hallway's spawn tile", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'bathroom');
  await page.screenshot({ path: 'test-results/room-bathroom/arrived.png' });

  await walkThrough(page, door(bathroom, 'HALLWAY'), 'office-hallway');
  await page.screenshot({ path: 'test-results/room-office-hallway/from-bathroom.png' });

  expect(errors).toEqual([]);
});

// Each new Map tile loads its Room on the Room's own spawn tile.
const MAP_TILES: readonly { number: string; room: RoomDefinition }[] = [
  { number: '07', room: teamRoom4 },
  { number: '08', room: teamRoom1 },
  { number: '09', room: teamRoom2 },
  { number: '10', room: teamRoom3 },
  { number: '11', room: officeHallway },
  { number: '13', room: bathroom },
];

for (const { number, room } of MAP_TILES) {
  test(`${room.title}: Map tile ${number} loads it on its own spawn tile, with its HUD title`, async ({
    page,
  }) => {
    const errors = collectErrors(page);

    await page.goto('/?asPlayer&hud');
    await waitForBoot(page);

    await page.locator('.hud__button--map').click();
    await expect(page.locator('.map-screen')).toBeVisible();
    const tile = page.locator(`[data-map-number="${number}"]`);
    await expect(tile).toHaveAttribute('data-map-room', room.id);
    await tile.click();

    await expect(page.locator('.map-screen')).toBeHidden();
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe(room.id);
    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
      .toEqual(room.spawnTile);
    await expect(page.locator('.hud__title')).toHaveText(room.title);
    await page.screenshot({ path: `test-results/room-${room.id}/from-map.png` });

    expect(errors).toEqual([]);
  });
}
