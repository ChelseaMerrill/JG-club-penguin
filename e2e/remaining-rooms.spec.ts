import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { bathroom } from '../src/game/rooms/definitions/bathroom';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import {
  STAIRWELL_DEFINITIONS,
  stairwell0,
  stairwell5,
} from '../src/game/rooms/definitions/stairwell';
import { teamRoom1 } from '../src/game/rooms/definitions/team-room-1';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';
import { elevatorSeen, watchElevator } from './support/stairwell';

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

// #51 slice 3: the Mullet's two doors lead out only (no Room draws a door
// in, D5), so each test starts in the Mullet and walks out through one.
for (const { label, target } of [
  { label: 'HALLWAY', target: 'office-hallway' },
  { label: 'DEV PIT', target: 'dev-pit' },
] as const) {
  test(`The Mullet: its ${label} door lands on ${target}'s spawn tile`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);

    await page.goto('/?asPlayer');
    await waitForBoot(page);
    await changeRoom(page, 'the-mullet');
    await page.screenshot({ path: 'test-results/room-the-mullet/arrived.png' });

    await walkThrough(page, door(theMullet, label), target);
    await page.screenshot({ path: `test-results/room-the-mullet/to-${target}.png` });

    expect(errors).toEqual([]);
  });
}

// Each new Map tile loads its Room on the Room's own spawn tile.
const MAP_TILES: readonly { number: string; room: RoomDefinition }[] = [
  { number: '07', room: teamRoom4 },
  { number: '08', room: teamRoom1 },
  { number: '09', room: teamRoom2 },
  { number: '10', room: teamRoom3 },
  { number: '11', room: officeHallway },
  { number: '13', room: bathroom },
  { number: '15', room: theMullet },
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

// #51 slice 4: the Stairwell's six floors, joined by their exit pills, with
// Town Center's STAIRWELL door opening floor 5 (UD-2), floor 5's upper
// flight leading to the Roof Deck (S4-D11) and Map tile 12 opening floor 0
// (S4-D7). No stairs move ever shows the Elevator (S4-D6).
const STAIRWELL_SHOTS = 'test-results/remaining-rooms';

test("The Stairwell: Town Center's STAIRWELL door opens floor 5 on its JG HQ sill, and JG HQ leads back, with no Elevator", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await watchElevator(page);

  await walkThrough(page, door(townCenter, 'STAIRWELL'), 'stairwell-5');
  await page.screenshot({ path: 'test-results/room-stairwell-5/from-town-center.png' });
  await walkThrough(page, door(stairwell5, 'JG HQ'), 'town-center');
  await page.screenshot({ path: 'test-results/room-town-center/from-stairwell-5.png' });

  expect(await elevatorSeen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test("The Stairwell: floor 5's upper flight leads to the Roof Deck's spawn tile, with no Elevator", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'stairwell-5');
  await watchElevator(page);

  await walkThrough(page, door(stairwell5, 'ROOF DECK'), 'roof-deck');
  expect((await debugInfo(page))?.localPenguin?.tile).toEqual(roofDeck.spawnTile);
  await page.screenshot({ path: 'test-results/room-roof-deck/from-stairwell-5.png' });

  expect(await elevatorSeen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('The Stairwell: up floor 0 to 5 and back down through every pill door, with no Elevator', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'stairwell-0');
  await waitForElevatorHidden(page); // Town Center -> floor 0 crossed floors.
  await watchElevator(page);
  await page.screenshot({ path: `${STAIRWELL_SHOTS}/stairwell-0.png` });

  for (let floor = 0; floor < 5; floor += 1) {
    const room = STAIRWELL_DEFINITIONS[floor]!;
    await walkThrough(page, door(room, `FLOOR ${floor + 1}`), `stairwell-${floor + 1}` as RoomId);
    await page.screenshot({ path: `${STAIRWELL_SHOTS}/stairwell-${floor + 1}.png` });
    await page.screenshot({
      path: `test-results/room-stairwell-${floor + 1}/from-stairwell-${floor}.png`,
    });
  }
  for (let floor = 5; floor > 0; floor -= 1) {
    const room = STAIRWELL_DEFINITIONS[floor]!;
    const label = floor === 1 ? 'LOBBY' : `FLOOR ${floor - 1}`;
    await walkThrough(page, door(room, label), `stairwell-${floor - 1}` as RoomId);
    await page.screenshot({
      path: `test-results/room-stairwell-${floor - 1}/from-stairwell-${floor}.png`,
    });
  }

  expect(await elevatorSeen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('The Stairwell: Map tile 12 opens floor 0 from Town Center, by the Elevator to "FLOOR L"', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  const tile = page.locator('[data-map-number="12"]');
  await expect(tile).toHaveAttribute('data-map-room', 'stairwell-0');
  await tile.click();

  await expect(page.locator('.elevator-screen')).toBeVisible();
  await expect(page.locator('.elevator-screen__heading')).toHaveText('WADDLING DOWN TO FLOOR L');
  await page.screenshot({ path: 'test-results/room-stairwell-0/elevator-floor-l.png' });
  await waitForElevatorHidden(page);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('stairwell-0');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(stairwell0.spawnTile);
  await expect(page.locator('.hud__title')).toHaveText(stairwell0.title);
  await page.screenshot({ path: 'test-results/room-stairwell-0/from-map.png' });

  // YOU ARE HERE stays on tile 12 on every Stairwell floor (RT2-4).
  await page.locator('.hud__button--map').click();
  await expect(page.locator('[aria-current="location"]')).toHaveAttribute('data-map-number', '12');
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test("The Stairwell: floor 0's LOBBY door is coming soon, clicked or by holding ↓ (UD-7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'stairwell-0');
  await waitForElevatorHidden(page);

  const lobby = door(stairwell0, 'LOBBY');
  await clickStagePoint(page, {
    x: lobby.hotspot.x + lobby.hotspot.width / 2,
    y: lobby.hotspot.y + lobby.hotspot.height / 2,
  });
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, {
      timeout: WALK_TIMEOUT,
      intervals: [50],
    })
    .toBe('LOBBY');
  await page.screenshot({ path: 'test-results/room-stairwell-0/lobby-coming-soon.png' });
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, { timeout: 15_000 })
    .toBeNull();

  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, {
      timeout: WALK_TIMEOUT,
      intervals: [50],
    })
    .toBe('LOBBY');
  await page.keyboard.up('ArrowDown');
  expect((await debugInfo(page))?.roomId).toBe('stairwell-0');

  expect(errors).toEqual([]);
});
