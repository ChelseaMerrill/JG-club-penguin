import { expect, test, type Page } from '@playwright/test';
import {
  HEADING_ABOVE_ANCHOR,
  HEADING_BELOW_ANCHOR,
  HEADING_MAX_WIDTH,
  townCenter,
  VALUE_LABEL_ABOVE_ANCHOR,
  VALUE_LABEL_BELOW_ANCHOR,
  VALUE_LABEL_MAX_WIDTH,
} from '../src/game/rooms/definitions/town-center';
import { computeStageFit } from '../src/ui/stage';

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

/** Scales a Stage-pixel box into viewport pixels via `computeStageFit`. */
function toViewportBox(box: Box, fit: ReturnType<typeof computeStageFit>): Box {
  return {
    x: fit.left + box.x * fit.scale,
    y: fit.top + box.y * fit.scale,
    width: box.width * fit.scale,
    height: box.height * fit.scale,
  };
}

// Sub-pixel rounding/anti-aliasing tolerance, viewport px (matches
// `e2e/stage.spec.ts`'s own `toBeLessThanOrEqual(1)` geometry tolerance).
const EPSILON = 1;

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

    const blocks = townCenter.wallText ?? [];
    expect(blocks.length).toBeGreaterThan(0);

    const fit = computeStageFit(viewport.width, viewport.height);

    for (const block of blocks) {
      const locator = page.locator(`[data-wall-text-id="${block.id}"]`);
      await expect(locator).toBeVisible();
      await expect(locator).toHaveText(block.text);

      const domBox = await locator.boundingBox();
      expect(domBox, `${block.id} bounding box`).not.toBeNull();

      const isHeading = block.id === 'heading';
      const aboveAnchor = isHeading ? HEADING_ABOVE_ANCHOR : VALUE_LABEL_ABOVE_ANCHOR;
      const belowAnchor = isHeading ? HEADING_BELOW_ANCHOR : VALUE_LABEL_BELOW_ANCHOR;
      const expectedMaxWidth = isHeading ? HEADING_MAX_WIDTH : VALUE_LABEL_MAX_WIDTH;
      expect(block.maxWidth).toBe(expectedMaxWidth);

      const hexBox = toViewportBox(hexBoxStagePx(block, aboveAnchor, belowAnchor), fit);
      expectInside(domBox!, hexBox, `${viewport.name} "${block.id}"`);
    }

    await page.screenshot({ path: `test-results/core-values-poster/${viewport.name}.png` });

    // #77 scope change: the wall labels stay tiny (fitted to their
    // hexagons, as just asserted above), so clicking the poster opens a
    // properly legible card instead.
    const posterButton = page.locator('.wall-text__poster');
    await expect(posterButton).toBeVisible();
    await posterButton.click();

    const card = page.locator('.core-values-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('CORE VALUES');
    for (const word of ['SERVE', 'GRIND', 'GROW', 'INSPIRE']) {
      await expect(card).toContainText(word);
    }

    await page.screenshot({ path: `test-results/core-values-poster/card-${viewport.name}.png` });

    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  }

  expect(errors).toEqual([]);
});
