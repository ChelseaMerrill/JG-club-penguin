import { expect, test } from '@playwright/test';

test('login-overlay-signed-out', async ({ page, context }) => {
  await context.clearCookies();

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Abort the OAuth authorize request itself; we only need to observe that
  // the app asks for it, not exercise a real Google redirect.
  await page.route('**/auth/v1/authorize**', (route) => route.abort());

  await page.goto('/');

  const signInButton = page.locator('#ui .login-card__button');
  await expect(signInButton).toBeVisible();
  await expect(signInButton).toHaveText('Sign in with Google');
  await expect(page.locator('#ui .player-badge')).toBeHidden();

  // The aborted authorize request surfaces as a page-level net::ERR_FAILED;
  // that's expected here and isn't a real app error.
  expect(errors.filter((e) => !e.includes('net::ERR_FAILED'))).toEqual([]);

  await page.screenshot({ path: 'test-results/login-overlay-signed-out/screenshot.png' });

  const authorizeRequest = page.waitForRequest(/\/auth\/v1\/authorize\?provider=google/);
  await signInButton.click();
  await authorizeRequest;

  expect(errors.filter((e) => !e.includes('net::ERR_FAILED'))).toEqual([]);
});
