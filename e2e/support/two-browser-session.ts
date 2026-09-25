import { expect, type Page } from '@playwright/test';

/** Boot, sign-in and the first Room channel join, before any per-test budget starts. */
export const READY_TIMEOUT = 15_000;

/** Shared with `e2e/support/presence-guard.ts`, which decodes a storage state's JWT the same way. */
export function decodeJwtSub(token: string): string {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { sub: string }).sub;
}

/** Reads the signed-in Player's own id out of the `sb-*-auth-token` JWT in localStorage. */
export async function readOwnPlayerId(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => /^sb-.*-auth-token$/.test(key));
    if (!entry) throw new Error('no sb-*-auth-token in localStorage');
    return (JSON.parse(entry[1]) as { access_token: string }).access_token;
  });
  return decodeJwtSub(accessToken);
}

/**
 * Finishes the Penguin Creator when the Player lands in it (every fresh
 * Session does until #34's real ProgressStore remembers a saved look): the
 * Session, and so the Room channel, starts only after the first save. A
 * Player who has already completed it goes straight to Town Center.
 */
export async function completeCreatorIfShown(page: Page, name: string): Promise<void> {
  const creator = page.locator('.penguin-creator');
  const joined = page.locator('.debug-overlay[data-current-room="town-center"]');
  await expect(creator.or(joined).first()).toBeVisible({ timeout: READY_TIMEOUT });
  if (!(await creator.isVisible())) return;
  await page.locator('#penguin-creator-name').fill(name);
  await page.locator('.penguin-creator__submit').click();
  await expect(creator).toBeHidden();
}

/** Waits until the page is in Town Center with its Room channel joined. */
export async function waitUntilJoined(page: Page): Promise<void> {
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toHaveAttribute('data-current-room', 'town-center', {
    timeout: READY_TIMEOUT,
  });
  await expect(overlay).toHaveAttribute('data-subscribed', 'true', { timeout: READY_TIMEOUT });
}
