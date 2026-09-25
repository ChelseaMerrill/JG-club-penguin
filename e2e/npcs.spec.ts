import { expect, test, type Page } from '@playwright/test';
import type { Facing, HexColor, PenguinLook, RoomId, Tile } from '../src/contracts';
import type { RegisteredPlayer } from '../src/game/movement/registered-player';
import type { PenguinAnim } from '../src/game/penguin/poses';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s debug shape (see
// `e2e/click-to-move.spec.ts` for why this is redeclared rather than
// imported).
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

// Kept field-for-field identical to `click-to-move.spec.ts`'s and
// `room-framework.spec.ts`'s own copies: TypeScript's global `Window`
// augmentation requires every redeclaration of `__roomDebug` across the whole
// `e2e` program to resolve to the same type. `npcTalkedLog`/`openStallLog`
// (#36) aren't part of that shared shape, so `debugInfo` below reads them via
// a separate, loosely-typed helper instead of widening this interface.
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

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** `npcTalkedLog`/`openStallLog` (#36): not part of the shared `RoomDebugInfo`
 *  shape above, read via a loose cast instead of widening it. */
async function npcDebugInfo(
  page: Page,
): Promise<{ npcTalkedLog?: string[]; openStallLog?: string[] } | undefined> {
  return page.evaluate(
    () =>
      window.__roomDebug as unknown as
        { npcTalkedLog?: string[]; openStallLog?: string[] } | undefined,
  );
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);
  return errors;
}

for (const roomId of ['town-center', 'dev-pit', 'the-melt', 'roof-deck'] as const) {
  test(`npcs-${roomId}: NPCs show at their designed positions`, async ({ page }) => {
    const errors = await bootRoom(page, roomId);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/npcs-${roomId}/screenshot.png` });

    expect(errors).toEqual([]);
  });
}

test('Dev Pit: clicking Ian arrives, opens his dialog, and GRAB THE HAMMER opens Bug Squash', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'dev-pit');

  const ian = devPit.npcSlots.find((slot) => slot.npcId === 'ian');
  if (!ian) throw new Error('expected dev-pit to have an "ian" NPC slot');
  const point = tileToScreen(ian.tile, devPit.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Ian Ballard');

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE HAMMER' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('BUG SQUASH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-dev-pit/bug-squash-launched.png' });

  expect(errors).toEqual([]);
});

test('Roof Deck: clicking Casey arrives, opens her dialog, and her stall button logs openStall("igloo-gear")', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'roof-deck');

  const casey = roofDeck.npcSlots.find((slot) => slot.npcId === 'casey');
  if (!casey) throw new Error('expected roof-deck to have a "casey" NPC slot');
  const point = tileToScreen(casey.tile, roofDeck.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('casey');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Casey Snow');

  await dialog.locator('.npc-dialog__actions button').click();

  await expect.poll(async () => (await npcDebugInfo(page))?.openStallLog).toContain('igloo-gear');
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});
