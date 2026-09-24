import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';

// Mirrors `src/game/rooms/dev-room-hook.ts`'s `RoomDebugInfo`, matching its
// `roomId: RoomId` field, rather than redeclaring it with a looser `string`.
// Importing that type directly isn't possible here: it drags in
// `dev-room-hook.ts`'s `import.meta.env` usage, which the `e2e` tsconfig
// (no `vite/client` types) doesn't type-check.
interface RoomDebugInfo {
  roomId: RoomId;
  scrollX: number;
  scrollY: number;
}

declare global {
  interface Window {
    __roomDebug?: RoomDebugInfo;
  }
}

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/**
 * Hides the signed-out Landing page (the login card), the same way
 * `e2e/smoke.spec.ts` does, so the Room underneath is fully visible for the
 * screenshot. #13 doesn't touch auth, so every visit here is signed-out.
 */
async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

test('room-framework', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await hideLandingPage(page);
  await expect
    .poll(() => page.evaluate(() => window.__roomDebug))
    .toMatchObject({
      roomId: 'town-center',
      scrollX: 0,
      scrollY: 0,
    });
  await page.screenshot({ path: 'test-results/room-framework/town-center.png' });

  await page.goto('/?room=dev-pit');
  await expect(canvas).toBeVisible();
  await hideLandingPage(page);
  await expect
    .poll(() => page.evaluate(() => window.__roomDebug))
    .toMatchObject({
      roomId: 'dev-pit',
      scrollX: 0,
      scrollY: 0,
    });
  await page.screenshot({ path: 'test-results/room-framework/dev-pit.png' });

  expect(errors).toEqual([]);
});
