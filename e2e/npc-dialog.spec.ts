import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { npcSlotPoint } from '../src/game/rooms/iso';
import type { RoomDefinition } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { dialogLinePool } from '../src/npcs/dialog-lines';
import { NPCS, type NpcId } from '../src/npcs/npcs';
import { TOM_COFFEE_ACTION_LABEL } from '../src/quests/coffee-run';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #144: NPC dialogs rotate their lines, and quest givers offer "Got any work
 * for me?". Screenshots go under `test-results/npc-dialog/` (local only).
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
const PROOF_DIR = 'test-results/npc-dialog';
/** The centre of `RoomScene`'s click zone for a Human NPC, relative to its feet. */
const HIT_ZONE_OFFSET_Y = npcLayout({ kind: 'human' }).hitArea.centerY;

test.use({ viewport: { width: 1600, height: 900 } });

test.beforeAll(() => {
  rmSync(PROOF_DIR, { recursive: true, force: true });
  mkdirSync(PROOF_DIR, { recursive: true });
});

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

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** Reduced motion keeps every NPC standing on its slot tile, so its click point is fixed. */
async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

/** Clicks an NPC at its slot tile and waits for its dialog to open. */
async function openDialog(page: Page, room: RoomDefinition, npcId: NpcId): Promise<void> {
  const slot = room.npcSlots.find((s) => s.npcId === npcId);
  if (!slot) throw new Error(`no ${npcId} slot in ${room.id}`);
  const feet = npcSlotPoint(slot, room.grid.origin);
  await clickStagePoint(page, { x: feet.x, y: feet.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: LONG_WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText(NPCS[npcId].name);
}

async function closeDialog(page: Page): Promise<void> {
  await page.locator('.npc-dialog__close').click();
  await expect(page.locator('.npc-dialog')).toBeHidden();
}

test("Dev Pit: Ashley's dialog shows a different line each time it opens", async ({ page }) => {
  const errors = await bootRoom(page, 'dev-pit');
  const pool = dialogLinePool(NPCS.ashley);
  const line = page.locator('.npc-dialog__line');

  await openDialog(page, devPit, 'ashley');
  const first = await line.textContent();
  expect(pool).toContain(first);
  await closeDialog(page);

  await openDialog(page, devPit, 'ashley');
  const second = await line.textContent();
  expect(pool).toContain(second);
  expect(second).not.toBe(first);
  await page.screenshot({ path: `${PROOF_DIR}/ashley-dialog.png` });

  expect(errors).toEqual([]);
});

test('The Mullet: Jon offers "Got any work for me?" and answers with his nothing-right-now line', async ({
  page,
}) => {
  // His quest-giver appearance since he left Town Center (owner request,
  // 2026-10-02, Track D). He sways with the ping-pong rally there, so this
  // clicks where he is now rather than his slot point.
  const errors = await bootRoom(page, 'the-mullet');
  const jon = (await debugInfo(page))?.npcs?.['jon-mullet'];
  if (!jon) throw new Error('no jon-mullet in the Mullet');
  await clickStagePoint(page, { x: jon.x, y: jon.y + HIT_ZONE_OFFSET_Y });
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: LONG_WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Jon Keller');
  const offer = page.getByRole('button', { name: 'Got any work for me?' });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(page.locator('.npc-dialog__line')).toHaveText(
    'Just enjoy the tour. Sunglasses stay on.',
  );
  await expect(page.locator('.npc-dialog')).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/quest-giver-offer.png` });

  expect(errors).toEqual([]);
});

/** Every dialog button's label, whether its text overflows the button, and whether the button stays inside the panel. */
async function buttonFits(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.npc-dialog__panel')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll<HTMLElement>('.npc-dialog__actions button')).map(
      (button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.textContent,
          // CSS px: the #ui layer is scaled to the letterboxed Stage, so rects aren't.
          height: button.offsetHeight,
          clipped:
            button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight,
          inside: rect.left >= panel.left && rect.right <= panel.right,
        };
      },
    );
  });
}

/** Adds an errand button with `label` and the real classes, as `extraActions` renders one. */
async function addErrandButton(page: Page, label: string): Promise<void> {
  await page.evaluate((text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'npc-dialog__button npc-dialog__button--extra';
    button.textContent = text;
    document.querySelector('.npc-dialog__actions')!.append(button);
  }, label);
}

test("The Melt: Tom's three dialog buttons wrap onto rows without clipping a label (#224)", async ({
  page,
}) => {
  const errors = await bootRoom(page, 'the-melt');
  await openDialog(page, theMelt, 'tom');
  // Tom's own two Coffee Rush buttons, plus his Nicole's-coffee errand. That
  // errand only shows mid-Quest, which needs a signed-in Player, so the test
  // adds a button with its exact label and classes alongside the real two.
  await addErrandButton(page, TOM_COFFEE_ACTION_LABEL);

  const fits = await buttonFits(page);
  expect(fits).toHaveLength(3);
  // Single-line buttons keep the design's 48px chevron height.
  for (const fit of fits) expect(fit.height, String(fit.label)).toBe(48);
  for (const fit of fits) {
    expect(fit, String(fit.label)).toMatchObject({ clipped: false, inside: true });
  }
  await page
    .locator('.npc-dialog__panel')
    .screenshot({ path: `${PROOF_DIR}/tom-three-buttons.png` });

  // Keyboard focus shows as a light bottom bar, not an inset ring the chevron
  // clips down to a white top edge and side tips (#224).
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focusShadow = await page.evaluate(() =>
    document.activeElement?.matches('.npc-dialog__button:focus-visible')
      ? getComputedStyle(document.activeElement).boxShadow
      : null,
  );
  expect(focusShadow).not.toBeNull();
  expect(focusShadow!.split('inset').length - 1).toBe(1);
  await page.locator('.npc-dialog__panel').screenshot({ path: `${PROOF_DIR}/focused-button.png` });

  // A label too long for a whole row wraps inside a taller button, never clipped.
  await addErrandButton(page, 'Ask Tom for the extra-hot oat latte with two pumps of vanilla');
  for (const fit of await buttonFits(page)) {
    expect(fit, String(fit.label)).toMatchObject({ clipped: false, inside: true });
  }
  await page
    .locator('.npc-dialog__panel')
    .screenshot({ path: `${PROOF_DIR}/long-errand-label.png` });
  expect(errors).toEqual([]);
});
