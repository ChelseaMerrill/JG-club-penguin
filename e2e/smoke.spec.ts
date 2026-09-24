import { expect, test } from '@playwright/test';

test('smoke-canvas-and-ui-layer', async ({ page }) => {
  // Fail on any uncaught page error or console error (e.g. a scene that throws on boot).
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(0);
  expect(canvasBox!.height).toBeGreaterThan(0);

  const ui = page.locator('#ui');
  await expect(ui).toHaveCount(1);
  const uiBox = await ui.boundingBox();
  expect(uiBox).not.toBeNull();

  // The #ui layer covers the whole canvas.
  expect(uiBox!.x).toBeLessThanOrEqual(canvasBox!.x);
  expect(uiBox!.y).toBeLessThanOrEqual(canvasBox!.y);
  expect(uiBox!.x + uiBox!.width).toBeGreaterThanOrEqual(canvasBox!.x + canvasBox!.width);
  expect(uiBox!.y + uiBox!.height).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height);

  // #ui stacks above the game container.
  const [uiZ, gameZ] = await page.evaluate(() => {
    const z = (id: string) => getComputedStyle(document.getElementById(id)!).zIndex;
    return [z('ui'), z('game')];
  });
  expect(Number(uiZ)).toBeGreaterThan(gameZ === 'auto' ? 0 : Number(gameZ));

  // The signed-out Landing page deliberately covers the whole Stage; hide it
  // so this checks the #ui layer itself. The top element 10px inside the
  // canvas's top-left corner is then the canvas (the #ui layer lets input
  // through).
  await expect(page.locator('#ui .landing')).toBeVisible();
  const hit = await page.evaluate(
    ([x, y]) => {
      document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
      return document.elementFromPoint(x, y)?.tagName;
    },
    [canvasBox!.x + 10, canvasBox!.y + 10],
  );
  expect(hit).toBe('CANVAS');

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/smoke-canvas-and-ui-layer/screenshot.png' });
});
