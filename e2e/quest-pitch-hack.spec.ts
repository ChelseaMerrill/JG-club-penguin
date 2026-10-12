import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { npcSlotPoint } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';
import './support/badge-popup-types';

/**
 * #142 "Pitch your hack in under 60 seconds", end to end on the dev
 * in-memory store: Linda gives the Quest, her dialog's "Pitch Linda" action
 * opens the overlay once talked to, a fast accepted pitch (under 20 s)
 * shows "Closed. Sign here." and pays 75 Tokens once, and the overlay's own
 * 60 s countdown reaching 0:00 shows "Every room is a pitch. That one
 * wasn't." with a working Try again. Screenshots go under
 * `test-results/quest-pitch-hack/<test>/`.
 */

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const SHOTS = 'test-results/quest-pitch-hack';
const TITLE = 'Pitch your hack in under 60 seconds';
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

/** Reduced motion keeps Linda on her slot tile: clicks it there and waits for her dialog. */
async function talkToLinda(page: Page): Promise<void> {
  const slot = theIcebox.npcSlots.find((s) => s.npcId === 'linda-martin');
  if (!slot) throw new Error('no linda-martin slot in the-icebox');
  const feet = npcSlotPoint(slot, theIcebox.grid.origin);
  await clickStagePoint(page, { x: feet.x, y: feet.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Linda Martin');
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
const overlay = (page: Page) => page.locator('.pitch-overlay');

async function tokens(page: Page): Promise<number> {
  return Number(await page.locator('.hud__tokens-value').textContent());
}

/** The saved balance, from the store (a dev boot's HUD reads 0 until the first change). */
async function loadedTokens(page: Page): Promise<number> {
  return page.evaluate(() => window.__questsTest!.balance());
}

/** Step 1: Linda gives the Quest; her dialog, reopened, now offers Pitch Linda. */
async function talkToLindaAndOpenOverlay(page: Page): Promise<void> {
  await changeRoom(page, 'the-icebox');
  await talkToLinda(page);
  await page.locator('.npc-dialog__button--quest').click();
  await expect(page.locator('.npc-dialog__line')).toHaveText('Every room is a pitch. Smile.');
  await expect(toast(page)).toHaveText('Quest: Talk to Linda in The Icebox ✓ (1 / 2)');
  await closeDialog(page);
  await expect(widget(page).locator('.quest-widget__title')).toHaveText(TITLE);
  await expect(widget(page).locator('.quest-widget__count')).toHaveText('1 / 2');

  // Re-approaching her now offers the "Pitch Linda" extra action.
  await talkToLinda(page);
  const pitchButton = page.locator('.npc-dialog__button--extra');
  await expect(pitchButton).toHaveText('Pitch Linda');
  await pitchButton.click();
  await expect(page.locator('.npc-dialog')).toBeHidden();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page).locator('.pitch-overlay__countdown')).toHaveText('01:00');
}

/** Picks the first choice in each of the overlay's three rows. */
async function pickEveryRow(page: Page): Promise<void> {
  const rows = page.locator('.pitch-overlay__row');
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    await rows.nth(i).locator('.pitch-overlay__choice').first().click();
  }
}

test('talks to Linda, pitches fast, and gets "Closed. Sign here." plus 75 Tokens once', async ({
  page,
}) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);
  const before = await loadedTokens(page);

  await talkToLindaAndOpenOverlay(page);
  await pickEveryRow(page);
  await shot(page, 'overlay-choices-picked');

  await page.locator('.pitch-overlay__button--primary', { hasText: 'SUBMIT' }).click();
  await expect(page.locator('.pitch-overlay__result-line')).toHaveText('Closed. Sign here.');
  await shot(page, 'closed-sign-here');

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__title')).toHaveText(TITLE);
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+75 TOKENS');
  await expect.poll(() => tokens(page)).toBe(before + 75);

  await page.locator('.pitch-overlay__button--primary', { hasText: 'BACK TO THE ICEBOX' }).click();
  await expect(overlay(page)).toBeHidden();
  await shot(page, 'quest-complete');

  // Paid once: re-reading progress pays nothing more.
  await page.waitForTimeout(1_000);
  expect(await tokens(page)).toBe(before + 75);
  expect(await loadedTokens(page)).toBe(before + 75);

  expect(errors).toEqual([]);
});

test("the overlay's own countdown reaching 0:00 times out, and Try again passes", async ({
  page,
}) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);
  const before = await loadedTokens(page);

  await talkToLindaAndOpenOverlay(page);

  // A minute and a second pass, by the dev store's clock and the overlay's own.
  await page.evaluate(() => window.__questsTest!.advanceClock(61_000));
  await expect(page.locator('.pitch-overlay__result-line')).toHaveText(
    "Every room is a pitch. That one wasn't.",
  );
  await shot(page, 'timed-out');
  expect(await loadedTokens(page)).toBe(before);

  // No penalty: Try again resets the clock, and this one makes it in time.
  await page.locator('.pitch-overlay__button--primary', { hasText: 'TRY AGAIN' }).click();
  await expect(overlay(page).locator('.pitch-overlay__countdown')).toHaveText('01:00');
  await pickEveryRow(page);
  await page.locator('.pitch-overlay__button--primary', { hasText: 'SUBMIT' }).click();
  await expect(page.locator('.pitch-overlay__result-line')).toHaveText(
    /Closed\. Sign here\.|Smile/,
  );

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect.poll(() => tokens(page)).toBe(before + 75);
  await shot(page, 'retry-passed');

  expect(errors).toEqual([]);
});
