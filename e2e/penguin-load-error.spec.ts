/**
 * #164: a failed sign-in load shows the retryable "Couldn't load your
 * Penguin" state, never the Penguin Creator, and never leads to a save.
 * Runs through the `?creator` hook against the in-memory store, with
 * `failLoads=<n>` making the Penguin editor's own first `n` loads fail
 * (`withDevLoadFailures`, which wraps only the editor's store).
 */
import { expect, test, type Page } from '@playwright/test';
import './support/room-debug-types';
import './support/creator-debug-types';

const OUT = 'test-results/penguin-load-error';

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Records whether the Creator was ever un-hidden, from document start. */
async function watchCreator(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { creatorEverShown: boolean };
    w.creatorEverShown = false;
    const check = (): void => {
      const creator = document.querySelector<HTMLElement>('.penguin-creator');
      if (creator && !creator.hidden) w.creatorEverShown = true;
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  });
}

async function creatorEverShown(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { creatorEverShown: boolean }).creatorEverShown);
}

async function counts(page: Page): Promise<{ loadAllCalls: number; saveLookCalls: number }> {
  return page.evaluate(() => ({
    loadAllCalls: window.__creatorDebug?.loadAllCalls ?? -1,
    saveLookCalls: window.__creatorDebug?.saveLookCalls ?? -1,
  }));
}

const panel = (page: Page) => page.locator('.penguin-load-error');
const retry = (page: Page) => page.locator('.penguin-load-error__retry');

async function expectErrorState(page: Page): Promise<void> {
  await expect(panel(page)).toBeVisible();
  await expect(retry(page)).toBeEnabled();
  await expect(retry(page)).toBeFocused();
  await expect(page.locator('.hud')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // 1618x918 fits the 1600x900 Stage at scale 1 (see `e2e/penguin-creator.spec.ts`).
  await page.setViewportSize({ width: 1618, height: 918 });
  await watchCreator(page);
});

test('(a) a returning Player whose load fails recovers with TRY AGAIN, without the Creator or a save', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?creator=returning&failLoads=1');

  await expectErrorState(page);
  await expect(page.locator('.penguin-load-error__detail')).toHaveText(
    'Injected load failure (test)',
  );
  await page.screenshot({ path: `${OUT}/returning-recovers/error-state.png` });

  await retry(page).click();

  await expect(panel(page)).toBeHidden();
  await expect(page.locator('.hud')).toBeVisible();
  // The hook signs in no real Player, so `applyLocalLook` never rebinds the
  // Room's Penguin here (main.ts): the saved look arriving unchanged is
  // proven on the real sign-in path instead (penguin-load-retry.spec.ts).
  expect(await creatorEverShown(page)).toBe(false);
  // The hook's seed save goes through the unwrapped store, so it isn't counted (RT B1).
  expect(await counts(page)).toEqual({ loadAllCalls: 2, saveLookCalls: 0 });
  await page.screenshot({ path: `${OUT}/returning-recovers/recovered.png` });
  expect(errors).toEqual([]);
});

test('(b) a TRY AGAIN that also fails keeps the state with an enabled, focused button; the next one recovers', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?creator=returning&failLoads=2');
  await expectErrorState(page);

  await retry(page).click();

  await expectErrorState(page);
  await expect(page.locator('.penguin-load-error__detail')).toHaveText(
    'Injected load failure (test)',
  );
  await page.screenshot({ path: `${OUT}/retry-fails-then-recovers/still-failing.png` });

  await retry(page).click();

  await expect(panel(page)).toBeHidden();
  await expect(page.locator('.hud')).toBeVisible();
  expect(await creatorEverShown(page)).toBe(false);
  expect(await counts(page)).toEqual({ loadAllCalls: 3, saveLookCalls: 0 });
  expect(errors).toEqual([]);
});

test('(c) repeated failures never open the Creator or save, Escape does nothing, and the Stage behind is covered', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?creator&failLoads=1000');
  await expectErrorState(page);

  for (let i = 0; i < 3; i += 1) {
    await retry(page).click();
    await expectErrorState(page);
  }
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeVisible();

  // RT M6: a point 24 px in from the panel's top-left, outside the card, so
  // never TRY AGAIN or Sign out.
  const box = await panel(page).boundingBox();
  if (!box) throw new Error('expected the load-error panel to have a bounding box');
  const point = { x: box.x + 24, y: box.y + 24 };
  await page.mouse.click(point.x, point.y);
  const landedOnPanel = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.penguin-load-error') !== null,
    point,
  );
  expect(landedOnPanel).toBe(true);
  expect(await page.evaluate(() => window.__roomDebug?.localPenguinMoveLog ?? [])).toEqual([]);

  expect(await creatorEverShown(page)).toBe(false);
  expect(await counts(page)).toEqual({ loadAllCalls: 4, saveLookCalls: 0 });
  await page.screenshot({ path: `${OUT}/never-creator/error-state.png` });
  expect(errors).toEqual([]);
});

test('(d) a new Player whose retry finds no profile gets the Creator, and WADDLE IN saves once', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?creator&failLoads=1');
  await expectErrorState(page);
  expect(await creatorEverShown(page)).toBe(false);

  await retry(page).click();

  await expect(panel(page)).toBeHidden();
  const creator = page.locator('.penguin-creator');
  await expect(creator).toBeVisible();
  await expect(page.locator('.penguin-creator__submit')).toBeDisabled();
  await page.locator('#penguin-creator-name').fill('Waddles');
  await page.locator('.penguin-creator__submit').click();

  await expect(creator).toBeHidden();
  await expect(page.locator('.hud')).toBeVisible();
  expect(await counts(page)).toEqual({ loadAllCalls: 2, saveLookCalls: 1 });
  await page.screenshot({ path: `${OUT}/new-player-after-retry/in-world.png` });
  expect(errors).toEqual([]);
});
