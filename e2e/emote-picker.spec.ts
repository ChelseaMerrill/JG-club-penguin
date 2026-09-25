import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { PenguinAnim } from '../src/game/penguin/poses';
// The shared `window.__roomDebug` ambient type and its shape.
import type { RoomDebugInfo } from './support/room-debug-types';

const OUTPUT_DIR = 'test-results/emote-picker';
/** Generous: covers Phaser/WebGL cold-start plus the picker's own DOM mount. */
const BOOT_TIMEOUT = 15_000;
/** #47's Emote duration, plus slack for the poll interval and scene tick. */
const EMOTE_CLEAR_TIMEOUT = 3_000;

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

async function localAnim(page: Page): Promise<PenguinAnim | undefined> {
  return (await debugInfo(page))?.localPenguin?.anim;
}

test('emote-picker', async ({ page }) => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?hud');

  await expect(page.locator('.hud')).toBeVisible();
  await waitForBoot(page);

  // Signed out, so the local Penguin idles on DEFAULT_LOOK's own emote (WADDLE).
  expect(await localAnim(page)).toBe('WADDLE');

  const emoteButton = page.locator('.hud__button--emote');
  const picker = page.locator('.emote-picker');

  // --- EMOTE opens the picker; ESC closes it (no pick made).
  await expect(emoteButton).toBeVisible();
  await emoteButton.click();
  await expect(picker).toBeVisible();
  await expect(picker.locator('.emote-picker__title')).toHaveText('EMOTES');
  await expect(picker.locator('.emote-picker__tile')).toHaveCount(8);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'picker-open.png') });

  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  expect(await localAnim(page)).toBe('WADDLE');

  // --- Picking WAVE by click plays it on the local Penguin immediately, for
  // ~2s, then it returns to the idle emote (#47 AC).
  await emoteButton.click();
  await expect(picker).toBeVisible();
  await page.locator('[data-emote="wave"]').click();

  await expect(picker).toBeHidden();
  await expect.poll(async () => localAnim(page)).toBe('WAVE');

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'wave-playing.png') });

  await expect.poll(async () => localAnim(page), { timeout: EMOTE_CLEAR_TIMEOUT }).toBe('WADDLE');

  // --- Picking by key 2 (DANCE, EMOTES' own order) while the picker is open.
  await emoteButton.click();
  await expect(picker).toBeVisible();
  await page.keyboard.press('2');

  await expect(picker).toBeHidden();
  await expect.poll(async () => localAnim(page)).toBe('DANCE');

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'dance-playing.png') });

  await expect.poll(async () => localAnim(page), { timeout: EMOTE_CLEAR_TIMEOUT }).toBe('WADDLE');

  // --- A digit key does nothing while the picker is closed (#47 D: keys
  // 1-8 only work while the picker is open).
  await page.keyboard.press('5');
  await page.waitForTimeout(200);
  expect(await localAnim(page)).toBe('WADDLE');

  // --- One of the four Emote-only poses (#47), proving the renderer change
  // (`src/game/penguin/poses.ts`) actually plays, not just the reused idle anims.
  await emoteButton.click();
  await page.locator('[data-emote="jg-flash"]').click();
  await expect.poll(async () => localAnim(page)).toBe('JG_FLASH');

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'jg-flash-playing.png') });

  expect(errors).toEqual([]);
});
