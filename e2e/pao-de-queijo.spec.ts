import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
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
const WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/pao-de-queijo';

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

/** `?asPlayer`'s `enterSpawnRoom()` always lands on Town Center first,
 *  ignoring any `?room=`; every other Room is reached from there via
 *  `__roomDebug.changeRoom`. */
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

/** Walks the local Penguin to Sander's live debug point and clicks him, the
 *  same way `carnaval-parade.spec.ts` clicks Hector Grecco. */
async function clickSander(page: Page): Promise<void> {
  const sander = (await debugInfo(page))?.npcs?.['sander-nonaka'];
  if (!sander) throw new Error('no __roomDebug.npcs entry for sander-nonaka');
  await clickStagePoint(page, { x: sander.x, y: sander.y });
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: WALK_TIMEOUT })
    .toContain('sander-nonaka');
}

/** Boots the dev fake Player's Session at Town Center, then walks to the
 *  LATAM Café via `#15`'s navigator `changeRoom` hook. */
async function bootCafe(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await changeRoom(page, 'latam-cafe');
  return errors;
}

test('Pão de Queijo Memory: clicking Sander at the register opens his trigger, LET’S EAT shows the how-to screen', async ({
  page,
}) => {
  const errors = await bootCafe(page);

  await clickSander(page);

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Sander Nonaka');
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText(
    'LATAM CAFÉ · PÃO DE QUEIJO MEMORY',
  );
  await expect(dialog).toContainText(
    'Bem-vindo! Match every treat before the cafezinho goes cold.',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/intro.png` });

  await dialog.getByRole('button', { name: "LET'S EAT" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toHaveText(
    'PÃO DE QUEIJO MEMORY · 3 ROUNDS · SOLO',
  );
  await expect(page.locator('.minigame__howto-list li')).toHaveCount(3);

  expect(errors).toEqual([]);
});

test('Pão de Queijo Memory: JUST WATCHING declines the trigger without opening the how-to screen', async ({
  page,
}) => {
  const errors = await bootCafe(page);

  await clickSander(page);
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'JUST WATCHING' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.minigame__howto')).toBeHidden();

  expect(errors).toEqual([]);
});

test('Pão de Queijo Memory: START deals round 1, clearing all 3 rounds shows DELICIOSO! with the Badge and Tokens', async ({
  page,
}) => {
  // Three real between-round/final pauses (1.5s, 1.5s, 1.3s) on top of this
  // machine's slower-than-real-time game ticks.
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // The Minigame test launcher (`?minigame=pao-de-queijo`); the tests above
  // cover reaching it from Sander's own trigger.
  await page.goto('/?minigame=pao-de-queijo');
  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();

  await expect(page.locator('.minigame__play')).toBeVisible();
  // The Ã is drawn as a CSS mark over a plain A, so the real title is its label.
  await expect(page.locator('.minigame__title')).toHaveAttribute(
    'aria-label',
    'PÃO DE QUEIJO MEMORY',
  );
  const cards = page.locator('.pao-de-queijo__card');
  await expect(cards).toHaveCount(12);

  // Round 1's own face-up preview: every card shows its treat, face up.
  await expect
    .poll(async () =>
      cards.first().evaluate((el) => el.classList.contains('pao-de-queijo__card--flipped')),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/play-preview.png` });

  // The preview ends for real (a real `setInterval`, not a fake timer):
  // waits on the card's own state, not a fixed sleep.
  await expect
    .poll(
      async () =>
        cards.first().evaluate((el) => el.classList.contains('pao-de-queijo__card--flipped')),
      { timeout: 10_000 },
    )
    .toBe(false);
  await page.screenshot({ path: `${PROOF_ROOT}/play.png` });

  const roundLabel = page.locator('.pao-de-queijo__round-label');
  await expect(roundLabel).toHaveText('1 / 3');

  await page.evaluate(() => window.__minigameTest!.matchAllPaoDeQueijoPairs());
  await expect(roundLabel).toHaveText('2 / 3', { timeout: 15_000 });
  await expect(cards).toHaveCount(16);

  await page.evaluate(() => window.__minigameTest!.matchAllPaoDeQueijoPairs());
  await expect(roundLabel).toHaveText('3 / 3', { timeout: 15_000 });
  await expect(cards).toHaveCount(20);

  await page.evaluate(() => window.__minigameTest!.matchAllPaoDeQueijoPairs());

  await expect(page.locator('.minigame__done')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.minigame__done-kicker')).toHaveText('TODAS AS RODADAS');
  await expect(page.locator('.minigame__done-title')).toHaveText('DELICIOSO!');
  await expect(page.locator('[data-done-stat="cleared"] .minigame__done-stat-value')).toHaveText(
    '3 / 3',
  );
  await expect(page.locator('.minigame__done-badge')).toBeVisible();
  await expect(page.locator('.minigame__done-badge-name')).toHaveText(
    'Badge unlocked: Mestre do Pão de Queijo',
  );
  await expect(page.locator('.minigame__done-quote')).toHaveText(
    'Sander: "Que delícia! You cleaned out the whole case."',
  );
  await expect(page.locator('[data-done-stat="tokens"] .minigame__done-stat-value')).not.toHaveText(
    '+0',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${PROOF_ROOT}/result.png` });

  expect(errors).toEqual([]);
});
