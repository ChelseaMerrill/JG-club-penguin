import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId, Tile } from '../src/contracts';
import type { PenguinAnim } from '../src/game/penguin/poses';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
// The shared `window.__roomDebug` ambient type and its shape.
import type { RoomDebugInfo } from './support/room-debug-types';

const OUTPUT_DIR = 'test-results/emote-props';
/** Generous: covers Phaser/WebGL cold-start plus the HUD's own DOM mount. */
const BOOT_TIMEOUT = 15_000;
/** Generous for a one-or-two-tile animated walk (250ms/tile, `movement/speed.ts`). */
const WALK_TIMEOUT = 10_000;

/**
 * The four #47 Emote-only poses #160 puts a plate+glyph on, keyed by the HUD
 * picker's own `data-emote` attribute (`src/ui/hud/emote-picker.ts`) and the
 * `PenguinAnim` clicking that tile plays (proven directly by
 * `e2e/emote-picker.spec.ts`'s own `jg-flash` case).
 */
const PROP_EMOTES: ReadonlyArray<{ dataEmote: string; anim: PenguinAnim }> = [
  { dataEmote: 'thumbs-up', anim: 'THUMBS_UP' },
  { dataEmote: 'brb', anim: 'BRB' },
  { dataEmote: 'jg-flash', anim: 'JG_FLASH' },
  { dataEmote: 'ship-it', anim: 'SHIP_IT' },
];

/**
 * One representative Room per #160's execution plan (Town Center, Dev Pit,
 * The Mullet, Roof Deck/The Market, The Icebox), each paired with a tile one
 * walkable step west of its own `spawnTile` -- confirmed directly against
 * that Room's own `WALKABLE` mask -- that `facingForStep`
 * (`src/game/movement/controller.ts`'s screen-x rule: "row increases or col
 * decreases" faces left) resolves to `'left'` once the local Penguin arrives.
 * Dev Pit's mask blocks the tile directly west of its own spawn tile (col 5,
 * row 1), so its target instead sits two tiles further west along row 0 (the
 * Room's one fully-open row); a single click still reaches it, Dev Pit's own
 * pathfinding included, and the final (horizontal, westward) step still sets
 * `facing: 'left'` on arrival.
 */
const ROOMS: ReadonlyArray<{
  id: RoomId;
  title: string;
  origin: { x: number; y: number };
  westOfSpawn: Tile;
}> = [
  {
    id: 'town-center',
    title: townCenter.title,
    origin: townCenter.grid.origin,
    westOfSpawn: { col: 5, row: 8 },
  },
  {
    id: 'dev-pit',
    title: devPit.title,
    origin: devPit.grid.origin,
    westOfSpawn: { col: 4, row: 0 },
  },
  {
    id: 'the-mullet',
    title: theMullet.title,
    origin: theMullet.grid.origin,
    westOfSpawn: { col: 2, row: 8 },
  },
  {
    id: 'roof-deck',
    title: roofDeck.title,
    origin: roofDeck.grid.origin,
    westOfSpawn: { col: 5, row: 2 },
  },
  {
    id: 'the-icebox',
    title: theIcebox.title,
    origin: theIcebox.grid.origin,
    westOfSpawn: { col: 4, row: 7 },
  },
];

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

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box (`e2e/click-to-move.spec.ts`'s own helper). */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** Walks the local Penguin to `target` (one step west of spawn) and waits until it has actually arrived facing left. */
async function faceLeft(page: Page, origin: { x: number; y: number }, target: Tile): Promise<void> {
  await clickStagePoint(page, tileToScreen(target, origin));
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.facing, { timeout: WALK_TIMEOUT })
    .toBe('left');
}

/** Opens the EMOTE picker, fires `emote`, waits for it to actually be playing, and screenshots it. */
async function fireAndShoot(
  page: Page,
  emote: { dataEmote: string; anim: PenguinAnim },
  screenshotPath: string,
): Promise<void> {
  await page.locator('.hud__button--emote').click();
  await page.locator(`[data-emote="${emote.dataEmote}"]`).click();
  await expect.poll(async () => (await debugInfo(page))?.localPenguin?.anim).toBe(emote.anim);
  await page.screenshot({ path: screenshotPath });
}

test.describe('emote props stand out and share one anchor (#160)', () => {
  test.beforeAll(() => {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const room of ROOMS) {
    test(`${room.title}: all four prop emotes read clearly facing right and left`, async ({
      page,
    }) => {
      // Five Rooms' worth of boots, one walk and eight picker round-trips per
      // Room comfortably clears Playwright's default 30s budget.
      test.setTimeout(60_000);

      const errors = collectErrors(page);

      await page.setViewportSize({ width: 1618, height: 918 });
      await page.goto(`/?hud&room=${room.id}`);

      await expect(page.locator('.hud')).toBeVisible();
      await waitForBoot(page);
      expect((await debugInfo(page))?.roomId).toBe(room.id);

      // --- Facing right (the spawn facing every Room boots into): one
      // screenshot per prop emote.
      for (const emote of PROP_EMOTES) {
        await fireAndShoot(
          page,
          emote,
          path.join(OUTPUT_DIR, `${room.id}-${emote.dataEmote}-right.png`),
        );
      }

      // --- Facing left: walk one step west of spawn, then the same four.
      await faceLeft(page, room.origin, room.westOfSpawn);

      for (const emote of PROP_EMOTES) {
        await fireAndShoot(
          page,
          emote,
          path.join(OUTPUT_DIR, `${room.id}-${emote.dataEmote}-left.png`),
        );
      }

      expect(errors).toEqual([]);
    });
  }
});
