import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import type { RoomDefinition } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #146: the Phishing Quiz against the dev/e2e fake server (`?asPlayer`), on
 * a clock the spec freezes with `__phishingTest.setNow` (`?phishing` turns the
 * quiz on for `?asPlayer`). Screenshots go
 * under `test-results/phishing-quiz/`, one directory per test.
 */

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
const PROOF_ROOT = 'test-results/phishing-quiz';
/** Post 0 (Town Center's THE ICEBOX door), one minute into its window. */
const TOWN_CENTER_ICEBOX = 60_000;
/** Post 3 (Town Center's DEV PIT door). */
const TOWN_CENTER_DEV_PIT = 3 * 600_000 + 60_000;
/** Post 1 (Dev Pit's THE ICEBOX door): no Anthony in Town Center. */
const DEV_PIT_ICEBOX = 600_000 + 60_000;
const HIT_AREA = npcLayout({ kind: 'human' }).hitArea;
const KEYS = ['A', 'B', 'C', 'D'];

declare global {
  interface Window {
    __phishingTest?: {
      setNow(ms: number): Promise<void>;
      correctChoice(): number | null;
    };
  }
}

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

async function guard(page: Page) {
  return (await debugInfo(page))?.guard ?? null;
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

async function setNow(page: Page, ms: number): Promise<void> {
  await page.evaluate((at) => window.__phishingTest!.setNow(at), ms);
}

/** Boots a fixture Player into Town Center, with the fake clock at `nowMs`. */
async function boot(page: Page, nowMs: number): Promise<void> {
  await page.goto('/?asPlayer&hud&phishing');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.evaluate(() => {
    const landing = document.querySelector<HTMLElement>('#ui .landing');
    if (landing) landing.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await expect.poll(() => page.evaluate(() => Boolean(window.__phishingTest))).toBe(true);
  await setNow(page, nowMs);
  await page.evaluate(() => document.fonts.ready);
}

async function changeRoom(page: Page, roomId: RoomDebugInfo['roomId']): Promise<void> {
  await page.evaluate((id) => window.__roomDebug?.changeRoom?.(id), roomId);
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe(roomId);
  await waitForElevatorHidden(page);
}

/** Clicks Anthony's click zone in `room`. */
async function clickAnthony(page: Page, room: RoomDefinition): Promise<void> {
  const current = await guard(page);
  if (!current) throw new Error('no guard in this Room');
  const feet = tileToScreen(current.tile, room.grid.origin);
  await clickStagePoint(page, { x: feet.x + HIT_AREA.centerX, y: feet.y + HIT_AREA.centerY });
}

/** Walks to Anthony and opens the quiz up to its question. */
async function openQuestion(page: Page, room: RoomDefinition): Promise<void> {
  await clickAnthony(page, room);
  const dialog = page.locator('.npc-dialog');
  await expect(dialog).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(dialog.locator('.npc-dialog__subtitle')).toHaveText('DOOR BOSS · PHISHING QUIZ');
  await dialog.getByRole('button', { name: 'TAKE THE QUIZ' }).click();
  await page.locator('.phishing-quiz').getByRole('button', { name: 'START QUIZ' }).click();
  await expect(page.locator('.phishing-quiz__prompt')).toBeVisible();
}

/** Answers the open question right or wrong with its A-D key, then continues to the result. */
async function answer(page: Page, right: boolean): Promise<void> {
  const correct = await page.evaluate(() => window.__phishingTest!.correctChoice());
  if (correct === null) throw new Error('no open challenge');
  await page.keyboard.press(KEYS[right ? correct : (correct + 1) % 4]);
  await expect(page.locator('.phishing-quiz__explain')).toBeVisible();
}

async function continueToResult(page: Page): Promise<void> {
  await page.locator('.phishing-quiz').getByRole('button', { name: 'CONTINUE' }).click();
  await expect(page.locator('.phishing-quiz__done')).toBeVisible();
}

async function backToRoom(page: Page): Promise<void> {
  await page
    .locator('.phishing-quiz__done')
    .getByRole('button', { name: 'BACK TO THE ROOM' })
    .click();
  await expect(page.locator('.phishing-quiz')).toBeHidden();
}

/** A point on `doorLabel`'s hotspot that isn't under Anthony's click zone. */
async function doorPointClearOfAnthony(page: Page, doorLabel: string) {
  const door = townCenter.doors.find((d) => d.label === doorLabel)!;
  const current = await guard(page);
  const feet = current ? tileToScreen(current.tile, townCenter.grid.origin) : null;
  const zone = feet && {
    left: feet.x + HIT_AREA.centerX - HIT_AREA.width / 2,
    right: feet.x + HIT_AREA.centerX + HIT_AREA.width / 2,
    top: feet.y + HIT_AREA.centerY - HIT_AREA.height / 2,
    bottom: feet.y + HIT_AREA.centerY + HIT_AREA.height / 2,
  };
  for (let fy = 0.1; fy < 1; fy += 0.1) {
    for (const fx of [0.1, 0.9, 0.5]) {
      const point = {
        x: door.hotspot.x + door.hotspot.width * fx,
        y: door.hotspot.y + door.hotspot.height * fy,
      };
      const covered =
        zone &&
        point.x >= zone.left &&
        point.x <= zone.right &&
        point.y >= zone.top &&
        point.y <= zone.bottom;
      if (!covered) return point;
    }
  }
  throw new Error(`Anthony covers all of ${doorLabel}`);
}

test('Anthony stands at the scheduled door, the same for two Players, and moves when the window ends', async ({
  browser,
}) => {
  const dir = proofDir('scheduled-door');
  const first = await browser.newPage();
  const second = await browser.newPage();
  const errors = [...collectErrors(first), ...collectErrors(second)];
  await boot(first, TOWN_CENTER_ICEBOX);
  await boot(second, TOWN_CENTER_ICEBOX);

  await expect
    .poll(() => guard(first))
    .toMatchObject({ npcId: 'anthony', doorLabel: 'THE ICEBOX', blocking: true });
  const a = await guard(first);
  const b = await guard(second);
  expect(b).toEqual(a);
  await first.screenshot({ path: `${dir}/town-center-icebox.png` });

  await setNow(first, TOWN_CENTER_DEV_PIT);
  await expect.poll(() => guard(first)).toMatchObject({ doorLabel: 'DEV PIT', blocking: true });
  await first.screenshot({ path: `${dir}/town-center-dev-pit.png` });

  await setNow(first, DEV_PIT_ICEBOX);
  await expect.poll(() => guard(first)).toBeNull();

  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

test('clicking Anthony opens the quiz; a wrong answer keeps his door shut, a correct one pays and opens it', async ({
  page,
}) => {
  const dir = proofDir('quiz');
  const errors = collectErrors(page);
  await boot(page, TOWN_CENTER_ICEBOX);
  await expect.poll(() => guard(page)).toMatchObject({ doorLabel: 'THE ICEBOX', blocking: true });

  await clickAnthony(page, townCenter);
  await expect(page.locator('.npc-dialog')).toBeVisible({ timeout: WALK_TIMEOUT });
  await expect(page.locator('.npc-dialog__line')).toHaveText(
    'Whoa there. You bumped into me, so you know the rule: one security question before you pass.',
  );
  await page.screenshot({ path: `${dir}/trigger.png` });
  await page.locator('.npc-dialog').getByRole('button', { name: 'TAKE THE QUIZ' }).click();
  await expect(page.locator('.phishing-quiz__howto')).toBeVisible();
  await page.screenshot({ path: `${dir}/how-to-play.png` });
  await page.locator('.phishing-quiz').getByRole('button', { name: 'START QUIZ' }).click();
  await expect(page.locator('.phishing-quiz__prompt')).toBeVisible();
  await expect(page.locator('.phishing-quiz__choice')).toHaveCount(4);
  await page.screenshot({ path: `${dir}/question.png` });

  // Wrong: no Tokens, and the door stays shut.
  await answer(page, false);
  await page.screenshot({ path: `${dir}/wrong-explanation.png` });
  await continueToResult(page);
  await expect(page.locator('.phishing-quiz__done-kicker')).toHaveText('DOOR STILL LOCKED');
  await expect(page.locator('.phishing-quiz__result-line')).toHaveText('Wrong. Try again.');
  await page.screenshot({ path: `${dir}/wrong-result.png` });
  await backToRoom(page);
  expect(await guard(page)).toMatchObject({ blocking: true });

  const door = townCenter.doors.find((d) => d.label === 'THE ICEBOX')!;
  await clickStagePoint(page, {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  });
  await expect(page.locator('.npc-dialog')).toBeVisible({ timeout: WALK_TIMEOUT });
  expect((await debugInfo(page))?.roomId).toBe('town-center');
  expect((await debugInfo(page))?.doorReachedLog ?? []).not.toContain('THE ICEBOX');
  await page.keyboard.press('Escape');
  await expect(page.locator('.npc-dialog')).toBeHidden();

  // Correct: +10 Tokens, and the door works.
  await openQuestion(page, townCenter);
  await answer(page, true);
  await expect(page.locator('.phishing-quiz__explain')).toHaveText(/^Correct\. /);
  await expect(page.locator('.hud__tokens-value')).toHaveText('10');
  await page.screenshot({ path: `${dir}/correct-explanation.png` });
  await continueToResult(page);
  await expect(page.locator('.phishing-quiz__done-kicker')).toHaveText('DOOR UNLOCKED');
  await expect(page.locator('.phishing-quiz__result-tokens')).toHaveText('+10');
  await page.screenshot({ path: `${dir}/correct-result.png` });
  await backToRoom(page);
  await expect.poll(() => guard(page)).toMatchObject({ blocking: false });

  await clickStagePoint(page, await doorPointClearOfAnthony(page, 'THE ICEBOX'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('the-icebox');
  await waitForElevatorHidden(page);

  expect(errors).toEqual([]);
});

test('5 Map bypasses lock the Map and show the banner; 3 correct training answers unlock it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dir = proofDir('lockout');
  const errors = collectErrors(page);
  await boot(page, TOWN_CENTER_ICEBOX);
  await expect.poll(() => guard(page)).toMatchObject({ doorLabel: 'THE ICEBOX', blocking: true });

  // Challenged and not passed: a wrong answer.
  await openQuestion(page, townCenter);
  await answer(page, false);
  await continueToResult(page);
  await backToRoom(page);

  for (let bypass = 1; bypass <= 5; bypass += 1) {
    await page.locator('.hud__button--map').click();
    await expect(page.locator('.map-screen')).toBeVisible();
    await page.locator('[data-map-room="dev-pit"]').click();
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe('dev-pit');
    await waitForElevatorHidden(page);
    if (bypass < 5) await changeRoom(page, 'town-center');
  }

  const map = page.locator('.hud__button--map');
  await expect(map).toHaveAttribute('aria-disabled', 'true');
  const banner = page.locator('.security-training-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.security-training-banner__title')).toHaveText(
    'Security Training is Required!',
  );
  await expect(banner.locator('.security-training-banner__progress')).toHaveText(
    'SECURITY TRAINING · 0 / 3',
  );
  await expect.poll(() => guard(page)).toMatchObject({ npcId: 'anthony', doorLabel: null });
  await page.screenshot({ path: `${dir}/lockout-banner.png` });

  // Playwright treats `aria-disabled` as not clickable; a real click still lands.
  await map.dispatchEvent('click');
  await expect(page.locator('.map-screen')).toBeHidden();
  await expect(page.locator('.hud__toast')).toHaveText(
    'Security Training is Required! Answer 3 of Anthony’s questions.',
  );

  for (let done = 1; done <= 3; done += 1) {
    await openQuestion(page, devPit);
    await answer(page, true);
    await continueToResult(page);
    await expect(page.locator('.phishing-quiz__done-kicker')).toHaveText(
      done < 3 ? `SECURITY TRAINING · ${done} / 3` : 'SECURITY TRAINING COMPLETE · MAP UNLOCKED',
    );
    await page.screenshot({ path: `${dir}/training-${done}-of-3.png` });
    await backToRoom(page);
    if (done < 3) {
      await expect(banner.locator('.security-training-banner__progress')).toHaveText(
        `SECURITY TRAINING · ${done} / 3`,
      );
      await page.screenshot({ path: `${dir}/training-progress-${done}.png` });
    }
  }

  await expect(banner).toBeHidden();
  await expect(map).not.toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => guard(page)).toBeNull();
  await map.click();
  await expect(page.locator('.map-screen')).toBeVisible();

  expect(errors).toEqual([]);
});
