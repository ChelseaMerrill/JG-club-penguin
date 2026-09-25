import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

const chip = (page: Page, group: string, value: string) =>
  page.locator(`.penguin-creator [aria-label="${group}"] [data-value="${value}"]`);

test('penguin-creator', async ({ page }) => {
  const errors = collectErrors(page);
  const creator = page.locator('.penguin-creator');
  const name = page.locator('#penguin-creator-name');

  // Stage at scale 1 (see hud.spec.ts), so screenshots are 1:1 with the design.
  await page.setViewportSize({ width: 1618, height: 918 });
  // `?creator` runs the first-sign-in flow against the in-memory store.
  await page.goto('/?creator');

  // First sign-in: the Creator opens before the HUD, can't be cancelled, and
  // the name is never taken from the Google account.
  await expect(creator).toBeVisible();
  await expect(page.locator('.hud')).toBeHidden();
  await expect(page.locator('.penguin-creator__cancel')).toBeHidden();
  await expect(name).toHaveValue('');
  await expect(page.locator('.penguin-creator__nameplate')).toHaveText('Unnamed Penguin');

  // Every option group is offered, with the five Idle animations.
  await expect(page.locator('.penguin-creator [aria-label="HAT"] button')).toHaveCount(5);
  await expect(page.locator('.penguin-creator [aria-label="BELLY PATTERN"] button')).toHaveCount(6);
  await expect(page.locator('.penguin-creator [aria-label="EYES"] button')).toHaveCount(4);
  await expect(page.locator('.penguin-creator [aria-label="Idle animation"] button')).toHaveText([
    'WADDLE',
    'WAVE',
    'DANCE',
    'LAUGH',
    'SIT',
  ]);

  // WADDLE IN needs a name.
  await page.locator('.penguin-creator__submit').click();
  await expect(page.locator('.penguin-creator__error')).toHaveText('Your Penguin needs a name.');
  await expect(creator).toBeVisible();

  await name.fill('Waddles');
  await expect(page.locator('.penguin-creator__error')).toHaveText('');
  await page.locator('.penguin-creator [aria-label="BODY"] [data-color="#0C4B5F"]').click();
  await chip(page, 'HAT', 'HEADPHONES').click();
  await chip(page, 'BELLY PATTERN', 'SNOWFLAKE').click();
  await chip(page, 'EYES', 'STAR').click();
  await chip(page, 'Idle animation', 'WAVE').click();
  await expect(page.locator('.penguin-creator__nameplate')).toHaveText('Waddles');
  await expect(page.locator('.penguin-creator__summary')).toHaveText(
    'HEADPHONES · SNOWFLAKE · STAR',
  );
  await expect(page.locator('.penguin-creator__figure svg')).toBeVisible();
  await page.screenshot({ path: 'test-results/penguin-creator/first-sign-in.png' });

  // Saving completes the Creator and enters the World.
  await page.locator('.penguin-creator__submit').click();
  await expect(creator).toBeHidden();
  await expect(page.locator('.hud')).toBeVisible();

  // Reopening from the HUD shows the saved look and can be cancelled.
  await page.locator('.hud__button--penguin').click();
  await expect(creator).toBeVisible();
  await expect(page.locator('.penguin-creator__cancel')).toBeVisible();
  await expect(name).toHaveValue('Waddles');
  await expect(chip(page, 'HAT', 'HEADPHONES')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Idle animation', 'WAVE')).toHaveAttribute('aria-pressed', 'true');

  // Escape closes it without saving (the HUD's OverlayManager).
  await chip(page, 'HAT', 'NONE').click();
  await page.keyboard.press('Escape');
  await expect(creator).toBeHidden();
  await page.locator('.hud__button--penguin').click();
  await expect(chip(page, 'HAT', 'HEADPHONES')).toHaveAttribute('aria-pressed', 'true');

  // A later save sticks for the rest of the session.
  await chip(page, 'HAT', 'SNORKEL').click();
  await chip(page, 'Idle animation', 'SIT').click();
  await page.screenshot({ path: 'test-results/penguin-creator/edit-from-hud.png' });
  await page.locator('.penguin-creator__submit').click();
  await expect(creator).toBeHidden();
  await page.locator('.hud__button--penguin').click();
  await expect(chip(page, 'HAT', 'SNORKEL')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Idle animation', 'SIT')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.penguin-creator__cancel').click();
  await expect(creator).toBeHidden();

  expect(errors).toEqual([]);
});
