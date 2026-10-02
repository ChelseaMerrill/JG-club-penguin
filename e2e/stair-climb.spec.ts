import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import {
  stairwell0,
  stairwell1,
  stairwell2,
  stairwell3,
  stairwell4,
  stairwell5,
} from '../src/game/rooms/definitions/stairwell';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';
import { elevatorSeen, watchElevator } from './support/stairwell';

// #51 slice 4: the Stairs Challenge end to end, on the `?asPlayer` fixture
// Player and the in-memory store, in real time (the server's 2 s pacing
// rule included). Imports each definition module directly rather than the
// registry, for the reason `prototype-rooms.spec.ts` gives. Reloads aren't
// checked here: the in-memory store doesn't survive one (B4).

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT }, video: 'on' });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
/** A held key's climb, plus a `too_soon` retry (2 s and a margin) on top. */
const FLIGHT_TIMEOUT = 15_000;
const SHOTS = 'test-results/stair-climb';

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

async function roomIs(page: Page, roomId: RoomId, timeout = WALK_TIMEOUT): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout, intervals: [100] })
    .toBe(roomId);
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

/** Clicks `through`'s hotspot and waits to land in its target Room, on its entry tile. */
async function walkThrough(page: Page, through: RoomDoor): Promise<void> {
  await clickStagePoint(page, {
    x: through.hotspot.x + through.hotspot.width / 2,
    y: through.hotspot.y + through.hotspot.height / 2,
  });
  await roomIs(page, through.targetRoomId!);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(through.entryTile);
}

/** Holds `key` until the Player reaches `roomId`, then lets go. */
async function holdUntil(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown',
  roomId: RoomId,
  timeout = FLIGHT_TIMEOUT,
): Promise<void> {
  await page.keyboard.down(key);
  try {
    await roomIs(page, roomId, timeout);
  } finally {
    await page.keyboard.up(key);
  }
}

/** Opens the Map and clicks tile 12 (floor 0), waiting out any Elevator ride. */
async function mapToFloor0(page: Page): Promise<void> {
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('[data-map-number="12"]').click();
  await roomIs(page, 'stairwell-0');
  await waitForElevatorHidden(page);
}

const tokens = (page: Page) => page.locator('.hud__tokens-value');
const panel = (page: Page) => page.locator('.stair-climb-panel');
const heading = (page: Page) => page.locator('.stair-climb-panel__heading');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('the Stairs Challenge: only a floor-L start counts, 10 a flight, Stair Master once, then the daily cap', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);
  // The fixture's in-memory balance is 100, but `?asPlayer` loads no
  // progress, so the HUD shows 0 until a write reports the balance: "0"
  // below means no Token has changed yet.
  await expect(tokens(page)).toHaveText('0');
  await watchElevator(page);

  // 1. Town Center's STAIRWELL door opens floor 5, which starts nothing.
  await walkThrough(page, door(townCenter, 'STAIRWELL'));
  await expect(panel(page)).toHaveAttribute('data-state', 'floor5-incomplete');
  await expect(heading(page)).toHaveText('STAIRS CHALLENGE · FLOOR 5');
  await expect(tokens(page)).toHaveText('0');
  await expect(page.locator('.stair-climb-hint')).toBeVisible();
  await shot(page, 'panel-floor5-incomplete');

  // 2. Holding ↓ walks all the way down to floor 0 and stops there (the
  // LOBBY door needs a fresh press), logging nothing; ↑ back to floor 1
  // still logs nothing: this visit never started on floor L.
  await holdUntil(page, 'ArrowDown', 'stairwell-0', 60_000);
  // The panel only shows (with a state) once this floor's own call is back.
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('data-state', 'not-started');
  await page.waitForTimeout(3000);
  await expect(tokens(page)).toHaveText('0');
  await shot(page, 'keys-descended-to-floor-0');
  await holdUntil(page, 'ArrowUp', 'stairwell-1');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('data-state', 'not-started');
  await expect(heading(page)).toHaveText('STAIRS CHALLENGE');
  await page.waitForTimeout(3000);
  await expect(tokens(page)).toHaveText('0');
  await shot(page, 'panel-not-started');

  // 3. Map tile 12 starts a climb on floor 0.
  await mapToFloor0(page);
  await expect(heading(page)).toHaveText('STAIRS CHALLENGE · FLIGHT 1 OF 5');
  await expect(page.locator('.stair-climb-panel__count')).toHaveText(
    '0 of 5 flights logged. Reward: 10 tokens per flight. All 5 = Stair Master badge.',
  );
  await shot(page, 'panel-floor-0');

  // 4. Flights 1-2 by holding ↑, 3-5 by the ↑ pill: +10 each on the HUD.
  await holdUntil(page, 'ArrowUp', 'stairwell-1');
  await expect(tokens(page)).toHaveText('110', { timeout: FLIGHT_TIMEOUT });
  await holdUntil(page, 'ArrowUp', 'stairwell-2');
  await expect(tokens(page)).toHaveText('120', { timeout: FLIGHT_TIMEOUT });
  await shot(page, 'keys-climbed-to-floor-2');
  await walkThrough(page, door(stairwell2, 'FLOOR 3'));
  await expect(tokens(page)).toHaveText('130', { timeout: FLIGHT_TIMEOUT });
  await expect(heading(page)).toHaveText('STAIRS CHALLENGE · FLIGHT 4 OF 5');
  await expect(page.locator('.stair-climb-panel__floor')).toHaveText('FLOOR 3 → 4');
  await shot(page, 'panel-floor-3');
  await walkThrough(page, door(stairwell3, 'FLOOR 4'));
  await expect(tokens(page)).toHaveText('140', { timeout: FLIGHT_TIMEOUT });
  await walkThrough(page, door(stairwell4, 'FLOOR 5'));

  // 5. Floor 5: Stair Master's popup with its +50, and no toast.
  const popup = page.locator('.badge-popup');
  await expect(popup).toBeVisible({ timeout: FLIGHT_TIMEOUT });
  await expect(popup).toContainText('Stair Master');
  await expect(popup).toContainText('+50 TOKENS');
  await expect(page.locator('.hud__toast')).toBeHidden();
  await expect(tokens(page)).toHaveText('200');
  await expect(panel(page)).toHaveAttribute('data-state', 'complete');
  await expect(panel(page)).toContainText(
    '5 of 5 flights logged. +50 tokens. Stair Master badge unlocked.',
  );
  await shot(page, 'popup-stair-master');
  await popup.click();
  await expect(popup).toBeHidden();
  await shot(page, 'panel-floor-5-complete');

  // 6. A fresh ↑ on floor 5 climbs the Roof flight: no Elevator, no Tokens.
  await holdUntil(page, 'ArrowUp', 'roof-deck');
  expect(await elevatorSeen(page)).toBe(false);
  await expect(tokens(page)).toHaveText('200');
  await shot(page, 'keys-roof-deck');

  // 7. A second climb from tile 12, holding ↑ the whole way (it chains
  // floor to floor and stops at floor 5): its flights pay until the day's
  // 100, and there's no second Badge.
  await mapToFloor0(page);
  await expect(heading(page)).toHaveText('STAIRS CHALLENGE · FLIGHT 1 OF 5');
  await holdUntil(page, 'ArrowUp', 'stairwell-5', 90_000);
  await expect(panel(page)).toHaveAttribute('data-state', 'complete', { timeout: FLIGHT_TIMEOUT });
  await expect(tokens(page)).toHaveText('250');
  await expect(panel(page)).toContainText('5 of 5 flights logged. Stair Master is already yours.');
  await expect(panel(page)).toContainText(
    '100 tokens climbed today. Flights still count; tokens reset at midnight ET.',
  );
  await expect(popup).toBeHidden();
  await page.waitForTimeout(3000);
  expect((await debugInfo(page))?.roomId).toBe('stairwell-5');
  await shot(page, 'panel-capped');

  expect(errors).toEqual([]);
});

test("a climb left half-done can't be finished from floor 5 down (RT2-1)", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  // Climb to floor 2 from tile 12, then leave for Town Center.
  await mapToFloor0(page);
  await walkThrough(page, door(stairwell0, 'FLOOR 1'));
  await walkThrough(page, door(stairwell1, 'FLOOR 2'));
  await expect(tokens(page)).toHaveText('120', { timeout: FLIGHT_TIMEOUT });
  await page.locator('.hud__button--map').click();
  await page.locator('[data-map-room="town-center"]').click();
  await roomIs(page, 'town-center');
  await waitForElevatorHidden(page);

  // In by Town Center's door, down to floor 2 and up again: nothing logged.
  await walkThrough(page, door(townCenter, 'STAIRWELL'));
  await walkThrough(page, door(stairwell5, 'FLOOR 4'));
  await walkThrough(page, door(stairwell4, 'FLOOR 3'));
  await walkThrough(page, door(stairwell3, 'FLOOR 2'));
  await walkThrough(page, door(stairwell2, 'FLOOR 3'));
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('data-state', 'not-started');
  await page.waitForTimeout(3000);
  await expect(tokens(page)).toHaveText('120');
  await shot(page, 'panel-stale-climb');

  expect(errors).toEqual([]);
});

test('the stair keys do nothing with the chat field focused or the Map open', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('stairwell-2'));
  await roomIs(page, 'stairwell-2');
  await waitForElevatorHidden(page);

  // With the chat field focused, ↑ moves its caret and nothing else.
  const chat = page.locator('.hud__chat-input');
  await chat.click();
  await chat.fill('hello');
  expect(await chat.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(5);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  expect(await chat.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(0);
  await expect(chat).toHaveValue('hello');
  expect((await debugInfo(page))?.roomId).toBe('stairwell-2');
  await shot(page, 'keys-chat-focused');
  await chat.evaluate((input: HTMLInputElement) => input.blur());

  // With the Map open, ↑ does nothing either.
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('.map-screen')).toBeVisible();
  expect((await debugInfo(page))?.roomId).toBe('stairwell-2');
  await shot(page, 'keys-map-open');
  await page.keyboard.press('Escape');

  // Closed again, the same hold climbs.
  await holdUntil(page, 'ArrowUp', 'stairwell-3');

  expect(errors).toEqual([]);
});

test('no stair key climbs, and no climb panel shows, under the Elevator (#163 review)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  // Tile 12 from Town Center rides 5 -> L, and ↑ goes down at once.
  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('[data-map-number="12"]').click();
  const elevator = page.locator('.elevator-screen');
  await expect(elevator).toBeVisible();
  await page.keyboard.down('ArrowUp');
  try {
    // The Room is ready long before the ride ends: until it does, the
    // Player stays on floor 0 and the panel stays hidden.
    await roomIs(page, 'stairwell-0');
    while (await elevator.isVisible()) {
      expect((await debugInfo(page))?.roomId).toBe('stairwell-0');
      await expect(panel(page)).toBeHidden();
      await page.waitForTimeout(250);
    }
    await shot(page, 'keys-after-elevator');
    // Once it hides, the panel shows and the held ↑ climbs.
    await expect(panel(page)).toBeVisible();
    await roomIs(page, 'stairwell-1', FLIGHT_TIMEOUT);
  } finally {
    await page.keyboard.up('ArrowUp');
  }

  expect(errors).toEqual([]);
});
