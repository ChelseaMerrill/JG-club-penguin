import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { latamFutebolField } from '../src/game/rooms/definitions/latam-futebol-field';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** `window.__roomDebug`, deep-cloned across the page boundary. */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/** `?asPlayer`'s `enterSpawnRoom()` always lands on Town Center first, ignoring any `?room=`; every other Room is reached from there via `__roomDebug.changeRoom`. */
async function changeRoom(page: Page, roomId: RoomId): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
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

const ballHotspot = latamFutebolField.hotspots?.find((h) => h.id === 'penalty-kick-ball');
if (!ballHotspot) {
  throw new Error('expected the LATAM Futebol Field to have a penalty-kick-ball hotspot');
}
const ballHotspotCenter = {
  x: ballHotspot.rect.x + ballHotspot.rect.width / 2,
  y: ballHotspot.rect.y + ballHotspot.rect.height / 2,
};

test('Penalty Kick: clicking the ball opens Chrystian’s intro, and a shot aims by Space then click (#220)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-futebol-field');

  // A real click on the ball's Room hotspot (not the `?minigame=` test
  // launcher): proves `main.ts`'s `hotspot:click` -> `npc:arrived` wiring,
  // not just the dialog in isolation.
  await clickStagePoint(page, ballHotspotCenter);

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Chrystian Rissoli');
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText(
    'LATAM FUTEBOL FIELD · PENALTY KICK',
  );
  await expect(dialog).toContainText('Cinco pênaltis. Pick a corner and mean it.');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/penalty-kick/intro.png' });

  await dialog.getByRole('button', { name: 'TAKE THE SHOT' }).click();

  // The shell's generic how-to-play screen, with Penalty Kick's own subtitle.
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toHaveText(
    'PENALTY KICK · 5 SHOTS · SOLO',
  );
  await page.locator('.minigame__button--start').click();

  // The first shot, aimed by Space then click (acceptance criteria: both
  // input methods work), before switching to the test hooks for the rest.
  await expect(page.locator('.penalty-kick')).toBeVisible();
  await expect(page.locator('.penalty-kick__subline')).toHaveText('SPACE LOCKS THE SIDE');
  await page.keyboard.press('Space');
  await expect(page.locator('.penalty-kick__subline')).toHaveText(
    'SPACE LOCKS THE HEIGHT AND SHOOTS',
  );
  await page.locator('.penalty-kick').click();
  await expect(page.locator('.penalty-kick__toast')).toBeVisible();
  await page.screenshot({ path: 'test-results/penalty-kick/aim.png' });

  expect(errors).toEqual([]);
});

test('Penalty Kick: four goals and a save end GOLEADOR, with the Badge and Tokens (#220)', async ({
  page,
}) => {
  // Five kicks and result pauses advance per tick, slower than real time on
  // a slow headless browser.
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // `window.__minigameTest` exists only when the game boots straight into a
  // Minigame (`?minigame=`, dev-minigame-hook.ts), as Beystadium's spec does;
  // the test above covers reaching it from the Field.
  await page.goto('/?minigame=penalty-kick');
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.penalty-kick')).toBeVisible();

  // All five shots via the test hooks (bypassing the aim sweep's RNG for a
  // deterministic round): four goals (Goleador's threshold) and a save.
  for (const outcome of ['goal', 'goal', 'goal', 'goal', 'save'] as const) {
    // Each shot only takes while the side sweep is live: wait for it (the
    // kick and its result pause advance per frame, slower on a slow machine).
    await expect(page.locator('.penalty-kick__subline')).toHaveText('SPACE LOCKS THE SIDE', {
      timeout: 15_000,
    });
    await page.evaluate((o) => window.__minigameTest!.takePenaltyKickShot(o), outcome);
  }

  await expect(page.locator('.minigame__done')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.minigame__done-kicker')).toHaveText('FULL TIME');
  await expect(page.locator('.minigame__done-title')).toHaveText('GOLEADOR');
  await expect(page.locator('[data-done-stat="saved"] .minigame__done-stat-value')).toHaveText('1');
  await expect(page.locator('[data-done-stat="missed"] .minigame__done-stat-value')).toHaveText(
    '0',
  );
  await expect(page.locator('.minigame__done-badge')).toBeVisible();
  await expect(page.locator('.minigame__done-badge-name')).toHaveText('Badge unlocked: Goleador');
  await expect(page.locator('[data-done-stat="tokens"] .minigame__done-stat-value')).not.toHaveText(
    '+0',
  );
  await page.screenshot({ path: 'test-results/penalty-kick/result.png' });

  expect(errors).toEqual([]);
});
