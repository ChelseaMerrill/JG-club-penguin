import { expect, type Page } from '@playwright/test';
import { SPAWN_ROOM_ID, type RoomId } from '../../src/contracts/rooms';
import { waitForElevatorHidden } from './elevator';

/** Boot, sign-in and the first Room channel join, before any per-test budget starts. */
export const READY_TIMEOUT = 15_000;

/** Decodes a Supabase access token's `sub` claim: the Player id. */
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
 * Player who has already completed it goes straight to the spawn Room, the
 * Lobby (#169).
 */
export async function completeCreatorIfShown(page: Page, name: string): Promise<void> {
  const creator = page.locator('.penguin-creator');
  const joined = page.locator(`.debug-overlay[data-current-room="${SPAWN_ROOM_ID}"]`);
  await expect(creator.or(joined).first()).toBeVisible({ timeout: READY_TIMEOUT });
  if (!(await creator.isVisible())) return;
  await page.locator('#penguin-creator-name').fill(name);
  await page.locator('.penguin-creator__submit').click();
  await expect(creator).toBeHidden();
}

/** Waits until the page is in `roomId` (by default the spawn Room, the Lobby, #169) with its Room channel joined. */
export async function waitUntilJoined(page: Page, roomId: RoomId = SPAWN_ROOM_ID): Promise<void> {
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toHaveAttribute('data-current-room', roomId, {
    timeout: READY_TIMEOUT,
  });
  await expect(overlay).toHaveAttribute('data-subscribed', 'true', { timeout: READY_TIMEOUT });
}

/**
 * Moves `page` from the Lobby, where every Session starts (#169), to Town
 * Center with the debug overlay's Room switcher, for a spec that needs Town
 * Center's geometry: waits out the L to 5 Elevator ride (6 s) and the new
 * Room channel's join.
 */
export async function moveToTownCenter(page: Page): Promise<void> {
  await page.click('button[data-room="town-center"]');
  await waitForElevatorHidden(page);
  await waitUntilJoined(page, 'town-center');
}
