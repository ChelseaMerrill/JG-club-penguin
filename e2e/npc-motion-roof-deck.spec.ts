import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { npcSlotPoint, tileToScreen } from '../src/game/rooms/iso';
import { BICH_WATERING_OFFSET } from '../src/npcs/motions/roof-deck';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #113: the Roof Deck's NPCs and their motions: since Brandon and Millie left
 * (owner request, 2026-10-02, Track D), Bich Dudla and Eva Trimboli are the
 * ones who walk. Screenshots
 * (and a short video) go under `test-results/npc-motion-roof-deck/`, one
 * directory per test so a rerun replaces its own stale proof.
 */

const BOOT_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/npc-motion-roof-deck';
/** The two Market NPCs who walk (owner requests, 2026-10-02, Track D). */
const WALKERS = ['bich-dudla', 'eva-trimboli'];
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

/** `?room=roof-deck` boots straight into the Roof Deck, so no Elevator screen plays. */
async function bootRoofDeck(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?room=roof-deck');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.josh, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test("the Market's stallholders stay put while Bich waters the plants and Eva walks", async ({
  page,
}) => {
  const dir = proofDir('market');
  const errors = await bootRoofDeck(page);

  // Brandon and Millie left the Market; Bich Dudla and Eva Trimboli joined
  // it, the only two who walk (owner requests, 2026-10-02, Track D).
  const npcs = (await debugInfo(page))?.npcs ?? {};
  expect(Object.keys(npcs).sort()).toEqual(roofDeck.npcSlots.map((s) => s.npcId).sort());
  for (const id of Object.keys(npcs)) expect(npcs[id]!.moving, id).toBe(WALKERS.includes(id));

  // Each walks on, though it pauses at corners and stops to water: sampled
  // every half second for 5 s, it gets more than 20 px from where it was.
  const start = (await debugInfo(page))?.npcs ?? {};
  const furthest: Record<string, number> = {};
  for (let sample = 0; sample < 10; sample += 1) {
    await page.waitForTimeout(500);
    const now = (await debugInfo(page))?.npcs ?? {};
    for (const id of WALKERS) {
      const moved = Math.hypot(now[id]!.x - start[id]!.x, now[id]!.y - start[id]!.y);
      furthest[id] = Math.max(furthest[id] ?? 0, moved);
    }
  }
  for (const id of WALKERS) expect(furthest[id], id).toBeGreaterThan(20);
  await page.screenshot({ path: `${dir}/walking.png` });

  // Bich's first stop: watering the plant by the back-left wall.
  const plant = tileToScreen({ col: 0, row: 2 }, roofDeck.grid.origin);
  const stop = { x: plant.x + BICH_WATERING_OFFSET.x, y: plant.y + BICH_WATERING_OFFSET.y };
  await expect
    .poll(
      async () => {
        const bich = (await debugInfo(page))?.npcs?.['bich-dudla'];
        return bich ? Math.hypot(bich.x - stop.x, bich.y - stop.y) : Infinity;
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBeLessThan(1);
  await page.waitForTimeout(1_000);
  await page.screenshot({
    path: `${dir}/bich-watering.png`,
    clip: { x: stop.x - 130, y: stop.y - 150, width: 260, height: 200 },
  });

  expect(errors).toEqual([]);
});

test('with prefers-reduced-motion, every NPC stands still at its slot tile', async ({ page }) => {
  const dir = proofDir('reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootRoofDeck(page);

  const first = (await debugInfo(page))?.npcs ?? {};
  await page.waitForTimeout(2_000);
  const later = (await debugInfo(page))?.npcs ?? {};

  for (const slot of roofDeck.npcSlots) {
    const rest = npcSlotPoint(slot, roofDeck.grid.origin);
    expect(first[slot.npcId]).toMatchObject({ x: rest.x, y: rest.y, moving: false });
    expect(later[slot.npcId]).toEqual(first[slot.npcId]);
  }
  await page.screenshot({ path: `${dir}/still.png` });

  expect(errors).toEqual([]);
});

test('records a short video of the Roof Deck NPCs in motion', async ({ browser, baseURL }) => {
  const dir = proofDir('video');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootRoofDeck(page);
  await page.waitForTimeout(8_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/roof-deck-npc-motion.webm`);
  await video?.delete();
});
