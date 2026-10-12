import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * Owner request, 2026-10-09: the LATAM Disco Hall's dance floor cycles
 * colours like `design/Latam Disco Hall.dc.html`'s own 48 animated tiles,
 * instead of sitting frozen at the exported PNG's one baked frame.
 * Screenshots go under `test-results/latam-disco-floor/`, one directory per
 * test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/latam-disco-floor';
/** The design's own 48 dance-floor polygons (`disco-floor.test.ts`/`latam-disco-hall-floor.ts`). */
const TILE_COUNT = 48;

test.use({ viewport: { width: 1600, height: 900 } });

function proofDir(name: string): string {
  const dir = `${PROOF_ROOT}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

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

/**
 * Boots the dev fake Player's Session at Town Center (a Room change needs
 * one), then jumps straight to the LATAM Disco Hall via `#15`'s navigator
 * `changeRoom` hook (same pattern as `remote-lounge.spec.ts`'s BACK TO HQ
 * test): the Disco Hall has no Map tile or door of its own to click through.
 */
async function bootDiscoHall(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer');
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('town-center');
  await page.evaluate(() => window.__roomDebug?.changeRoom?.('latam-disco-hall'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: BOOT_TIMEOUT })
    .toBe('latam-disco-hall');
  await expect
    .poll(async () => (await debugInfo(page))?.discoFloor?.length, { timeout: BOOT_TIMEOUT })
    .toBe(TILE_COUNT);
  return errors;
}

test('LATAM Disco Hall: the dance floor cycles its colours like the design', async ({ page }) => {
  const dir = proofDir('cycling');
  const errors = await bootDiscoHall(page);

  const first = (await debugInfo(page))?.discoFloor ?? [];
  await page.screenshot({ path: `${dir}/t0.png` });
  await page.waitForTimeout(1_000);
  const later = (await debugInfo(page))?.discoFloor ?? [];
  await page.screenshot({ path: `${dir}/t1.png` });

  expect(first).toHaveLength(TILE_COUNT);
  expect(later).toHaveLength(TILE_COUNT);
  // ~1s of a 3.2s cycle moves every tile's phase by about a third: the whole
  // set of 48 fills should have changed, not just coincidentally some of them.
  expect(later).not.toEqual(first);

  expect(errors).toEqual([]);
});

test('LATAM Disco Hall: with prefers-reduced-motion, the floor stays at its t=0 colours', async ({
  page,
}) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootDiscoHall(page);

  const first = (await debugInfo(page))?.discoFloor ?? [];
  await page.screenshot({ path: `${dir}/t0.png` });
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.discoFloor ?? [];
  await page.screenshot({ path: `${dir}/t1.png` });

  expect(first).toHaveLength(TILE_COUNT);
  expect(later).toEqual(first);

  expect(errors).toEqual([]);
});
