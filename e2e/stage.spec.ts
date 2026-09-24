import { expect, test, type Page } from '@playwright/test';

const ASPECT = 16 / 9;

// Expected canvas geometry per viewport, worked out independently from the
// stage fit formula (scale = min((vw-18)/1600, (vh-18)/900), 9px gutter per
// side) rather than by calling the implementation under test.
const SIZES: Record<
  string,
  {
    viewport: { width: number; height: number };
    canvas: { width: number; height: number; left: number; top: number };
  }
> = {
  '1920x1080': {
    viewport: { width: 1920, height: 1080 },
    canvas: { width: 1888, height: 1062, left: 16, top: 9 },
  },
  '1440x900': {
    viewport: { width: 1440, height: 900 },
    canvas: { width: 1422, height: 799.875, left: 9, top: 50.0625 },
  },
  '1280x720': {
    viewport: { width: 1280, height: 720 },
    canvas: { width: 1248, height: 702, left: 16, top: 9 },
  },
};

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

function expectLetterboxGeometry(
  box: { width: number; height: number; x: number; y: number },
  viewport: { width: number; height: number },
  canvas: { width: number; height: number; left: number; top: number },
): void {
  // 16:9 aspect ratio.
  expect(Math.abs(box.width / box.height - ASPECT)).toBeLessThanOrEqual(0.01);

  // Centered in the viewport.
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(centerY - viewport.height / 2)).toBeLessThanOrEqual(1);

  // Visible letterbox gutters on both axes.
  expect(box.x).toBeGreaterThan(0);
  expect(box.y).toBeGreaterThan(0);

  // Matches the worked-out fit geometry.
  expect(Math.abs(box.width - canvas.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - canvas.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x - canvas.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - canvas.top)).toBeLessThanOrEqual(1);
}

/**
 * Places a probe in #ui at stage coordinates (800, 450) -- the exact center
 * of the 1600x900 logical stage -- and asserts it lands on the canvas's own
 * center once #ui's scale/position match the canvas.
 */
async function expectProbeCenteredOnCanvas(page: Page, canvasLocator: ReturnType<Page['locator']>) {
  await page.evaluate(() => {
    const ui = document.getElementById('ui')!;
    const probe = document.createElement('div');
    probe.id = 'stage-probe';
    probe.style.position = 'absolute';
    probe.style.left = '790px';
    probe.style.top = '440px';
    probe.style.width = '20px';
    probe.style.height = '20px';
    ui.appendChild(probe);
  });

  const canvasBox = await canvasLocator.boundingBox();
  const probeBox = await page.locator('#stage-probe').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(probeBox).not.toBeNull();

  const canvasCenterX = canvasBox!.x + canvasBox!.width / 2;
  const canvasCenterY = canvasBox!.y + canvasBox!.height / 2;
  const probeCenterX = probeBox!.x + probeBox!.width / 2;
  const probeCenterY = probeBox!.y + probeBox!.height / 2;

  expect(Math.abs(probeCenterX - canvasCenterX)).toBeLessThanOrEqual(1);
  expect(Math.abs(probeCenterY - canvasCenterY)).toBeLessThanOrEqual(1);

  await page.evaluate(() => document.getElementById('stage-probe')?.remove());
}

for (const [label, { viewport, canvas }] of Object.entries(SIZES)) {
  test(`stage-letterbox-${label}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(viewport);
    await page.goto('/');

    const canvasLocator = page.locator('#game canvas');
    await expect(canvasLocator).toBeVisible();
    const box = await canvasLocator.boundingBox();
    expect(box).not.toBeNull();

    expectLetterboxGeometry(box!, viewport, canvas);

    await page.screenshot({ path: `test-results/stage-letterbox-${label}/screenshot.png` });

    expect(errors).toEqual([]);
  });
}

test('stage-overlay-alignment', async ({ page }) => {
  const errors = collectErrors(page);

  for (const { viewport } of Object.values(SIZES)) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const canvasLocator = page.locator('#game canvas');
    await expect(canvasLocator).toBeVisible();

    await expectProbeCenteredOnCanvas(page, canvasLocator);
  }

  expect(errors).toEqual([]);
});

test('stage-live-resize', async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const canvasLocator = page.locator('#game canvas');
  await expect(canvasLocator).toBeVisible();

  const target = SIZES['1280x720'];

  // Resize the live page (no reload) and wait for the canvas to settle at
  // the new fit before asserting geometry.
  await page.setViewportSize(target.viewport);
  await expect
    .poll(async () => {
      const box = await canvasLocator.boundingBox();
      return box ? Math.abs(box.width - target.canvas.width) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(1);

  const box = await canvasLocator.boundingBox();
  expect(box).not.toBeNull();
  expectLetterboxGeometry(box!, target.viewport, target.canvas);

  await expectProbeCenteredOnCanvas(page, canvasLocator);

  expect(errors).toEqual([]);
});

test('desktop-only-overlay', async ({ page, browser }) => {
  const errors = collectErrors(page);

  // Small/short viewport: the notice shows, the stage hides.
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  await page.screenshot({ path: 'test-results/desktop-only-overlay/screenshot.png' });

  // Narrow but tall enough: the width clause alone still triggers the notice.
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();

  // Wide but short: the height clause alone still triggers the notice.
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();

  // Touch-only device, even at a roomy viewport: the notice shows.
  const touchContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await touchContext.newPage();
  const touchErrors = collectErrors(touchPage);
  await touchPage.goto('/');
  await expect(touchPage.locator('#desktop-only')).toBeVisible();
  await expect(touchPage.locator('#stage')).toBeHidden();
  await touchContext.close();

  // Desktop-sized, mouse-driven viewport: the notice hides, the stage shows.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeHidden();
  await expect(page.locator('#stage')).toBeVisible();

  expect(errors).toEqual([]);
  expect(touchErrors).toEqual([]);
});
