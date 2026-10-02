import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { npcSlotPoint, tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * Team Room 2's people (owner request, 2026-10-02, Track D): Nick Brown and
 * Frank Nardone sit working at their desks, and Chris Pence watches the
 * Player through his binoculars, leaning toward their Penguin as it moves.
 * Screenshots go under `test-results/npc-team-room-2/`.
 */

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-team-room-2';

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

async function clickTile(page: Page, tile: Tile): Promise<void> {
  const point = tileToScreen(tile, teamRoom2.grid.origin);
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

async function walkTo(page: Page, tile: Tile): Promise<void> {
  await clickTile(page, tile);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: WALK_TIMEOUT })
    .toEqual(tile);
}

async function lean(page: Page): Promise<number> {
  const value = (await debugInfo(page))?.watching?.['chris-pence'];
  if (value === undefined) throw new Error('Chris Pence is not watching');
  return value;
}

test('Nick and Frank sit at their desks, and Chris leans toward the Penguin as it moves', async ({
  page,
}) => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
  const errors = collectErrors(page);
  await page.goto('/?room=team-room-2');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.watching?.['chris-pence'], {
      timeout: BOOT_TIMEOUT,
    })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);

  // The two at their desks stay put, where the slot's offset seats them.
  const npcs = (await debugInfo(page))?.npcs ?? {};
  expect(Object.keys(npcs).sort()).toEqual(['chris-pence', 'frank-nardone', 'nick-brown']);
  for (const id of ['nick-brown', 'frank-nardone']) {
    const slot = teamRoom2.npcSlots.find((s) => s.npcId === id)!;
    const seat = npcSlotPoint(slot, teamRoom2.grid.origin);
    expect(npcs[id], id).toMatchObject({ x: seat.x, y: seat.y, moving: false });
  }

  // Chris stands at (0,2), Stage x 700: left of him, then right of him.
  await walkTo(page, { col: 2, row: 7 }); // Stage x 550
  await expect.poll(() => lean(page)).toBeLessThan(-0.05);
  await page.screenshot({ path: `${PROOF_DIR}/penguin-left.png` });
  await walkTo(page, { col: 8, row: 2 }); // Stage x 1100
  await expect.poll(() => lean(page)).toBeGreaterThan(0.1);
  await page.screenshot({ path: `${PROOF_DIR}/penguin-right.png` });

  expect(errors).toEqual([]);
});
