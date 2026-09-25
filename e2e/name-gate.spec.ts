import { expect, test, type Page } from '@playwright/test';
import type { Facing, HexColor, PenguinLook, RoomId, Tile } from '../src/contracts';
import type { RegisteredPlayer } from '../src/game/movement/registered-player';
import type { PenguinAnim } from '../src/game/penguin/poses';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s `RoomDebugInfo`. Redeclared
// rather than imported for the same reason `e2e/click-to-move.spec.ts` and
// `e2e/room-framework.spec.ts` do: `dev-room-hook.ts` reads
// `import.meta.env`, which the `e2e` tsconfig doesn't type-check. Kept
// identical, field for field, to those specs' own copies: TypeScript's
// global `Window` augmentation requires every redeclaration of
// `__roomDebug` to resolve to the same type.
interface LocalPenguinDebugInfo {
  tile: Tile;
  target?: Tile;
  anim: PenguinAnim;
  facing: Facing;
  moving: boolean;
  flipX: boolean;
  lookName: string;
  lookBody: HexColor;
  playerId: string;
}

interface RoomDebugInfo {
  roomId: RoomId;
  scrollX: number;
  scrollY: number;
  localPenguin?: LocalPenguinDebugInfo;
  textureListenerCount?: number;
  npcArrivedLog?: string[];
  doorReachedLog?: string[];
  localPenguinMoveLog?: Tile[];
  restartRoom?: () => void;
  restartCount?: number;
  penguinCount?: number;
  remotePenguinCount?: number;
  setRegisteredPlayer?: (player: RegisteredPlayer) => void;
  spawnDebugPenguin?: (tile: Tile, look: PenguinLook) => void;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
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

/** A new Player is held on the Creator: HUD hidden, WADDLE IN disabled. */
async function expectHeldOnCreator(page: Page): Promise<void> {
  await expect(page.locator('.penguin-creator')).toBeVisible();
  await expect(page.locator('.hud')).toBeHidden();
  await expect(page.locator('.penguin-creator__submit')).toBeDisabled();
}

/**
 * Clicks a non-interactive part of the Creator's preview column (the
 * podium) and asserts the click landed on the Creator, never the Room
 * canvas underneath it, and that no click-to-move fired (#75).
 */
async function clickPreviewColumn(page: Page): Promise<void> {
  const podium = page.locator('.penguin-creator__podium');
  const box = await podium.boundingBox();
  if (!box) throw new Error('expected the preview podium to have a bounding box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.click(point.x, point.y);

  const landedOnCreator = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.penguin-creator') !== null,
    point,
  );
  expect(landedOnCreator).toBe(true);
  expect(await page.evaluate(() => window.__roomDebug?.localPenguinMoveLog ?? [])).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // 1618x918 fits the 1600x900 Stage at scale 1 (see `e2e/penguin-creator.spec.ts`).
  await page.setViewportSize({ width: 1618, height: 918 });
});

test('a new Player is held on the Creator until they enter a name', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?creator');
  await expectHeldOnCreator(page);
  await clickPreviewColumn(page);

  const name = page.locator('#penguin-creator-name');
  const submit = page.locator('.penguin-creator__submit');

  // A whitespace-only name still leaves it disabled.
  await name.fill('   ');
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: 'test-results/name-gate/new-player/held-on-creator.png' });

  await name.fill('Waddles');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.penguin-creator')).toBeHidden();
  await page.screenshot({ path: 'test-results/name-gate/new-player/entered-world.png' });

  // Reloading re-runs the same first-run hook against a fresh in-memory
  // store, so an unnamed Player lands back on the Creator.
  await page.reload();
  await expectHeldOnCreator(page);

  expect(errors).toEqual([]);
});

test('a deep link to a Room before naming still lands on the Creator', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?creator&room=town-center');
  await expectHeldOnCreator(page);
  await clickPreviewColumn(page);

  const name = page.locator('#penguin-creator-name');
  const submit = page.locator('.penguin-creator__submit');
  await name.fill('   ');
  await expect(submit).toBeDisabled();

  await name.fill('Waddles');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.penguin-creator')).toBeHidden();

  expect(errors).toEqual([]);
});

test('a returning, already-named Player skips the Creator', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?creator=returning');

  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.penguin-creator')).toBeHidden();
  await expect
    .poll(async () => (await page.evaluate(() => window.__roomDebug?.roomId)) ?? null)
    .toBe('town-center');
  await page.screenshot({ path: 'test-results/name-gate/returning-player/returning-player.png' });

  expect(errors).toEqual([]);
});
