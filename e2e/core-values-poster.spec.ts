import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import {
  HEADING_ABOVE_ANCHOR,
  HEADING_BELOW_ANCHOR,
  townCenter,
  VALUE_LABEL_ABOVE_ANCHOR,
  VALUE_LABEL_BELOW_ANCHOR,
} from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { HEADING_BLOCK_ID } from '../src/ui/wall-text/wall-text';
import { computeStageFit } from '../src/ui/stage';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

// `__roomDebug`'s type comes from the shared `./support/room-debug-types`;
// `__wallTextTest` is this spec's own.
declare global {
  interface Window {
    // Test-only (#77 review round 1 fix 2); see `src/main.ts`'s own
    // `window.__wallTextTest` assignment.
    __wallTextTest?: { setSessionActive: (active: boolean) => void };
  }
}

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/**
 * Hides the signed-out Landing page, the same way `e2e/smoke.spec.ts` and
 * `e2e/prototype-rooms.spec.ts` do, so the Room underneath (and the wall
 * text drawn over it) is fully visible.
 */
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

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto` (mirrors `e2e/click-to-move.spec.ts`). */
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Each `RoomWallText` block's own hexagon/banner box (#77): the region its
 * DOM label must stay inside, in Stage px. `x`/`maxWidth` come straight from
 * the definition; `aboveAnchor`/`belowAnchor` are the design's own hexagon
 * polygon's real (asymmetric -- the anchor is the text *baseline*, not the
 * hexagon's vertical centre) y-range, exported from `definitions/
 * town-center.ts` alongside the `maxWidth` derivation they sit next to.
 */
function hexBoxStagePx(
  block: { x: number; y: number; maxWidth: number },
  aboveAnchor: number,
  belowAnchor: number,
): Box {
  return {
    x: block.x - block.maxWidth / 2,
    y: block.y - aboveAnchor,
    width: block.maxWidth,
    height: aboveAnchor + belowAnchor,
  };
}

/**
 * Converts a Playwright (viewport-px) bounding box into Stage px via the
 * inverse of `computeStageFit` (#77 review round 1 fix 4: comparing in one
 * consistent coordinate space, rather than scaling the expected box into
 * viewport px, means the tolerance below means the same thing -- Stage px --
 * at every viewport size).
 */
function toStageBox(box: Box, fit: ReturnType<typeof computeStageFit>): Box {
  return {
    x: (box.x - fit.left) / fit.scale,
    y: (box.y - fit.top) / fit.scale,
    width: box.width / fit.scale,
    height: box.height / fit.scale,
  };
}

// Sub-pixel rounding/anti-aliasing tolerance, Stage px (#77 review round 1
// fix 4: fixed in Stage units rather than viewport px, so it means the same
// real-world margin regardless of the viewport's own scale factor).
const EPSILON = 0.5;

function expectInside(inner: Box, outer: Box, label: string): void {
  expect(inner.x, `${label} left edge`).toBeGreaterThanOrEqual(outer.x - EPSILON);
  expect(inner.y, `${label} top edge`).toBeGreaterThanOrEqual(outer.y - EPSILON);
  expect(inner.x + inner.width, `${label} right edge`).toBeLessThanOrEqual(
    outer.x + outer.width + EPSILON,
  );
  expect(inner.y + inner.height, `${label} bottom edge`).toBeLessThanOrEqual(
    outer.y + outer.height + EPSILON,
  );
}

// The two required viewport sizes (#77 execution plan): one giving an exact
// 1600x900 Stage (computeStageFit's 9px-per-side gutter means 1618x918 fits
// with scale 1.0 exactly), and the smallest desktop size the `#desktop-only`
// media query in `src/style.css` still renders the Stage at (1024x576).
const VIEWPORTS = [
  { name: '1600x900', width: 1618, height: 918 },
  { name: '1024x576', width: 1024, height: 576 },
];

test('core-values-poster', async ({ page }) => {
  const errors = collectErrors(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?room=town-center');

    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible();
    await hideLandingPage(page);
    await waitForBoot(page);
    // Lets the web font (Anton, loaded from Google Fonts -- src/style.css's
    // mirrored `colors_and_type.css`) finish before measuring any label's
    // rendered box (#77 review round 1 fix 4): otherwise a first-paint race
    // against a fallback font could measure the wrong glyph metrics.
    await page.evaluate(() => document.fonts.ready);

    const blocks = townCenter.wallText ?? [];
    expect(blocks.length).toBeGreaterThan(0);

    const fit = computeStageFit(viewport.width, viewport.height);

    for (const block of blocks) {
      const locator = page.locator(`[data-wall-text-id="${block.id}"]`);
      await expect(locator).toBeVisible();
      await expect(locator).toHaveText(block.text);

      const domBox = await locator.boundingBox();
      expect(domBox, `${block.id} bounding box`).not.toBeNull();

      const isHeading = block.id === HEADING_BLOCK_ID;
      const aboveAnchor = isHeading ? HEADING_ABOVE_ANCHOR : VALUE_LABEL_ABOVE_ANCHOR;
      const belowAnchor = isHeading ? HEADING_BELOW_ANCHOR : VALUE_LABEL_BELOW_ANCHOR;

      const stageBox = toStageBox(domBox!, fit);
      const hexBox = hexBoxStagePx(block, aboveAnchor, belowAnchor);
      expectInside(stageBox, hexBox, `${viewport.name} "${block.id}"`);
    }

    await page.screenshot({ path: `test-results/core-values-poster/${viewport.name}.png` });

    // #77 scope change: the wall labels stay tiny (fitted to their
    // hexagons, as just asserted above), so clicking the poster opens a
    // properly legible card instead. The poster button only accepts a click
    // with a Session active (#77 review round 1 fix 2); e2e can't complete a
    // real Google sign-in, so this flips the same guard's flag directly via
    // the test-only hook `src/main.ts` exposes.
    await page.evaluate(() => window.__wallTextTest?.setSessionActive(true));

    const posterButton = page.locator('.wall-text__poster');
    await expect(posterButton).toBeVisible();

    const moveLogBeforePosterClick = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
    await posterButton.click();

    const card = page.locator('.core-values-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('CORE VALUES');
    for (const word of ['SERVE', 'GRIND', 'GROW', 'INSPIRE']) {
      await expect(card).toContainText(word);
    }

    await page.screenshot({ path: `test-results/core-values-poster/card-${viewport.name}.png` });

    // #77 review round 1 fix 4 (D6): the poster button is a real DOM
    // element over the canvas, so clicking it never reaches `RoomScene`'s
    // click-to-move handler -- confirmed directly against the move log,
    // not just inferred from the button intercepting the click.
    expect((await debugInfo(page))?.localPenguinMoveLog).toHaveLength(moveLogBeforePosterClick);

    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();

    // D6, continued (1600x900 only -- the click-to-tile-screen-point math
    // below is derived for this exact scale; `e2e/click-to-move.spec.ts`
    // already covers click-to-move/door-click across viewports in general,
    // so this only needs to prove the *poster* doesn't interfere with
    // either, once).
    if (viewport.name === '1600x900') {
      const origin = townCenter.grid.origin;

      // A walkable floor tile whose screen point (900, 325) sits just
      // outside the poster's own hit rect (977.5..1112.5, 176.3..311.3) but
      // close to it -- "near the labels" without overlapping them.
      const nearPosterTile: Tile = { col: 2, row: 0 };
      expect(townCenter.walkable[nearPosterTile.row]?.[nearPosterTile.col]).toBe(true);

      const moveLogBeforeFloorClick = (await debugInfo(page))?.localPenguinMoveLog?.length ?? 0;
      await clickStagePoint(page, tileToScreen(nearPosterTile, origin));
      await expect
        .poll(async () => (await debugInfo(page))?.localPenguinMoveLog?.length)
        .toBe(moveLogBeforeFloorClick + 1);

      // A door hotspot near the same area still walks to it and logs
      // door:reached -- hand-computed exactly like
      // `e2e/click-to-move.spec.ts`'s own DEV PIT door case.
      // By label, not "the first enabled door": THE ICEBOX became a real door
      // in #51 and now comes first in Town Center's list.
      const door = townCenter.doors.find((candidate) => candidate.label === 'DEV PIT');
      if (!door) throw new Error('expected town-center to have a DEV PIT door');
      const doorApproachTile: Tile = { col: 10, row: 0 };
      const doorCenter = {
        x: door.hotspot.x + door.hotspot.width / 2,
        y: door.hotspot.y + door.hotspot.height / 2,
      };
      await clickStagePoint(page, doorCenter);
      await expect
        .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: LONG_WALK_TIMEOUT })
        .toMatchObject({ tile: doorApproachTile, moving: false });
      expect((await debugInfo(page))?.doorReachedLog).toContain(door.label);
    }
  }

  expect(errors).toEqual([]);
});

test('core-values-poster-only-in-town-center', async ({ page }) => {
  const errors = collectErrors(page);

  // #77 review round 1 fix 1: the wall-text overlay's first render must
  // match whatever Room `RoomScene` itself boots into (`?room=`), not always
  // `SPAWN_ROOM_ID` -- otherwise Town Center's poster text/button render
  // over Dev Pit here.
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?room=dev-pit');

  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);

  await expect(page.locator('.wall-text__label')).toHaveCount(0);
  await expect(page.locator('.wall-text__poster')).toHaveCount(0);

  expect(errors).toEqual([]);
});
