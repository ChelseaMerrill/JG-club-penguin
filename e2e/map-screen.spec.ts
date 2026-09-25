import { expect, test, type Page } from '@playwright/test';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;

const PROTOTYPE_ROOMS = [townCenter, devPit, theMelt, roofDeck, igloo];

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

/** Whether `.map-screen__frame`'s bounding box fits entirely within `#stage`'s. */
async function mapFitsInsideStage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const stage = document.querySelector('#stage')?.getBoundingClientRect();
    const frame = document.querySelector('.map-screen__frame')?.getBoundingClientRect();
    if (!stage || !frame) return false;
    return (
      frame.left >= stage.left - 1 &&
      frame.top >= stage.top - 1 &&
      frame.right <= stage.right + 1 &&
      frame.bottom <= stage.bottom + 1
    );
  });
}

/** Whether `.map-screen__grid` overflows its own box (would require scrolling). */
async function mapGridOverflows(page: Page): Promise<boolean> {
  return page.locator('.map-screen__grid').evaluate((el) => {
    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  });
}

test('Map opens from the HUD in every prototype Room, with exactly one current tile (AC1)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  for (const room of PROTOTYPE_ROOMS) {
    if (room.id !== 'town-center') {
      await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), room.id);
      await expect
        .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
        .toBe(room.id);
    }

    await page.locator('.hud__button--map').click();
    await expect(page.locator('.map-screen')).toBeVisible();

    const current = page.locator('[aria-current="location"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-map-room', room.id);
    expect(await mapFitsInsideStage(page)).toBe(true);
    expect(await mapGridOverflows(page)).toBe(false);

    await page.screenshot({ path: `test-results/map-screen/map-${room.id}.png` });

    await page.keyboard.press('Escape');
    await expect(page.locator('.map-screen')).toBeHidden();
  }

  expect(errors).toEqual([]);
});

test('Clicking Dev Pit on the Map loads it: leave before enter, its own spawnTile, HUD title (AC2)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();

  await page.locator('[data-map-room="dev-pit"]').click();

  await expect(page.locator('.map-screen')).toBeHidden();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(devPit.spawnTile);
  await expect(page.locator('.hud__title')).toHaveText(devPit.title);
  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'dev-pit' },
  ]);

  await page.screenshot({ path: 'test-results/map-screen/dev-pit-arrival.png' });

  expect(errors).toEqual([]);
});

test('Clicking a disabled (COMING SOON) Room does nothing: the Map stays open, log unchanged (AC3)', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  const logBefore = (await debugInfo(page))?.roomEventLog;

  // Whichever tile is still COMING SOON (03 THE ICEBOX was, until #51
  // built its Room).
  const comingSoonTile = page.locator('.map-screen [aria-disabled="true"]').first();
  await expect(comingSoonTile).toHaveAttribute('aria-disabled', 'true');
  await expect(comingSoonTile.locator('.map-screen__pill')).toHaveText('COMING SOON');

  // `aria-disabled="true"` makes Playwright's actionability check refuse a
  // plain `.click()` (it treats the tile as disabled), but the tile is not
  // natively `disabled` -- only inert (#33 D3) -- so `dispatchEvent` fires a
  // real click event without going through that actionability gate,
  // exercising the click handler's own no-op.
  await comingSoonTile.dispatchEvent('click');

  await expect(page.locator('.map-screen')).toBeVisible();
  expect((await debugInfo(page))?.roomEventLog).toEqual(logBefore);
  expect((await debugInfo(page))?.roomId).toBe('town-center');

  await page.screenshot({ path: 'test-results/map-screen/coming-soon.png' });

  expect(errors).toEqual([]);
});

test('Clicking the current Room only closes the Map', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();

  // The "no changeRoom call" half of this guard is unit-tested directly in
  // map-screen.test.ts; this end-to-end pass only needs to confirm the Room
  // is unchanged and the Map closes.
  await page.locator('[data-map-room="town-center"]').click();

  await expect(page.locator('.map-screen')).toBeHidden();
  expect((await debugInfo(page))?.roomId).toBe('town-center');
  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
  ]);

  expect(errors).toEqual([]);
});

test('ESC and the close button both close the Map', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-screen')).toBeHidden();

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('.map-screen__close').click();
  await expect(page.locator('.map-screen')).toBeHidden();

  expect(errors).toEqual([]);
});

test('every defined Room is reachable from the Map, including the Roof Deck / The Kitchen dead ends', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer&hud');
  await waitForBoot(page);

  // Roof Deck has no exit door (`doors: []`), and The Kitchen (`the-melt`)
  // has no entry door (no other Room's doors target it) -- #33 revision 2's
  // "dead ends": only the Map can leave Roof Deck, and only the Map can
  // enter The Kitchen.
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('roof-deck');

  await page.locator('.hud__button--map').click();
  await page.locator('[data-map-room="the-melt"]').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('the-melt');

  await page.locator('.hud__button--map').click();
  await page.locator('[data-map-room="town-center"]').click();
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('town-center');

  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'roof-deck' },
    { type: 'room:leave', roomId: 'roof-deck' },
    { type: 'room:enter', roomId: 'the-melt' },
    { type: 'room:leave', roomId: 'the-melt' },
    { type: 'room:enter', roomId: 'town-center' },
  ]);

  expect(errors).toEqual([]);
});

test('with no Session, the HUD MAP button does not open the Map', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();

  // The overlay is always mounted (createMapScreen runs unconditionally in
  // main.ts); confirms this is "mounted but hidden", not "never rendered".
  await expect(page.locator('.map-screen')).toHaveCount(1);

  await page.locator('.hud__button--map').click();
  await expect(page.locator('.map-screen')).toBeHidden();

  expect(errors).toEqual([]);
});
