import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { npcSlotPoint } from '../src/game/rooms/iso';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * The Mullet's people (owner request, 2026-10-02, Track D): Ashley, Jory,
 * Dom, Jason, Nicole and Ann Marie left; Abby Rivera paints the wall, and
 * Adam Wilson-Hwang and Bryan Sambrook walk laps. Screenshots go under
 * `test-results/npc-motion-the-mullet/`.
 */

const BOOT_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-motion-the-mullet';
const REMOVED = [
  'ashley-mullet',
  'jory-mullet',
  'dom-mullet',
  'jason-mullet',
  'nicole-mullet',
  'ann-marie-mullet',
];

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

async function npc(page: Page, id: string): Promise<NpcMotionDebugInfo> {
  const info = (await debugInfo(page))?.npcs?.[id];
  if (!info) throw new Error(`no __roomDebug.npcs entry for ${id}`);
  return info;
}

test('The Mullet: the six are gone, Abby paints the wall, Adam and Bryan walk', async ({
  page,
}) => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
  const errors = collectErrors(page);
  await page.goto('/?room=the-mullet');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.npcs?.['abby-rivera'], { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);

  for (const id of REMOVED) expect((await debugInfo(page))?.npcs?.[id], id).toBeUndefined();

  const abbySlot = theMullet.npcSlots.find((slot) => slot.npcId === 'abby-rivera')!;
  const rest = npcSlotPoint(abbySlot, theMullet.grid.origin);
  expect(await npc(page, 'abby-rivera')).toMatchObject({ x: rest.x, y: rest.y, moving: false });

  const starts = {
    adam: await npc(page, 'adam-wilson-hwang'),
    bryan: await npc(page, 'bryan-sambrook'),
  };
  expect(starts.adam.moving).toBe(true);
  expect(starts.bryan.moving).toBe(true);

  for (let shot = 1; shot <= 4; shot += 1) {
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${PROOF_DIR}/t${shot * 1.5}s.png` });
    await page.screenshot({
      path: `${PROOF_DIR}/abby-${shot}.png`,
      clip: { x: rest.x - 90, y: rest.y - 150, width: 220, height: 170 },
    });
  }

  for (const [id, start] of [
    ['adam-wilson-hwang', starts.adam],
    ['bryan-sambrook', starts.bryan],
  ] as const) {
    const now = await npc(page, id);
    expect(Math.hypot(now.x - start.x, now.y - start.y), id).toBeGreaterThan(20);
  }

  expect(errors).toEqual([]);
});
