import { expect, test, type Page } from '@playwright/test';
import './support/room-debug-types';

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

  // Reloading while still gated (before typing a name) re-runs the same
  // first-run hook against a fresh in-memory store: still the Creator, still
  // no HUD (review round 1 — this is a different moment from reloading
  // after WADDLE IN, which the earlier revision checked instead).
  await page.reload();
  await expectHeldOnCreator(page);

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
