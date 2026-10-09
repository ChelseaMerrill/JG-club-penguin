/**
 * Runs against the real shared Supabase project (#81), the same two shared
 * test users every other `*-two-browsers.spec.ts` uses. See "Running the
 * two-browser e2e specs" in the README.
 *
 * #140's "pair-with-jger" step is genuinely Presence-driven here (unlike
 * `e2e/quest-pair-flaky-test.spec.ts`'s solo path, which advances a test
 * clock against Paul's own static tile): both Players enter The Icebox at
 * its shared `spawnTile`, so they start at distance 0 of each other, then
 * each page's own pairing tick (fed by the real Room channel's Presence
 * positions, `RoomScene.remotePenguinTiles()`) detects the other and marks
 * the step once 10 continuous seconds have elapsed (sped up with
 * `__questsTest.advanceClock`, same as the solo spec, once Presence has had
 * time to actually propagate the other's tile). Reading the step back
 * through `__questsTest.pairFlakyTestSteps()` -- not a step toast -- is
 * deliberate: this is a shared, persistent real-account test user, so an
 * earlier run may already have `pair-with-jger` set, and a toast fires only
 * on a transition.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hasTestUsers, passwordSessionState } from './support/password-session';
import { assertTestUsersAbsent, playerIdFromStorageState } from './support/presence-guard';
import {
  completeCreatorIfShown,
  readOwnPlayerId,
  waitUntilJoined,
} from './support/two-browser-session';
import type { QuestsTestHandle } from '../src/quests/quests-test-handle';

declare global {
  interface Window {
    __questsTest?: QuestsTestHandle;
  }
}

const AUTH_STATE_A = process.env.AUTH_STATE_A;
const AUTH_STATE_B = process.env.AUTH_STATE_B;

const OUTPUT_DIR = 'test-results/quest-pair-two-browsers';
const VIDEO_DIR = 'playwright-output/quest-pair-videos';
/** Supabase Realtime Presence propagation budget (`presence-two-browsers.spec.ts`'s own figure). */
const PROPAGATION_TIMEOUT = 5000;

/** The Room `RoomScene` is showing, via the `VITE_E2E_HOOKS` `window.__roomDebug` hook. */
async function shownRoom(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as unknown as { __roomDebug?: { roomId: string } }).__roomDebug?.roomId,
  );
}

async function pairSteps(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__questsTest!.pairFlakyTestSteps());
}

test('quest-pair-two-browsers', async ({ browser, baseURL }) => {
  // Entering The Icebox, waiting out Presence propagation, and polling the
  // pairing step on both pages.
  test.setTimeout(90_000);
  const haveStateFiles = Boolean(AUTH_STATE_A && AUTH_STATE_B);
  test.skip(
    !haveStateFiles && !hasTestUsers('A', 'B'),
    'requires E2E_USER_A/B credentials in .env.test.local, or AUTH_STATE_A and AUTH_STATE_B',
  );
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const stateA = haveStateFiles ? AUTH_STATE_A : await passwordSessionState('A', origin);
  const stateB = haveStateFiles ? AUTH_STATE_B : await passwordSessionState('B', origin);

  // #81: fail fast if another run is still using this pair of test users in
  // Town Center, before opening any browser context.
  await assertTestUsersAbsent([
    { label: 'A', playerId: playerIdFromStorageState(stateA) },
    { label: 'B', playerId: playerIdFromStorageState(stateB) },
  ]);

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  const contextA = await browser.newContext({
    storageState: stateA,
    recordVideo: { dir: VIDEO_DIR },
  });
  const contextB = await browser.newContext({
    storageState: stateB,
    recordVideo: { dir: VIDEO_DIR },
  });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto('/?debug&masknames&hud');
    await pageB.goto('/?debug&masknames&hud');

    await completeCreatorIfShown(pageA, 'Penguin A');
    await completeCreatorIfShown(pageB, 'Penguin B');

    await waitUntilJoined(pageA);
    await waitUntilJoined(pageB);

    const idA = await readOwnPlayerId(pageA);
    const idB = await readOwnPlayerId(pageB);

    // Both enter The Icebox: its `spawnTile` is shared, so they start at
    // distance 0 of each other.
    await pageA.click('button[data-room="the-icebox"]');
    await pageB.click('button[data-room="the-icebox"]');
    await expect.poll(() => shownRoom(pageA)).toBe('the-icebox');
    await expect.poll(() => shownRoom(pageB)).toBe('the-icebox');

    const rosterOnA = (playerId: string) => pageA.locator(`li[data-player-id="${playerId}"]`);
    const rosterOnB = (playerId: string) => pageB.locator(`li[data-player-id="${playerId}"]`);
    // Presence propagation: each page's roster (and so its
    // `remotePenguinTiles()`) sees the other before the pairing clock is
    // advanced, so the detection itself is proven real, not raced.
    await expect(rosterOnA(idB)).toHaveCount(1, { timeout: PROPAGATION_TIMEOUT });
    await expect(rosterOnB(idA)).toHaveCount(1, { timeout: PROPAGATION_TIMEOUT });

    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'both-in-the-icebox-a.png') });
    await pageB.screenshot({ path: path.join(OUTPUT_DIR, 'both-in-the-icebox-b.png') });

    // Let one real pairing tick (500ms) register proximity on each page
    // before advancing its own clock 10 s.
    await pageA.waitForTimeout(600);
    await pageA.evaluate(() => window.__questsTest!.advanceClock(10_000));
    await pageB.evaluate(() => window.__questsTest!.advanceClock(10_000));

    await expect.poll(async () => (await pairSteps(pageA))['pair-with-jger']).toBe(true);
    await expect.poll(async () => (await pairSteps(pageB))['pair-with-jger']).toBe(true);
  } finally {
    await pageA.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png') }).catch(() => {});

    await contextA.close();
    await contextB.close();

    await pageA.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-a.webm'));
    await pageB.video()?.saveAs(path.join(OUTPUT_DIR, 'browser-b.webm'));
  }
});
