import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { bathroom } from '../src/game/rooms/definitions/bathroom';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { STAIRWELL_DEFINITIONS } from '../src/game/rooms/definitions/stairwell';
import { teamRoom1 } from '../src/game/rooms/definitions/team-room-1';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

// Every Room, in the registry's order, imported straight from each
// definition module (as `prototype-rooms.spec.ts` does, and for the same
// reason: the registry module reads `import.meta.env`, which Playwright
// doesn't define).
const ROOMS_IN_REGISTRY_ORDER: readonly RoomDefinition[] = [
  townCenter,
  devPit,
  theMelt,
  roofDeck,
  igloo,
  theIcebox,
  officeHallway,
  teamRoom1,
  teamRoom2,
  teamRoom3,
  teamRoom4,
  bathroom,
  theMullet,
  ...STAIRWELL_DEFINITIONS,
];

/**
 * The first disabled door (`targetRoomId: null`) of any Room, in registry
 * order (#51 slice 4, A5 as amended): Town Center has none left since the
 * Stairwell enabled STAIRWELL, so the example moves on by itself as Rooms
 * land (the Hallway's TEAM ROOM 5 today).
 */
function firstDisabledDoor(): { room: RoomDefinition; door: RoomDoor } {
  for (const room of ROOMS_IN_REGISTRY_ORDER) {
    const door = room.doors.find((candidate) => candidate.targetRoomId === null);
    if (door) return { room, door };
  }
  throw new Error('no disabled door left: pick a new example');
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

  // --- A disabled door (`targetRoomId: null`) shows the "coming soon" hint
  // and leaves the Room unchanged: the first one in registry order (see
  // `firstDisabledDoor`), entered by `__roomDebug.changeRoom` first when it
  // isn't Town Center's.
  const { room: disabledRoom, door: disabledDoor } = firstDisabledDoor();
  const detour = disabledRoom.id !== 'town-center';
  if (detour) {
    await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), disabledRoom.id);
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe(disabledRoom.id);
    await waitForElevatorHidden(page);
  }
  await clickStagePoint(page, doorCenter(disabledDoor));
  // Fast, fixed-interval polls: the default backoff (up to 1 s between
  // checks) could notice the hint up to a second late, eating most of its
  // 2 s window before the "still shown" check below.
  await expect
    .poll(async () => (await debugInfo(page))?.doorReachedLog, {
      timeout: WALK_TIMEOUT,
      intervals: [50],
    })
    .toEqual(expect.arrayContaining([disabledDoor.label]));
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, { intervals: [50] })
    .toBe(disabledDoor.label);
  const hintSeenAt = Date.now();
  expect((await debugInfo(page))?.roomId).toBe(disabledRoom.id);
  await page.screenshot({ path: 'test-results/room-transitions/coming-soon-hint.png' });

  // DOOR_HINT_DURATION_MS (`RoomScene.ts`) is 2000ms: still shown partway
  // through that window, then gone. The "still shown" half is a strict,
  // point-in-time check 1.5 s after the hint was first seen (it would catch
  // the hint disappearing too early); the "gone" half polls generously
  // rather than a fixed wait, so parallel e2e workers' CPU contention can't
  // flake it.
  await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - hintSeenAt)));
  expect((await debugInfo(page))?.comingSoonHint).toBe(disabledDoor.label);
  await expect
    .poll(async () => (await debugInfo(page))?.comingSoonHint, { timeout: 15_000 })
    .toBeNull();
  if (detour) {
    await page.evaluate(() => window.__roomDebug?.changeRoom?.('town-center'));
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe('town-center');
    await waitForElevatorHidden(page);
  }

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
  await waitForElevatorHidden(page); // #52: crossed a floor (5 -> R)
  await page.screenshot({ path: 'test-results/room-transitions/roof-deck.png' });

  // --- MAP -> the Town Center tile (#33): sends the Player back to Town
  // Center's own spawnTile, replacing #15's temporary RETURN TO TOWN CENTER
  // (removed by #33 D7 now that the Map covers every dead end).
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('[data-map-room="town-center"]').click();
  await expect(page.locator('.map-screen')).toBeHidden();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('town-center');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(townCenter.spawnTile);
  await waitForElevatorHidden(page); // #52: crossed a floor (R -> 5)

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
  // no trace here beyond the detour to and from its Room.
  const detourLog: { type: 'room:enter' | 'room:leave'; roomId: RoomId }[] = detour
    ? [
        { type: 'room:leave', roomId: 'town-center' },
        { type: 'room:enter', roomId: disabledRoom.id },
        { type: 'room:leave', roomId: disabledRoom.id },
        { type: 'room:enter', roomId: 'town-center' },
      ]
    : [];
  const log = (await debugInfo(page))?.roomEventLog;
  expect(log).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    ...detourLog,
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
