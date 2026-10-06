import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import type { RoomDefinition } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { MinigameTestHandle } from '../src/minigames/minigame-test-handle';
import { waitForElevatorHidden } from './support/elevator';
import type { NpcMotionDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * #171: every Minigame opens as an overlay over the Room it was started
 * from, and QUIT TO <ROOM> (or, for the Phishing Quiz, BACK TO THE ROOM)
 * tears that overlay down without moving the Player -- it never changes
 * `__roomDebug.roomId` or the local Penguin's tile. The behaviour already
 * exists (`minigame-shell.ts`'s `handleOverlayClose`/`teardown` never touch
 * the Room); this spec is the first e2e coverage of the round trip for each
 * Minigame, started the real way (talking to its NPC), not the `?minigame=`
 * test launcher `e2e/bug-squash.spec.ts` etc. use to drive a round's play
 * mechanics.
 *
 * Anthony (the Phishing Quiz's door guard, #146) never has a static spot in
 * the Hallway any more -- he left it for good (owner request, 2026-10-02,
 * Track D; `office-hallway.ts`), and the Hallway was never one of his guard
 * posts to begin with (`fake-data.ts`'s `FAKE_GUARD_POSTS`,
 * `20260928020000_phishing_quiz.sql`'s seed): he only ever stands in Town
 * Center, the Dev Pit, The Melt or the Roof Deck. The "Phishing Quiz started
 * outside the Hallway" case this ticket asks for is therefore just his
 * normal guard duty, placed deterministically with the same
 * `window.__phishingTest.setNow` hook `e2e/phishing-quiz.spec.ts` uses --
 * no new hook needed.
 */

declare global {
  interface Window {
    __minigameTest?: MinigameTestHandle;
    __phishingTest?: {
      setNow(ms: number): Promise<void>;
      correctChoice(): number | null;
    };
  }
}

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/minigame-exit';
/** Post 0 of `FAKE_GUARD_POSTS`: Town Center's THE ICEBOX door, one minute
 *  into its window -- never the Hallway, which has no guard post at all. */
const TOWN_CENTER_ICEBOX = 60_000;
const HIT_AREA = npcLayout({ kind: 'human' }).hitArea;

function proofDir(name: string): string {
  const dir = `${PROOF_ROOT}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
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

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/**
 * Boots a real Session (`/?asPlayer&hud`, always Town Center, #15) and, for
 * any other `roomId`, gets there via `__roomDebug.changeRoom` -- a real
 * `room-navigator.ts` `changeRoom`, the same one a door click or the Map
 * drives (`e2e/room-transitions.spec.ts`'s own pattern). A plain `/?room=`
 * boot (`npcs.spec.ts`'s pattern) skips that navigator entirely, so the
 * Minigame launcher's own `room:enter` tracking for "QUIT TO <ROOM>"
 * (`minigame-launcher.ts`) never hears about it and keeps reading Town
 * Center -- exactly the mismatch this spec exists to rule out, so it needs
 * the real navigation path, not the lighter boot.
 */
async function bootRoom(page: Page, roomId: RoomId): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/?asPlayer&hud');
  await expect(page.locator('#game canvas')).toBeVisible();
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  if (roomId !== 'town-center') {
    await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe(roomId);
    await waitForElevatorHidden(page);
  }

  return errors;
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

/** Ian's click target follows him (he roams the Dev Pit, #113) -- his
 *  *current* position, not his static slot tile, same as `npcs.spec.ts`. */
async function npc(page: Page, npcId: string): Promise<NpcMotionDebugInfo> {
  const info = (await debugInfo(page))?.npcs?.[npcId];
  if (!info) throw new Error(`no __roomDebug.npcs entry for ${npcId}`);
  return info;
}

async function talkTo(page: Page, npcId: string, point: { x: number; y: number }): Promise<void> {
  await clickStagePoint(page, point);
  await expect
    .poll(async () => (await debugInfo(page))?.npcArrivedLog, { timeout: WALK_TIMEOUT })
    .toContain(npcId);
  await expect(page.locator('.npc-dialog')).toBeVisible();
}

/**
 * Talks to `npcId`, starts their Minigame from the NPC dialog's
 * `actionLabel` button, asserts the how-to-play screen is showing the right
 * Minigame, then exits with QUIT TO <ROOM> from the how-to-play screen
 * (before any play) and asserts the Room -- and the local Penguin's tile --
 * are exactly as they were before the Minigame opened.
 */
async function quitFromHowto(
  page: Page,
  opts: {
    room: RoomDefinition;
    npcId: string;
    point: { x: number; y: number };
    actionLabel: string;
    minigameTitle: string;
  },
): Promise<void> {
  await talkTo(page, opts.npcId, opts.point);

  const tileBefore = (await debugInfo(page))?.localPenguin?.tile;
  expect(tileBefore).toBeDefined();

  const dialog = page.locator('.npc-dialog');
  await dialog.getByRole('button', { name: opts.actionLabel }).click();

  const howto = page.locator('.minigame__howto');
  await expect(howto).toBeVisible();
  await expect(page.locator('.minigame__howto-subtitle')).toContainText(opts.minigameTitle);
  await expect(dialog).toBeHidden();

  await howto.getByRole('button', { name: `QUIT TO ${opts.room.title}` }).click();

  await expect(howto).toBeHidden();
  expect((await debugInfo(page))?.roomId).toBe(opts.room.id);
  expect((await debugInfo(page))?.localPenguin?.tile).toEqual(tileBefore);
}

test.describe('Minigame exit returns to the starting Room (#171)', () => {
  test('Bug Squash: quitting from Ian in the Dev Pit returns to the Dev Pit', async ({ page }) => {
    const errors = await bootRoom(page, 'dev-pit');
    const ian = await npc(page, 'ian');

    await quitFromHowto(page, {
      room: devPit,
      npcId: 'ian',
      point: { x: ian.x, y: ian.y },
      actionLabel: 'GRAB THE HAMMER',
      minigameTitle: 'BUG SQUASH',
    });

    await page.screenshot({ path: `${PROOF_ROOT}/bug-squash-dev-pit/screenshot.png` });
    expect(errors).toEqual([]);
  });

  test('Coffee Rush: quitting from Tom in The Melt returns to The Melt', async ({ page }) => {
    const errors = await bootRoom(page, 'the-melt');
    const tom = theMelt.npcSlots.find((slot) => slot.npcId === 'tom');
    if (!tom) throw new Error('expected the-melt to have a "tom" NPC slot');
    const point = tileToScreen(tom.tile, theMelt.grid.origin);

    await quitFromHowto(page, {
      room: theMelt,
      npcId: 'tom',
      point,
      actionLabel: 'GRAB THE POT',
      minigameTitle: 'COFFEE RUSH',
    });

    await page.screenshot({ path: `${PROOF_ROOT}/coffee-rush-the-melt/screenshot.png` });
    expect(errors).toEqual([]);
  });

  test('Pancake Flip: quitting from Chelsea in The Melt returns to The Melt', async ({ page }) => {
    const errors = await bootRoom(page, 'the-melt');
    const chelsea = theMelt.npcSlots.find((slot) => slot.npcId === 'chelsea');
    if (!chelsea) throw new Error('expected the-melt to have a "chelsea" NPC slot');
    const point = tileToScreen(chelsea.tile, theMelt.grid.origin);

    await quitFromHowto(page, {
      room: theMelt,
      npcId: 'chelsea',
      point,
      actionLabel: 'GRAB THE SPATULA',
      minigameTitle: 'PANCAKE FLIP',
    });

    await page.screenshot({ path: `${PROOF_ROOT}/pancake-flip-the-melt/screenshot.png` });
    expect(errors).toEqual([]);
  });

  test('Snow Cone Stand: quitting from Josh on the Roof Deck returns to the Roof Deck', async ({
    page,
  }) => {
    const errors = await bootRoom(page, 'roof-deck');
    const josh = roofDeck.npcSlots.find((slot) => slot.npcId === 'josh');
    if (!josh) throw new Error('expected roof-deck to have a "josh" NPC slot');
    const point = tileToScreen(josh.tile, roofDeck.grid.origin);

    await quitFromHowto(page, {
      room: roofDeck,
      npcId: 'josh',
      point,
      actionLabel: 'WORK A SHIFT',
      minigameTitle: 'SNOW CONE STAND',
    });

    await page.screenshot({ path: `${PROOF_ROOT}/snow-cone-stand-roof-deck/screenshot.png` });
    expect(errors).toEqual([]);
  });

  test('Beystadium: quitting from Michael in Team Room 4 returns to Team Room 4', async ({
    page,
  }) => {
    // `bootRoom` already waits out the elevator screen for this cross-floor
    // change (same as `e2e/beystadium.spec.ts`'s own NPC-trigger test).
    const errors = await bootRoom(page, 'team-room-4');

    const michael = teamRoom4.npcSlots.find((slot) => slot.npcId === 'michael');
    if (!michael) throw new Error('expected team-room-4 to have a "michael" NPC slot');
    const point = tileToScreen(michael.tile, teamRoom4.grid.origin);

    await quitFromHowto(page, {
      room: teamRoom4,
      npcId: 'michael',
      point,
      actionLabel: 'LET IT RIP',
      minigameTitle: 'BEYSTADIUM',
    });

    await page.screenshot({ path: `${PROOF_ROOT}/beystadium-team-room-4/screenshot.png` });
    expect(errors).toEqual([]);
  });

  test('Beystadium: a full match keeps its usual payout and Badge readout, and EXIT returns to Town Center', async ({
    page,
  }) => {
    const dir = proofDir('beystadium-done-exit');
    const TICK_MS = 50;
    const errors = collectErrors(page);

    // Same flow as `e2e/beystadium.spec.ts`'s full-round test: the
    // `?minigame=` launcher, with `page.clock.install()` before navigation
    // so the shell's 50ms tick is faked from the first script run. The
    // launcher boots the Room behind it the normal way (no `?room=`, so
    // `SPAWN_ROOM_ID` -- Town Center), and the launcher's own "QUIT TO
    // <ROOM>" tracks whatever Room is actually live, the same as a real NPC
    // launch would (`minigame-launcher.ts`).
    await page.clock.install();
    await page.goto('/?minigame=beystadium');
    await expect(page.locator('.minigame__howto')).toBeVisible();
    await page.locator('.minigame__button--start').click();

    await expect(page.locator('.beystadium__pick')).toBeVisible();
    await page.locator('[data-bey="1"]').click();

    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1_000);
    await page.locator('.beystadium__to-stadium').click();
    await expect(page.locator('.beystadium__launch')).toBeVisible();
    await page.clock.runFor(20 * TICK_MS);
    await page.keyboard.press('Space');

    await expect(page.locator('.beystadium__fight')).toBeVisible();
    await expect(page.locator('.beystadium__clash')).toHaveText('PERFECT LAUNCH');

    await page.clock.runFor(31 * TICK_MS);
    await expect(page.locator('.beystadium__ring-label')).toHaveText('STRIKE!');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-counter="score"]')).toHaveText('1');

    // Same shortcut `e2e/beystadium.spec.ts` uses: the finish hook ends the
    // match as it stands (a loss), rather than playing a full best-of-3.
    await page.evaluate(() => window.__minigameTest!.finishBeystadiumNow());

    await expect(page.locator('.minigame__done')).toBeVisible();
    // The same payout/Badge readouts `e2e/beystadium.spec.ts` asserts for
    // this exact finish point: unaffected by quitting through to Town
    // Center afterward.
    await expect(page.locator('.minigame__done-title')).toHaveText('3-0. AGAIN.');
    await expect(page.locator('[data-done-stat="score"] .minigame__done-stat-value')).toHaveText(
      '1',
    );
    await expect(
      page.locator('[data-done-stat="perfectLaunches"] .minigame__done-stat-value'),
    ).toHaveText('1');
    await expect(page.locator('.minigame__done-saving')).toBeHidden();
    await expect(page.locator('[data-done-stat="tokens"] .minigame__done-stat-value')).toHaveText(
      '+15',
    );
    await expect(page.locator('.minigame__done-quote')).toHaveText(
      'Michael: "Told you. Rematch whenever you want to lose again."',
    );
    await page.screenshot({ path: `${dir}/done.png` });

    expect((await debugInfo(page))?.roomId).toBe('town-center');
    await page
      .locator('.minigame__done')
      .getByRole('button', { name: 'QUIT TO TOWN CENTER' })
      .click();

    await expect(page.locator('.minigame__done')).toBeHidden();
    expect((await debugInfo(page))?.roomId).toBe('town-center');
    await page.screenshot({ path: `${dir}/back-in-room.png` });

    expect(errors).toEqual([]);
  });

  test('Phishing Quiz: Anthony guarding Town Center (never the Hallway) -- BACK TO THE ROOM returns to Town Center', async ({
    page,
  }) => {
    const dir = proofDir('phishing-quiz-town-center');
    const errors = collectErrors(page);

    await page.goto('/?asPlayer&hud&phishing');
    await expect(page.locator('#game canvas')).toBeVisible();
    await waitForBoot(page);
    await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
    await expect.poll(() => page.evaluate(() => Boolean(window.__phishingTest))).toBe(true);
    await page.evaluate((at) => window.__phishingTest!.setNow(at), TOWN_CENTER_ICEBOX);
    await page.evaluate(() => document.fonts.ready);

    await expect
      .poll(async () => (await debugInfo(page))?.guard)
      .toMatchObject({ npcId: 'anthony', doorLabel: 'THE ICEBOX', blocking: true });
    // Confirms this quiz starts outside the Hallway (#146's guard posts never
    // include it; see the file header comment).
    expect((await debugInfo(page))?.roomId).toBe('town-center');

    const guardTile = (await debugInfo(page))?.guard?.tile;
    if (!guardTile) throw new Error('expected Anthony to be guarding');
    const feet = tileToScreen(guardTile, townCenter.grid.origin);
    await clickStagePoint(page, { x: feet.x + HIT_AREA.centerX, y: feet.y + HIT_AREA.centerY });

    const dialog = page.locator('.npc-dialog');
    await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
    const tileBefore = (await debugInfo(page))?.localPenguin?.tile;

    await dialog.getByRole('button', { name: 'TAKE THE QUIZ' }).click();
    await page.locator('.phishing-quiz').getByRole('button', { name: 'START QUIZ' }).click();
    await expect(page.locator('.phishing-quiz__prompt')).toBeVisible();
    await page.screenshot({ path: `${dir}/question.png` });

    const correct = await page.evaluate(() => window.__phishingTest!.correctChoice());
    if (correct === null) throw new Error('no open challenge');
    await page.keyboard.press(['A', 'B', 'C', 'D'][correct]);
    await expect(page.locator('.phishing-quiz__explain')).toBeVisible();
    await page.locator('.phishing-quiz').getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.phishing-quiz__done')).toBeVisible();
    await page.screenshot({ path: `${dir}/result.png` });

    await page
      .locator('.phishing-quiz__done')
      .getByRole('button', { name: 'BACK TO THE ROOM' })
      .click();

    await expect(page.locator('.phishing-quiz')).toBeHidden();
    expect((await debugInfo(page))?.roomId).toBe('town-center');
    expect((await debugInfo(page))?.localPenguin?.tile).toEqual(tileBefore);
    await page.screenshot({ path: `${dir}/back-in-room.png` });

    expect(errors).toEqual([]);
  });
});
