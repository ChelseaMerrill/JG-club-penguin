import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { npcSlotPoint, tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * Team Room 2's people (owner requests, 2026-10-02, Track D): Nick Brown,
 * Frank Nardone and Aleksandr Molchagin sit working at their desks, and
 * Chris Pence looks round the Room through his binoculars. The couch is
 * gone. Screenshots go under `test-results/npc-team-room-2/`.
 */

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-team-room-2';
const SITTERS = ['nick-brown', 'frank-nardone', 'aleksandr-molchagin'];

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

async function walkTo(page: Page, tile: Tile): Promise<void> {
  const point = tileToScreen(tile, teamRoom2.grid.origin);
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: WALK_TIMEOUT })
    .toEqual(tile);
}

async function chrisTurn(page: Page): Promise<number> {
  const info = (await debugInfo(page))?.npcs?.['chris-pence'];
  if (!info) throw new Error('no __roomDebug.npcs entry for chris-pence');
  return info.figureRotation;
}

test('Nick, Frank and Aleksandr sit at their desks, and Chris looks round the Room', async ({
  page,
}) => {
  test.setTimeout(60_000);
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
    .poll(async () => (await debugInfo(page))?.npcs?.['chris-pence'], { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);

  // The three at their desks stay put, where each slot's offset seats them.
  const npcs = (await debugInfo(page))?.npcs ?? {};
  expect(Object.keys(npcs).sort()).toEqual([...SITTERS, 'chris-pence'].sort());
  for (const id of SITTERS) {
    const slot = teamRoom2.npcSlots.find((s) => s.npcId === id)!;
    const seat = npcSlotPoint(slot, teamRoom2.grid.origin);
    expect(npcs[id], id).toMatchObject({ x: seat.x, y: seat.y, moving: false });
  }
  await page.screenshot({ path: `${PROOF_DIR}/room.png` });
  const aleksandr = npcs['aleksandr-molchagin']!;
  await page.screenshot({
    path: `${PROOF_DIR}/aleksandr-close-up.png`,
    clip: { x: aleksandr.x - 110, y: aleksandr.y - 150, width: 220, height: 190 },
  });

  // Chris turns one way, then the other, over his 14 s sweep, without
  // anyone moving: he looks round the Room, not at the Player.
  await expect.poll(() => chrisTurn(page), { timeout: 15_000 }).toBeLessThan(-0.1);
  const chris = npcs['chris-pence']!;
  const closeUp = { x: chris.x - 110, y: chris.y - 150, width: 220, height: 190 };
  await page.screenshot({ path: `${PROOF_DIR}/chris-looking-left.png`, clip: closeUp });
  await expect.poll(() => chrisTurn(page), { timeout: 15_000 }).toBeGreaterThan(0.1);
  await page.screenshot({ path: `${PROOF_DIR}/chris-looking-right.png`, clip: closeUp });

  // Where the couch stood is open floor now.
  await walkTo(page, { col: 2, row: 5 });

  expect(errors).toEqual([]);
});
