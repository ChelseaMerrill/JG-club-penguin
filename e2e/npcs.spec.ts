import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { npcSlotPoint, tileToScreen } from '../src/game/rooms/iso';
import { NPCS, type NpcId } from '../src/npcs/npcs';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/**
 * Ian now roams the Dev Pit (owner request, 2026-09-25, Track D): his click
 * target follows him, so a click needs his *current* position (`__roomDebug
 * .npcs.ian`, #113), not his static slot tile.
 */
async function npc(page: Page, npcId: string): Promise<NpcMotionDebugInfo> {
  const info = (await debugInfo(page))?.npcs?.[npcId];
  if (!info) throw new Error(`no __roomDebug.npcs entry for ${npcId}`);
  return info;
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator('#game canvas')).toBeVisible();
  await hideLandingPage(page);
  await waitForBoot(page);
  return errors;
}

for (const roomId of [
  'town-center',
  'dev-pit',
  'the-melt',
  'roof-deck',
  'the-icebox',
  'office-hallway',
  'team-room-1',
  'team-room-2',
  'team-room-3',
  'team-room-4',
  'bathroom',
  'the-mullet',
] as const) {
  test(`npcs-${roomId}: NPCs show at their designed positions`, async ({ page }) => {
    const errors = await bootRoom(page, roomId);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/npcs-${roomId}/screenshot.png` });

    expect(errors).toEqual([]);
  });
}

test('The Mullet: clicking Tony arrives and opens his line dialog (#51 slice 3)', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'the-mullet');

  const tony = await npc(page, 'tony');
  await clickStagePoint(page, { x: tony.x, y: tony.y });

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('tony');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Tony Mercadante');
  await expect(dialog).toContainText('Eight ball, corner pocket.');
  await page.screenshot({ path: 'test-results/npcs-the-mullet/tony-dialog.png' });

  expect(errors).toEqual([]);
});

test('Dev Pit: clicking Ian arrives, opens his dialog, and GRAB THE HAMMER opens Bug Squash', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'dev-pit');

  const ian = await npc(page, 'ian');
  await clickStagePoint(page, { x: ian.x, y: ian.y });

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Ian Ballard');

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE HAMMER' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('BUG SQUASH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-dev-pit/bug-squash-launched.png' });

  expect(errors).toEqual([]);
});

test('Team Room 2: clicking Ian arrives, opens his dialog, and GRAB THE HAMMER opens Bug Squash (#51)', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'team-room-2');

  const ian = teamRoom2.npcSlots.find((slot) => slot.npcId === 'ian-team-room-2');
  if (!ian) throw new Error('expected team-room-2 to have an "ian-team-room-2" NPC slot');
  const point = tileToScreen(ian.tile, teamRoom2.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian-team-room-2');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Ian Ballard');

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE HAMMER' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('BUG SQUASH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-team-room-2/bug-squash-launched.png' });

  expect(errors).toEqual([]);
});

/**
 * #149: the Hallway's, Team Room 3's and Team Room 4's NPCs draw at their own
 * scales (Millie's with a hand-placed nameplate and an exact slot `offset`), so a
 * click at the middle of each one's own click area still has to arrive and open
 * its dialog. Ian (Team Room 2) is covered above; Michael's Beystadium launch
 * is `beystadium.spec.ts`; Jason's offset nameplate is covered below.
 */
const HAND_PLACED_CLICKS: {
  room: RoomId;
  definition: typeof officeHallway;
  npcId: NpcId;
  name: string;
}[] = [
  { room: 'office-hallway', definition: officeHallway, npcId: 'emily', name: 'Emily Smith' },
  {
    room: 'team-room-3',
    definition: teamRoom3,
    npcId: 'millie-team-room-3',
    name: 'Millie Elliott',
  },
  { room: 'team-room-4', definition: teamRoom4, npcId: 'michael', name: 'Michael Prete' },
];
for (const { room, definition, npcId, name } of HAND_PLACED_CLICKS) {
  test(`${room}: clicking ${name} arrives and opens the dialog (#149)`, async ({ page }) => {
    const errors = await bootRoom(page, room);

    const slot = definition.npcSlots.find((s) => s.npcId === npcId);
    if (!slot) throw new Error(`expected ${room} to have a "${npcId}" NPC slot`);
    const feet = npcSlotPoint(slot, definition.grid.origin);
    await clickStagePoint(page, { x: feet.x, y: feet.y + npcLayout(NPCS[npcId]).hitArea.centerY });

    await expect
      .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
      .toContain(npcId);

    const dialog = page.locator('.npc-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.npc-dialog__name')).toHaveText(name);

    expect(errors).toEqual([]);
  });
}

/**
 * #149: Jason's nameplate hangs 55.5 px left of him, off his figure, so it has
 * to be part of his click area: clicking its middle opens his dialog.
 */
test("The Mullet: clicking Jason's offset nameplate opens his dialog (#149)", async ({ page }) => {
  const errors = await bootRoom(page, 'the-mullet');

  const slot = theMullet.npcSlots.find((s) => s.npcId === 'jason-mullet');
  if (!slot) throw new Error('expected the-mullet to have a "jason-mullet" NPC slot');
  const feet = npcSlotPoint(slot, theMullet.grid.origin);
  const layout = npcLayout(NPCS['jason-mullet']);
  await clickStagePoint(page, {
    x: feet.x + layout.nameplateCenterX,
    y: feet.y + (layout.nameplateTopY + layout.nameplateBottomY) / 2,
  });

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('jason-mullet');
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Jason Jahnel');

  expect(errors).toEqual([]);
});

/**
 * Clicking near Ian's head (not just his own tile centre) still opens his
 * dialog (#36 round-1 review item 6): the hit `Zone` covers roughly
 * feet-99..feet+5 (`npc-layout.ts`'s `hitArea`, from the nameplate's top), so a click well above the tile centre -- toward the
 * figure's head, not its feet -- must still land on it.
 */
test("Dev Pit: clicking near Ian's head (not just his feet) still opens his dialog", async ({
  page,
}) => {
  const errors = await bootRoom(page, 'dev-pit');

  const ian = await npc(page, 'ian');
  // Comfortably inside the hit zone's feet-99..feet+5 vertical range,
  // clearly above the tile centre (toward the head, not the feet).
  const headPoint = { x: ian.x, y: ian.y - 70 };

  await clickStagePoint(page, headPoint);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('ian');
  await expect(page.locator('.npc-dialog')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Roof Deck: clicking Josh arrives, opens his dialog, and WORK A SHIFT opens Snow Cone Stand', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'roof-deck');

  const josh = roofDeck.npcSlots.find((slot) => slot.npcId === 'josh');
  if (!josh) throw new Error('expected roof-deck to have a "josh" NPC slot');
  const point = tileToScreen(josh.tile, roofDeck.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('josh');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Josh Cantor-Stone');

  const grabButton = dialog.getByRole('button', { name: 'WORK A SHIFT' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('SNOW CONE STAND');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-roof-deck/snow-cone-stand-launched.png' });

  expect(errors).toEqual([]);
});

test('The Melt: clicking Tom arrives, opens his dialog, and GRAB THE POT opens Coffee Rush', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'the-melt');

  const tom = theMelt.npcSlots.find((slot) => slot.npcId === 'tom');
  if (!tom) throw new Error('expected the-melt to have a "tom" NPC slot');
  const point = tileToScreen(tom.tile, theMelt.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('tom');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText("Tom O'Neill");

  const grabButton = dialog.getByRole('button', { name: 'GRAB THE POT' });
  await expect(grabButton).toBeVisible();
  await grabButton.click();

  await expect(page.locator('.minigame__howto')).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText('COFFEE RUSH');
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: 'test-results/npcs-the-melt/coffee-rush-launched.png' });

  expect(errors).toEqual([]);
});

test('Roof Deck: clicking Casey arrives, opens her dialog, and her stall button opens the real Market panel', async ({
  page,
}) => {
  const errors = await bootRoom(page, 'roof-deck');

  const casey = roofDeck.npcSlots.find((slot) => slot.npcId === 'casey');
  if (!casey) throw new Error('expected roof-deck to have a "casey" NPC slot');
  const point = tileToScreen(casey.tile, roofDeck.grid.origin);

  await clickStagePoint(page, point);

  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('casey');

  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.npc-dialog__name')).toHaveText('Casey Snow');

  await dialog.locator('.npc-dialog__actions button').click();

  await expect
    .poll(async () => (await debugInfo(page))?.openStallLog, { timeout: LONG_WALK_TIMEOUT })
    .toContain('igloo-gear');
  // #40 is on `main`: the real Market panel opens, not just a logged no-op.
  await expect(page.locator('.market')).toBeVisible();
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});
