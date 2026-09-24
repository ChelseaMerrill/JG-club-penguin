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
  const pageOrigin = new URL(page.url()).origin;

  const signInButton = page.locator('#ui .landing__play');
  await expect(signInButton).toBeVisible();
  await expect(signInButton).toHaveText('PLAY NOW');
  await expect(page.locator('#ui .landing__login')).toBeVisible();
  await expect(page.locator('#ui .player-badge')).toBeHidden();

  // The aborted authorize request surfaces as a page-level net::ERR_FAILED;
  // that's expected here and isn't a real app error.
  expect(errors.filter((e) => !e.includes('net::ERR_FAILED'))).toEqual([]);

  await page.screenshot({ path: 'test-results/login-overlay-signed-out/screenshot.png' });

  const authorizeRequest = page.waitForRequest(/\/auth\/v1\/authorize\?provider=google/);
  await signInButton.click();
  const request = await authorizeRequest;

  expect(errors.filter((e) => !e.includes('net::ERR_FAILED'))).toEqual([]);

  const requestUrl = new URL(request.url());
  // PKCE: the authorize request carries a code_challenge.
  expect(requestUrl.searchParams.get('code_challenge')).toBeTruthy();
  // The redirect lands back on this page's own origin, not somewhere else.
  const redirectTo = requestUrl.searchParams.get('redirect_to');
  expect(redirectTo).not.toBeNull();
  expect(redirectTo!.startsWith(pageOrigin)).toBe(true);
});
