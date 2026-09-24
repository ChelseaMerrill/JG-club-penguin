import { expect, test } from '@playwright/test';

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

for (const [label, { viewport, canvas }] of Object.entries(SIZES)) {
  test(`stage-letterbox-${label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const canvasLocator = page.locator('#game canvas');
    await expect(canvasLocator).toBeVisible();
    const box = await canvasLocator.boundingBox();
    expect(box).not.toBeNull();

    // 16:9 aspect ratio.
    expect(Math.abs(box!.width / box!.height - ASPECT)).toBeLessThanOrEqual(0.01);

    // Centred in the viewport.
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(centerY - viewport.height / 2)).toBeLessThanOrEqual(1);

    // Visible letterbox gutters on both axes.
    expect(box!.x).toBeGreaterThan(0);
    expect(box!.y).toBeGreaterThan(0);

    // Matches the worked-out fit geometry.
    expect(Math.abs(box!.width - canvas.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.height - canvas.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.x - canvas.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.y - canvas.top)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `test-results/stage-letterbox-${label}/screenshot.png` });
  });
}

test('stage-overlay-alignment', async ({ page }) => {
  for (const { viewport } of Object.values(SIZES)) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const canvasLocator = page.locator('#game canvas');
    await expect(canvasLocator).toBeVisible();

    // A probe placed in #ui at stage coordinates (800, 450) -- the exact
    // center of the 1600x900 logical stage -- so it should land on the
    // canvas's own center once #ui's scale/position match the canvas.
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
});

test('desktop-only-overlay', async ({ page, browser }) => {
  // Small/short viewport: the notice shows, the stage hides.
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  await page.screenshot({ path: 'test-results/desktop-only-overlay/screenshot.png' });

  // Touch-only device, even at a roomy viewport: the notice shows.
  const touchContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto('/');
  await expect(touchPage.locator('#desktop-only')).toBeVisible();
  await expect(touchPage.locator('#stage')).toBeHidden();
  await touchContext.close();

  // Desktop-sized, mouse-driven viewport: the notice hides, the stage shows.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#desktop-only')).toBeHidden();
  await expect(page.locator('#stage')).toBeVisible();
});
