import { expect, test, type Page } from '@playwright/test';
import type { Facing, HexColor, PenguinLook, RoomId, Tile } from '../src/contracts';
import type { RegisteredPlayer } from '../src/game/movement/registered-player';
import { igloo } from '../src/game/rooms/definitions/igloo';
import type { PenguinAnim } from '../src/game/penguin/poses';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s `RoomDebugInfo` (see
// `e2e/room-framework.spec.ts`/`e2e/click-to-move.spec.ts` for why this is
// redeclared rather than imported).
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

interface RoomDebugEventLogEntry {
  type: 'room:leave' | 'room:enter';
  roomId: RoomId;
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
  comingSoonHint?: string | null;
  changeRoom?: (roomId: RoomId) => void;
  roomEventLog?: RoomDebugEventLogEntry[];
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
    __minigameTest?: MinigameTestHandle;
  }
}

const BOOT_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Hides the signed-out Landing page, the same way `e2e/click-to-move.spec.ts` does. */
async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
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

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

const trophyCaseHotspot = igloo.hotspots?.find((h) => h.id === 'trophy-case');
if (!trophyCaseHotspot) throw new Error('expected the Igloo to have a trophy-case hotspot');
const hotspotCenter = {
  x: trophyCaseHotspot.rect.x + trophyCaseHotspot.rect.width / 2,
  y: trophyCaseHotspot.rect.y + trophyCaseHotspot.rect.height / 2,
};

test('opens from the Igloo hotspot showing the current Badge count, and Escape closes it', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?room=igloo');
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);
  expect((await debugInfo(page))?.roomId).toBe('igloo');

  await clickStagePoint(page, hotspotCenter);

  await expect(page.locator('.trophy-case')).toBeVisible();
  await expect(page.locator('[data-tab="badges"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.trophy-case__subtitle')).toHaveText('YOUR IGLOO · 0 / 12 BADGES');

  const exterminator = page.locator('[data-badge-id="exterminator"]');
  await expect(exterminator).not.toHaveClass(/trophy-case__badge--earned/);
  await expect(exterminator.locator('.trophy-case__badge-hint')).toHaveText('500 · BUG SQUASH');

  // TROPHIES and JG AWARDS are static tab content.
  await page.locator('[data-tab="trophies"]').click();
  await expect(page.locator('.trophy-case__trophy-name').first()).toHaveText('Team Pod · Ship It');
  await page.locator('[data-tab="awards"]').click();
  await expect(page.locator('.trophy-case__award-image')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(page.locator('.trophy-case')).toBeHidden();

  // No move: the hotspot opens the Trophy Case immediately, without walking there.
  const info = await debugInfo(page);
  expect(info?.localPenguinMoveLog).toEqual([]);

  expect(errors).toEqual([]);
});

test('earning Exterminator in Bug Squash shows it unlocked in the Trophy Case', async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Combines the Room and Minigame dev hooks in one page (#42): both read
  // independent `?` params, so the Igloo is already showing underneath when
  // the Bug Squash stub launches.
  await page.goto('/?room=igloo&minigame=bug-squash');

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await page.locator('.minigame__button--start').click();
  await expect(page.locator('.minigame__play')).toBeVisible();

  await page.evaluate(() => window.__minigameTest!.setStubScore(500));
  await page.evaluate(() => window.__minigameTest!.finishNow());

  await expect(page.locator('.minigame__done')).toBeVisible();
  await expect(page.locator('.minigame__done-badge')).toBeVisible();
  await expect(page.locator('.minigame__done-badge-name')).toHaveText(
    'Badge unlocked: Exterminator',
  );
  await expect(page.locator('.minigame__done-saving')).toBeHidden();

  // Back to the Igloo, still the same page session (no reload, no
  // persistence yet -- #34's real store lands separately).
  await page.locator('.minigame__done-actions .minigame__button--quit').click();
  await expect(page.locator('.minigame')).toHaveCount(0);
  await waitForBoot(page);
  expect((await debugInfo(page))?.roomId).toBe('igloo');

  // The real hotspot click, exercised end to end.
  await clickStagePoint(page, hotspotCenter);

  await expect(page.locator('.trophy-case')).toBeVisible();
  await expect(page.locator('.trophy-case__subtitle')).toHaveText('YOUR IGLOO · 1 / 12 BADGES');
  const exterminator = page.locator('[data-badge-id="exterminator"]');
  await expect(exterminator).toHaveClass(/trophy-case__badge--earned/);
  await expect(exterminator.locator('.trophy-case__badge-icon')).toHaveText('✓');

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/trophy-case/screenshot.png' });

  expect(errors).toEqual([]);
});
