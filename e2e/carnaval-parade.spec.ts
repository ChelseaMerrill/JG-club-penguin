import { expect, test, type Page } from '@playwright/test';
import { latamDiscoHall } from '../src/game/rooms/definitions/latam-disco-hall';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import type { RoomDebugInfo } from './support/room-debug-types';

// `__roomDebug`'s ambient type comes from `./support/room-debug-types`;
// `__minigameTest` is this spec's own.
declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/carnaval-parade';

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

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

const turntableHotspot = latamDiscoHall.hotspots?.find((h) => h.id === 'disco-turntable');
if (!turntableHotspot) {
  throw new Error('expected the LATAM Disco Hall to have a disco-turntable hotspot');
}
const turntableCenter = {
  x: turntableHotspot.rect.x + turntableHotspot.rect.width / 2,
  y: turntableHotspot.rect.y + turntableHotspot.rect.height / 2,
};

const hectorSlot = latamDiscoHall.npcSlots.find((slot) => slot.npcId === 'hector-grecco');
if (!hectorSlot) {
  throw new Error('expected the LATAM Disco Hall to have a hector-grecco NPC slot');
}

/**
 * Boots the dev fake Player's Session at Town Center (a Room change needs
 * one), then jumps straight to the LATAM Disco Hall via `#15`'s navigator
 * `changeRoom` hook (same pattern as `latam-disco-floor.spec.ts`): the Disco
 * Hall has no Map tile or door of its own to click through.
 *
 * `window.__minigameTest` is NOT available from this boot (it only exists
 * when `?minigame=<id>` is in the URL at load, `dev-minigame-hook.ts`'s own
 * gate) -- this path is for the real trigger (the turntable hotspot / Hector
 * himself), not for finishing a round via the test hook. See
 * `playCarnavalParadeDirectly` below for that.
 */
async function bootDiscoHall(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('latam-disco-hall'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-disco-hall');
  return errors;
}

test("Carnaval Parade: the DJ turntable opens Hector's trigger, JOIN THE PARADE shows the how-to screen", async ({
  page,
}) => {
  const errors = await bootDiscoHall(page);

  // A real click on the turntable hotspot (the design's own invisible hit
  // zone over the DJ booth), not a debug shortcut.
  await clickStagePoint(page, turntableCenter);

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Hector Grecco');
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText(
    'LATAM DISCO HALL · CARNAVAL PARADE',
  );
  await expect(dialog).toContainText('Vem pro desfile!');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/intro.png` });

  await dialog.getByRole('button', { name: 'JOIN THE PARADE' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toHaveText(
    'CARNAVAL PARADE · 45 SECONDS · SOLO',
  );
  await expect(page.locator('.minigame__howto-list li')).toHaveCount(3);

  expect(errors).toEqual([]);
});

test('Carnaval Parade: clicking Hector Grecco himself opens the same trigger as the turntable, and JUST WATCHING declines it', async ({
  page,
}) => {
  const errors = await bootDiscoHall(page);
  // His live click point (slot offset and dance included), as npcs.spec.ts
  // clicks Tony; the Penguin walks over before the dialog opens.
  const hector = (await debugInfo(page))?.npcs?.['hector-grecco'];
  if (!hector) throw new Error('no __roomDebug.npcs entry for hector-grecco');
  await clickStagePoint(page, { x: hector.x, y: hector.y });
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: 15_000 })
    .toContain('hector-grecco');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Hector Grecco');
  await dialog.getByRole('button', { name: 'JUST WATCHING' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeHidden();

  expect(errors).toEqual([]);
});

test('Carnaval Parade: START runs the round with lane controls, and the result shows Hector’s line and Tokens', async ({
  page,
}) => {
  const errors = collectErrors(page);

  // The Minigame test launcher (`?minigame=carnaval-parade`), the way
  // `e2e/beystadium.spec.ts`'s own full-round test does: `window.__minigameTest`
  // only exists when the URL names a Minigame at load
  // (`dev-minigame-hook.ts`'s own gate), unlike the real turntable/Hector
  // trigger the tests above cover.
  await page.goto('/?minigame=carnaval-parade');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();

  await expect(page.locator('.minigame__play')).toBeVisible();
  await expect(page.locator('.minigame__title')).toHaveText('CARNAVAL PARADE');
  await expect(page.locator('.carnaval-parade__life--lit')).toHaveCount(3);

  // Keyboard and on-screen lane controls both work (acceptance criterion):
  // neither throws, and the shell keeps running either way.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.locator('.carnaval-parade__lane-button--up').click();
  await page.locator('.carnaval-parade__lane-button--down').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/play.png` });

  // A full 45 s round isn't worth playing out for real here (the engine's
  // own seeded-spawner tests cover the pickups/multiplier/lives rules); the
  // finish hook ends the round as it stands, whatever that honest partial
  // play scored.
  await page.evaluate(() => window.__minigameTest!.finishCarnavalParadeNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-kicker')).toHaveText(
    /^(FIM DO DESFILE|OUT OF LIVES)$/,
  );
  await expect(page.locator('.minigame__done-title')).toHaveText(/^(PASSISTA|FOLI[AÃ]O|APRENDIZ)$/);
  await expect(page.locator('.minigame__done-quote')).toHaveText(/^Hector: /);
  await expect(page.locator('[data-done-stat="tokens"] .minigame__done-stat-value')).toBeVisible();
  await page.screenshot({ path: `${PROOF_ROOT}/result.png` });

  expect(errors).toEqual([]);
});
