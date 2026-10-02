import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * The Hallway's people (owner request, 2026-10-02, Track D): Anthony Conway
 * left, and Emily Smith walks laps of the corridor. Screenshots go under
 * `test-results/npc-motion-office-hallway/`.
 */

const BOOT_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-motion-office-hallway';

test.use({ viewport: { width: 1600, height: 900 } });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function emily(page: Page): Promise<NpcMotionDebugInfo> {
  const info = (await debugInfo(page))?.npcs?.emily;
  if (!info) throw new Error('no __roomDebug.npcs entry for emily');
  return info;
}

test('The Hallway: Anthony is gone and Emily walks the corridor', async ({ page }) => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
  const errors = collectErrors(page);
  await page.goto('/?room=office-hallway');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.emily, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();

  expect(officeHallway.npcSlots.map((slot) => slot.npcId)).toEqual(['emily']);
  expect((await debugInfo(page))?.npcs?.['anthony-hallway']).toBeUndefined();

  const start = await emily(page);
  expect(start.moving).toBe(true);
  const seen = [start];
  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    seen.push(await emily(page));
    await page.screenshot({ path: `${PROOF_DIR}/t${shot * 1.5}s.png` });
  }
  // emilyLap's first leg heads north to (4,1): right and up on screen.
  const last = seen[seen.length - 1]!;
  expect(new Set(seen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size).toBeGreaterThan(1);
  expect(last.x).toBeGreaterThan(start.x);
  expect(last.y).toBeLessThan(start.y);

  expect(errors).toEqual([]);
});
