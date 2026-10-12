import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { npcSlotPoint } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';
import './support/badge-popup-types';

/**
 * #141 "Bring Nicole a coffee before kickoff", end to end on the dev
 * in-memory store: Nicole gives the Quest, the Kitchen visit counts on
 * entering, Tom hands over the cup from his dialog (Coffee Rush stays), the
 * HUD widget counts down from 1:00 with the cup in the Penguin's flipper,
 * and Nicole takes it back in The Icebox for 75 Tokens -- on foot and by the
 * Map -- or the coffee goes cold and the run resets. Screenshots go under
 * `test-results/quest-nicole-coffee/<test>/`.
 */

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const SHOTS = 'test-results/quest-nicole-coffee';
const TITLE = 'Bring Nicole a coffee before kickoff';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

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

/** `?asPlayer` enters Town Center through the real navigator, so `room:enter` fires on every change. */
async function boot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?asPlayer&leaderboard=seed&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.evaluate(() => {
    const landing = document.querySelector<HTMLElement>('#ui .landing');
    if (landing) landing.hidden = true;
    localStorage.clear();
  });
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await expect(page.locator('.quest-widget')).toBeVisible();
}

async function changeRoom(page: Page, roomId: RoomDebugInfo['roomId']): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe(roomId);
  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: BOOT_TIMEOUT });
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

/** Reduced motion keeps every NPC on its slot tile: clicks it there and waits for its dialog. */
async function talkTo(page: Page, npcId: 'nicole' | 'tom', name: string): Promise<void> {
  const room = npcId === 'nicole' ? theIcebox : theMelt;
  const slot = room.npcSlots.find((s) => s.npcId === npcId);
  if (!slot) throw new Error(`no ${npcId} slot in ${room.id}`);
  const feet = npcSlotPoint(slot, room.grid.origin);
  await clickStagePoint(page, { x: feet.x, y: feet.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText(name);
}

async function closeDialog(page: Page): Promise<void> {
  await page.locator('.npc-dialog__close').click();
  await expect(page.locator('.npc-dialog')).toBeHidden();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}/screenshot.png` });
}

const toast = (page: Page) => page.locator('.hud__toast');
const widget = (page: Page) => page.locator('.quest-widget');
const coffee = (page: Page) => page.evaluate(() => window.__questsTest!.coffee());

async function tokens(page: Page): Promise<number> {
  return Number(await page.locator('.hud__tokens-value').textContent());
}

/** The saved balance, from the store (a dev boot's HUD reads 0 until the first change). */
async function loadedTokens(page: Page): Promise<number> {
  return page.evaluate(() => window.__questsTest!.balance());
}

/** Steps 1-3: Nicole gives the Quest, the Kitchen visit, Tom hands over the cup. */
async function fetchTheCoffee(page: Page): Promise<void> {
  await changeRoom(page, 'the-icebox');
  await talkTo(page, 'nicole', 'Nicole Roberts');
  await page.locator('.npc-dialog__button--quest').click();
  await expect(page.locator('.npc-dialog__line')).toHaveText(
    'Client call in five. I need an oat latte.',
  );
  await expect(toast(page)).toHaveText('Quest: Talk to Nicole in The Icebox ✓ (1 / 5)');
  await closeDialog(page);
  // Giving the Quest tracks it in the widget.
  await expect(widget(page).locator('.quest-widget__title')).toHaveText(TITLE);
  await expect(widget(page).locator('.quest-widget__count')).toHaveText('1 / 5');
  await expect(widget(page).locator('.quest-widget__hint-text')).toHaveText(
    'Go to The Kitchen · THE KITCHEN',
  );

  await changeRoom(page, 'town-center');
  await changeRoom(page, 'the-melt');
  await expect(toast(page)).toHaveText('Quest: Go to The Kitchen ✓ (2 / 5)');

  await talkTo(page, 'tom', "Tom O'Neill");
  // Coffee Rush's own trigger stays, with the coffee option after it.
  await expect(page.locator('.npc-dialog__actions button')).toHaveText([
    'GRAB THE POT',
    'JUST HERE FOR COFFEE',
    "Nicole's oat latte, please",
  ]);
  await page.locator('.npc-dialog__button--extra').click();
  await expect(page.locator('.npc-dialog')).toBeHidden();
  await expect(toast(page)).toHaveText("Quest: Ask Tom for Nicole's coffee ✓ (3 / 5)");
  await expect(widget(page).locator('.quest-widget__timer')).toHaveText(/^ · (01:00|00:5\d)$/);
  await expect.poll(async () => (await coffee(page)).cupRendered).toBe(true);
}

/** Step 5: Nicole takes the cup; 75 Tokens and QUEST COMPLETE, paid once. */
async function deliverToNicole(page: Page, before: number): Promise<void> {
  await talkTo(page, 'nicole', 'Nicole Roberts');
  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__title')).toHaveText(TITLE);
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+75 TOKENS');
  await expect.poll(() => tokens(page)).toBe(before + 75);
  await expect.poll(async () => (await coffee(page)).cupRendered).toBe(false);
  await closeDialog(page);

  // Paid once: talking to her again, and re-reading progress, pays nothing more.
  await talkTo(page, 'nicole', 'Nicole Roberts');
  await page.locator('.npc-dialog__button--quest').click();
  await expect(page.locator('.npc-dialog__line')).toHaveText('Thanks again!');
  await closeDialog(page);
  await page.waitForTimeout(1_000);
  expect(await tokens(page)).toBe(before + 75);
  expect(await loadedTokens(page)).toBe(before + 75);
}

test('delivered on foot within 1:00: the countdown and cup show, and Nicole pays 75 once', async ({
  page,
}) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);
  const before = await loadedTokens(page);

  await fetchTheCoffee(page);
  await shot(page, 'on-foot-countdown-and-cup');

  // Kitchen -> Town Center -> The Icebox, on foot through the navigator.
  await changeRoom(page, 'town-center');
  expect((await coffee(page)).cupRendered).toBe(true);
  await changeRoom(page, 'the-icebox');
  expect((await coffee(page)).carrying).toBe(true);
  await expect(widget(page).locator('.quest-widget__hint-text')).toHaveText(
    'Carry it back before it goes cold · THE ICEBOX',
  );
  await shot(page, 'on-foot-back-in-the-icebox');

  await deliverToNicole(page, before);
  await shot(page, 'on-foot-quest-complete');

  expect(errors).toEqual([]);
});

test('delivered by the Map within 1:00 also completes the Quest', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);
  const before = await loadedTokens(page);

  await fetchTheCoffee(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('[data-map-room="the-icebox"]').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('the-icebox');
  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: BOOT_TIMEOUT });
  await expect.poll(async () => (await coffee(page)).cupRendered).toBe(true);
  await shot(page, 'map-countdown-and-cup');

  await deliverToNicole(page, before);

  expect(errors).toEqual([]);
});

test('at 0:00 the coffee goes cold: steps 3-5 reset, no penalty, and Tom hands over another cup', async ({
  page,
}) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);
  const before = await loadedTokens(page);

  await fetchTheCoffee(page);

  // A minute and a second pass, by the dev store's clock and the countdown's.
  await page.evaluate(() => window.__questsTest!.advanceClock(61_000));
  await expect(toast(page)).toHaveText('Your coffee went cold.');
  await expect(widget(page).locator('.quest-widget__timer')).toBeHidden();
  await expect.poll(async () => (await coffee(page)).cupRendered).toBe(false);
  await expect(widget(page).locator('.quest-widget__count')).toHaveText('2 / 5');
  await expect(widget(page).locator('.quest-widget__hint-text')).toHaveText(
    "Ask Tom for Nicole's coffee · THE KITCHEN",
  );
  expect(await loadedTokens(page)).toBe(before);
  await shot(page, 'went-cold');

  // No penalty: Tom offers the cup again, and this one makes it in time.
  await talkTo(page, 'tom', "Tom O'Neill");
  await page.locator('.npc-dialog__button--extra').click();
  await expect(toast(page)).toHaveText("Quest: Ask Tom for Nicole's coffee ✓ (3 / 5)");
  await expect.poll(async () => (await coffee(page)).cupRendered).toBe(true);
  await changeRoom(page, 'town-center');
  await changeRoom(page, 'the-icebox');
  await deliverToNicole(page, before);

  expect(errors).toEqual([]);
});
