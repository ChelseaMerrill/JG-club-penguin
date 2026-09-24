import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 900 } });

test('landing-signed-out', async ({ page, context }) => {
  await context.clearCookies();

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');

  const landing = page.locator('#ui .landing');
  await expect(landing).toBeVisible();
  await expect(landing.locator('.landing__logo')).toHaveAccessibleName('Club JenGuin');
  await expect(landing.locator('.landing__tagline')).toHaveText(
    'Waddle around and ship new things!',
  );
  await expect(landing.locator('.landing__play')).toHaveText('PLAY NOW');
  await expect(landing.locator('.landing__login')).toHaveText('LOG IN');

  // #48: no fabricated online count and no footer links to screens that
  // don't exist for signed-out visitors.
  await expect(landing).not.toContainText('ONLINE');
  await expect(landing.locator('a')).toHaveCount(0);

  expect(errors).toEqual([]);

  await page.evaluate(() => document.fonts.ready);
  await page.locator('#stage').screenshot({
    path: 'test-results/landing-signed-out/screenshot.png',
    animations: 'disabled',
  });
});
