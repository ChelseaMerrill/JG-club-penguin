import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { npcSlotPoint } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';
import './support/badge-popup-types';

/**
 * #140 "Pair with a JGer and fix the flaky test", end to end on the dev
 * in-memory store (solo path): Paul gives the Quest in The Icebox, the CI
 * board in the Dev Pit, pairing solo with Paul himself (no other Player in
 * the Room, the ticket's fallback -- `__questsTest.advanceClock` stands in
 * for the real 10 s wait), a Bug Squash round with 3 flaky squashes (via the
 * existing `__questsTest.recordRound` hook, the same one `e2e/quests.spec.ts`
 * uses for every other Minigame step), then reporting back to Paul for 150
 * Tokens. Screenshots go under test-results/quest-pair-flaky-test/<test>/.
 */

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const SHOTS = 'test-results/quest-pair-flaky-test';
const TITLE = 'Pair with a JGer and fix the flaky test';
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
  await page.goto('/?asPlayer&hud');
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
async function talkToPaul(page: Page): Promise<void> {
  const slot = theIcebox.npcSlots.find((s) => s.npcId === 'paul-carnival');
  if (!slot) throw new Error('no paul-carnival slot in the-icebox');
  const feet = npcSlotPoint(slot, theIcebox.grid.origin);
  await clickStagePoint(page, { x: feet.x, y: feet.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Paul Carnival');
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

async function tokens(page: Page): Promise<number> {
  return Number(await page.locator('.hud__tokens-value').textContent());
}

const ciBoardHotspot = devPit.hotspots?.find((h) => h.id === 'ci-board');
if (!ciBoardHotspot) throw new Error('expected the Dev Pit to have a ci-board hotspot');

test('talking to Paul, the CI board, pairing solo, 3 flaky squashes and reporting back pays 150 Tokens', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await boot(page);

  // Step 1: Paul's "Got any work for me?" starts the Quest, recording
  // "talk to Paul". The Penguin is now standing next to him.
  await changeRoom(page, 'the-icebox');
  await talkToPaul(page);
  await page.locator('.npc-dialog__button--quest').click();
  await expect(page.locator('.npc-dialog__line')).toHaveText(
    "CI's flaky again. Pair up, squash the flakes, report back.",
  );
  await expect(toast(page)).toHaveText('Quest: Talk to Paul in The Icebox ✓ (1 / 5)');
  await expect(widget(page).locator('.quest-widget__title')).toHaveText(TITLE);
  await closeDialog(page);
  await shot(page, 'talk-to-paul');

  // Step 3: pairing, solo -- no other Player is in the Room, so standing
  // next to Paul himself counts (the ticket's fallback). The Penguin is
  // still standing at his interaction tile from the dialog above;
  // `advanceClock` stands in for the real 10 s wait.
  await page.waitForTimeout(600); // let one pairing tick register proximity
  await page.evaluate(() => window.__questsTest!.advanceClock(10_000));
  await expect(toast(page)).toHaveText('Quest: Pair with a JGer in The Icebox ✓ (2 / 5)');
  await shot(page, 'paired-solo');

  // Step 2: check the CI board in the Dev Pit.
  await changeRoom(page, 'dev-pit');
  await clickStagePoint(page, {
    x: ciBoardHotspot!.rect.x + ciBoardHotspot!.rect.width / 2,
    y: ciBoardHotspot!.rect.y + ciBoardHotspot!.rect.height / 2,
  });
  await expect(toast(page)).toHaveText('Quest: Check the CI board in the Dev Pit ✓ (3 / 5)');
  await shot(page, 'ci-board-checked');

  // Step 4: a Bug Squash round with 3 flaky bugs fully squashed, through the
  // same quest-aware `recordRound` test hook `e2e/quests.spec.ts` uses for
  // every other Minigame step.
  await page.evaluate(() =>
    window.__questsTest!.recordRound('bug-squash', 150, {
      score: 150,
      squashed: 12,
      bestCombo: 2,
      escaped: 0,
      flakyHits: 3,
    }),
  );
  await expect(toast(page)).toHaveText(
    'Quest: Squash 3 flaky bugs in one Bug Squash round ✓ (4 / 5)',
  );
  await expect(widget(page).locator('.quest-widget__hint-text')).toHaveText(
    'Report back to Paul · THE ICEBOX',
  );

  // Step 5: report back to Paul. All five steps are met, so the Quest
  // claims itself and the banner shows automatically.
  const before = await page.evaluate(() => window.__questsTest!.balance());
  await changeRoom(page, 'the-icebox');
  await talkToPaul(page);
  const reportButton = page.getByRole('button', { name: 'Report back' });
  await expect(reportButton).toBeVisible();
  await reportButton.click();
  await expect(page.locator('.npc-dialog')).toBeHidden();

  const banner = page.locator('.quest-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.quest-banner__heading')).toHaveText('QUEST COMPLETE');
  await expect(banner.locator('.quest-banner__title')).toHaveText(TITLE);
  await expect(banner.locator('.quest-banner__reward')).toHaveText('+150 TOKENS');
  await expect.poll(() => tokens(page)).toBe(before + 150);
  await shot(page, 'quest-complete');

  // Paid once: talking to Paul again, and re-reading progress, pays nothing more.
  await talkToPaul(page);
  await page.locator('.npc-dialog__button--quest').click();
  await expect(page.locator('.npc-dialog__line')).toHaveText('Thanks again!');
  await closeDialog(page);
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.__questsTest!.balance())).toBe(before + 150);

  expect(errors).toEqual([]);
});
