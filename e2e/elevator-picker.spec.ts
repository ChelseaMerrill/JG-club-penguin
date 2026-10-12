import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #170 PR C (D9, RT170-11): the Elevator floor picker. Both Elevator doors ask
 * which floor first; the picker is a modal dialog that every close path
 * resolves without a Room change. Screenshots (for the owner's approval, H3)
 * go to `test-results/170-picker/`.
 */

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const SHOTS = 'test-results/170-picker';
const HIT_AREA = npcLayout({ kind: 'human' }).hitArea;
/** DN5 post 15 (Town Center's ELEVATOR · ROOF DECK door), one minute into its window. */
const TOWN_CENTER_ELEVATOR = 15 * 600_000 + 60_000;

const TC_DOOR = townCenter.doors.find((door) => door.label === 'ELEVATOR · ROOF DECK')!;
const RD_PILL = roofDeck.doors.find((door) => door.label === 'ELEVATOR')!;

declare global {
  interface Window {
    __phishingTest?: { setNow(ms: number): Promise<void>; correctChoice(): number | null };
  }
}

test.beforeAll(() => {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
});

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
  await page.evaluate(() => document.fonts.ready);
}

async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
  await waitForElevatorHidden(page);
}

/** A point on `door` that no walking NPC's click zone covers right now. */
async function clearDoorPoint(page: Page, door: RoomDoor): Promise<{ x: number; y: number }> {
  const npcs = Object.values((await debugInfo(page))?.npcs ?? {});
  const covered = (x: number, y: number) =>
    npcs.some(
      (npc) =>
        Math.abs(x - (npc.x + HIT_AREA.centerX)) <= HIT_AREA.width / 2 + 12 &&
        Math.abs(y - (npc.y + HIT_AREA.centerY)) <= HIT_AREA.height / 2 + 12,
    );
  const { x, y, width, height } = door.hotspot;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.5, 0.3],
    [0.5, 0.7],
    [0.25, 0.5],
    [0.75, 0.5],
  ]) {
    const point = { x: x + width * fx, y: y + height * fy };
    if (!covered(point.x, point.y)) return point;
  }
  return { x: x + width / 2, y: y + height / 2 };
}

async function clickDoor(page: Page, door: RoomDoor): Promise<void> {
  const point = await clearDoorPoint(page, door);
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  await page.mouse.click(
    box.x + (point.x * box.width) / GAME_WIDTH,
    box.y + (point.y * box.height) / GAME_HEIGHT,
  );
}

const picker = (page: Page) => page.getByRole('dialog', { name: 'ELEVATOR · PICK A FLOOR' });
const chip = (page: Page, floor: string) =>
  picker(page).getByRole('button', { name: new RegExp(`^${floor} /`) });
const focusedLabel = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-door-label'));

async function openTownCenterPicker(page: Page): Promise<void> {
  await clickDoor(page, TC_DOOR);
  await expect(picker(page)).toBeVisible({ timeout: WALK_TIMEOUT });
}

async function openRoofDeckPicker(page: Page): Promise<void> {
  await changeRoom(page, 'roof-deck');
  await clickDoor(page, RD_PILL);
  await expect(picker(page)).toBeVisible({ timeout: WALK_TIMEOUT });
}

test('Town Center: the ELEVATOR door opens the picker; R rides to the Roof Deck, landing by its ELEVATOR pill', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);
  await openTownCenterPicker(page);

  await expect(picker(page).locator('.elevator-picker__sub')).toHaveText('YOU ARE ON 5');
  await expect(picker(page).locator('.elevator-picker__chip')).toHaveText([
    'R / ROOF DECK · THE MARKET',
    'L / LOBBY · UNDER CONSTRUCTION',
  ]);
  await expect(chip(page, 'R')).toBeFocused();
  await expect(chip(page, 'L')).toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: `${SHOTS}/town-center-picker.png` });

  await chip(page, 'R').click();
  await expect(page.locator('.elevator-screen')).toBeVisible({ timeout: WALK_TIMEOUT });
  await waitForElevatorHidden(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('roof-deck');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual({ col: 4, row: 9 });
  await expect(picker(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('Roof Deck: the ELEVATOR pill opens the picker; 5 rides to Town Center, landing on the ELEVATOR sill', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);
  await openRoofDeckPicker(page);

  await expect(picker(page).locator('.elevator-picker__sub')).toHaveText('YOU ARE ON R');
  await expect(picker(page).locator('.elevator-picker__chip')).toHaveText([
    '5 / TOWN CENTER',
    'L / LOBBY · UNDER CONSTRUCTION',
  ]);
  await expect(chip(page, '5')).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/roof-deck-picker.png` });

  await chip(page, '5').click();
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await waitForElevatorHidden(page);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual({ col: 0, row: 7 });
  expect(errors).toEqual([]);
});

test('Esc and an outside click close the picker with no Room change', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);

  await openTownCenterPicker(page);
  await page.keyboard.press('Escape');
  await expect(picker(page)).toBeHidden();

  await openTownCenterPicker(page);
  await page.locator('.elevator-picker').click({ position: { x: 12, y: 12 } });
  await expect(picker(page)).toBeHidden();

  await openTownCenterPicker(page);
  await picker(page).getByRole('button', { name: 'Close' }).click();
  await expect(picker(page)).toBeHidden();

  await page.waitForTimeout(500);
  const info = await debugInfo(page);
  expect(info?.roomId).toBe('town-center');
  expect(info?.roomEventLog).toEqual([{ type: 'room:enter', roomId: 'town-center' }]);
  await expect(page.locator('.elevator-screen')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the locked L chip says UNDER CONSTRUCTION and keeps the picker open, with no Room change', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);
  await openTownCenterPicker(page);

  // aria-disabled, so Playwright's actionability check would wait forever.
  await chip(page, 'L').click({ force: true });
  await expect(picker(page).locator('.elevator-picker__status')).toHaveText('UNDER CONSTRUCTION');
  await expect(picker(page)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/locked-l-feedback.png` });
  await page.waitForTimeout(500);
  expect((await debugInfo(page))?.roomId).toBe('town-center');
  await expect(page.locator('.elevator-screen')).toBeHidden();
  expect(errors).toEqual([]);
});

test('keyboard: Enter on the door opens the picker, Enter picks, and Esc returns focus to the door', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page);
  const proxy = page.locator('.door-focus__door[data-door-label="ELEVATOR · ROOF DECK"]');

  await proxy.focus();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(chip(page, 'R')).toBeFocused();
  // The door layer is inert behind the open picker, and Tab stays inside it.
  await expect(page.locator('.door-focus')).toHaveAttribute('inert', '');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await expect(picker(page)).toBeHidden();
  await expect.poll(() => focusedLabel(page)).toBe('ELEVATOR · ROOF DECK');
  await expect(page.locator('.door-focus')).not.toHaveAttribute('inert', /.*/);

  await page.keyboard.press('Enter');
  await expect(picker(page)).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(chip(page, 'R')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('roof-deck');
  await waitForElevatorHidden(page);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual({ col: 4, row: 9 });
  expect(errors).toEqual([]);
});

test('Anthony guarding the ELEVATOR door opens his dialog, not the picker (D7)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await boot(page, '?asPlayer&hud&phishing');
  await expect.poll(() => page.evaluate(() => Boolean(window.__phishingTest))).toBe(true);
  await page.evaluate((at) => window.__phishingTest!.setNow(at), TOWN_CENTER_ELEVATOR);
  await expect
    .poll(async () => (await debugInfo(page))?.guard?.doorLabel)
    .toBe('ELEVATOR · ROOF DECK');

  await clickDoor(page, TC_DOOR);
  await expect(page.locator('.npc-dialog')).toBeVisible({ timeout: WALK_TIMEOUT });
  await page.waitForTimeout(500);
  await expect(picker(page)).toBeHidden();
  const info = await debugInfo(page);
  expect(info?.roomId).toBe('town-center');
  expect(info?.roomEventLog).toEqual([{ type: 'room:enter', roomId: 'town-center' }]);
  expect(errors).toEqual([]);
});
