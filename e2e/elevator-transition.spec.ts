import { expect, test, type Page } from '@playwright/test';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
/**
 * The Elevator's own real `minDurationMs` (1200ms, `elevator-screen.ts`)
 * minus generous CI-jitter slack -- not a fixed wait, just the threshold the
 * observed show->hide duration must clear (#52 AC).
 */
const MIN_ELEVATOR_DURATION_MS = 1150;

interface ElevatorLogEntry {
  type: 'show' | 'hide';
  at: number;
  /** `__roomDebug.roomId` at the moment this DOM mutation was observed. */
  roomId?: string;
}

declare global {
  interface Window {
    __elevatorLog?: ElevatorLogEntry[];
  }
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

/** `window.__roomDebug`, deep-cloned across the page boundary (functions never survive this). */
async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

/** Waits for `__roomDebug.localPenguin` to appear after `page.goto`. */
async function waitForBoot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
    .not.toBeUndefined();
}

/** Converts a Stage pixel point (1600x900 logical) to a page click point via the canvas's own bounding box. */
async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const scaleX = canvasBox.width / GAME_WIDTH;
  const scaleY = canvasBox.height / GAME_HEIGHT;
  await page.mouse.click(canvasBox.x + point.x * scaleX, canvasBox.y + point.y * scaleY);
}

function doorCenter(door: { hotspot: { x: number; y: number; width: number; height: number } }): {
  x: number;
  y: number;
} {
  return {
    x: door.hotspot.x + door.hotspot.width / 2,
    y: door.hotspot.y + door.hotspot.height / 2,
  };
}

/**
 * Watches `.elevator-screen`'s own `hidden` attribute (a `MutationObserver`,
 * not a poll) and records every show/hide transition into
 * `window.__elevatorLog`, each entry timestamped with `performance.now()`
 * and the `__roomDebug.roomId` current at that exact moment -- lets the test
 * assert both the show->hide *duration* and that the Room had already
 * switched (`room:enter` not delayed by the overlay, #52 D4) before the
 * overlay actually hides.
 */
async function installElevatorObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: { type: 'show' | 'hide'; at: number; roomId?: string }[] = [];
    window.__elevatorLog = log;
    const overlay = document.querySelector<HTMLElement>('.elevator-screen');
    if (!overlay) throw new Error('.elevator-screen not found in the DOM');
    let lastHidden = overlay.hidden;
    const observer = new MutationObserver(() => {
      const hidden = overlay.hidden;
      if (hidden === lastHidden) return;
      lastHidden = hidden;
      log.push({
        type: hidden ? 'hide' : 'show',
        at: performance.now(),
        roomId: window.__roomDebug?.roomId,
      });
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
  });
}

async function elevatorLog(page: Page): Promise<ElevatorLogEntry[]> {
  return page.evaluate(() => window.__elevatorLog ?? []);
}

/** The progress bar's own computed width against its track's, in CSS pixels. */
async function progressBarMetrics(page: Page): Promise<{ barWidth: number; trackWidth: number }> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('.elevator-screen__progress');
    const bar = document.querySelector<HTMLElement>('.elevator-screen__progress-bar');
    if (!track || !bar) throw new Error('.elevator-screen__progress(-bar) not found in the DOM');
    return {
      barWidth: bar.getBoundingClientRect().width,
      trackWidth: track.getBoundingClientRect().width,
    };
  });
}

test('Elevator shows crossing Town Center -> Roof Deck via the door, hides once Roof Deck is ready (#52)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await installElevatorObserver(page);

  const elevatorDoor = townCenter.doors.find((door) => door.label === 'ELEVATOR · ROOF DECK');
  if (!elevatorDoor) throw new Error('expected town-center to have an ELEVATOR · ROOF DECK door');

  const clickPoint = doorCenter(elevatorDoor);
  await clickStagePoint(page, clickPoint);
  await expect(page.locator('.elevator-screen')).toBeVisible({ timeout: WALK_TIMEOUT });

  // A door click while the overlay is up (it swallows clicks, D6) must not
  // start a second transition. Checked and clicked in a single `evaluate`
  // round-trip (rather than a separate assertion followed by a separate
  // `page.mouse.click`), so there's no gap in which the overlay's own
  // `minDurationMs` could elapse between confirming the click point resolves
  // to the overlay and actually clicking it -- both happen in the same
  // browser-side tick, at the point the door itself sits at.
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  const pagePoint = {
    x: canvasBox.x + clickPoint.x * (canvasBox.width / GAME_WIDTH),
    y: canvasBox.y + clickPoint.y * (canvasBox.height / GAME_HEIGHT),
  };
  const hitOverlay = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    const overlayHit = target?.closest('.elevator-screen') != null;
    const opts: PointerEventInit = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    target?.dispatchEvent(new PointerEvent('pointerdown', opts));
    target?.dispatchEvent(new PointerEvent('pointerup', opts));
    target?.dispatchEvent(new MouseEvent('click', opts));
    return overlayHit;
  }, pagePoint);
  expect(hitOverlay).toBe(true);

  await page.screenshot({ path: 'test-results/elevator-transition/elevator.png' });

  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: WALK_TIMEOUT });
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('roof-deck');

  // The swallowed click must not have started a second transition/walk: the
  // local Penguin's tile is still exactly the door's own entry tile into the
  // Roof Deck, never having moved from it.
  expect((await debugInfo(page))?.localPenguin?.tile).toEqual(elevatorDoor.entryTile);

  const log = await elevatorLog(page);
  expect(log.map((entry) => entry.type)).toEqual(['show', 'hide']);
  // The Room had already switched by the time the overlay actually hid
  // (`room:enter` is not delayed by it, #52 D4).
  expect(log[1]?.roomId).toBe('roof-deck');
  expect(log[1]!.at - log[0]!.at).toBeGreaterThanOrEqual(MIN_ELEVATOR_DURATION_MS);

  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'roof-deck' },
  ]);

  expect(errors).toEqual([]);
});

test('the progress bar fills gradually over the ride rather than showing full instantly (#52 review MAJOR)', async ({
  page,
}) => {
  test.setTimeout(30_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
  await expect(page.locator('.elevator-screen')).toBeVisible({ timeout: WALK_TIMEOUT });

  // ~300ms into the 1.2s minimum ride: the bar must still be filling, not
  // already full (the MAJOR bug: a `width` transition never runs while the
  // overlay is `display: none`, so it used to jump straight to 100%).
  await page.waitForTimeout(300);
  const midRide = await progressBarMetrics(page);
  expect(midRide.barWidth).toBeLessThan(midRide.trackWidth * 0.75);
  await page.screenshot({ path: 'test-results/elevator-transition/mid-ride.png' });

  // ~1150ms in, near the end of the 1.2s minimum: the bar is (near) full.
  await page.waitForTimeout(850);
  const nearEnd = await progressBarMetrics(page);
  expect(nearEnd.barWidth).toBeGreaterThanOrEqual(nearEnd.trackWidth * 0.95);

  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: WALK_TIMEOUT });
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('roof-deck');

  expect(errors).toEqual([]);
});

test('Elevator shows crossing Town Center -> Roof Deck via __roomDebug.changeRoom (#52)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
  await installElevatorObserver(page);

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));

  await expect(page.locator('.elevator-screen')).toBeVisible();
  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: WALK_TIMEOUT });
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('roof-deck');

  const log = await elevatorLog(page);
  expect(log.map((entry) => entry.type)).toEqual(['show', 'hide']);
  expect(log[1]?.roomId).toBe('roof-deck');
  expect(log[1]!.at - log[0]!.at).toBeGreaterThanOrEqual(MIN_ELEVATOR_DURATION_MS);

  expect((await debugInfo(page))?.roomEventLog).toEqual([
    { type: 'room:enter', roomId: 'town-center' },
    { type: 'room:leave', roomId: 'town-center' },
    { type: 'room:enter', roomId: 'roof-deck' },
  ]);

  expect(errors).toEqual([]);
});

test('same-floor changes never show the Elevator (Town Center -> Dev Pit -> Town Center) (#52)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await installElevatorObserver(page);

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('dev-pit'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('dev-pit');

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('town-center'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('town-center');

  expect(await elevatorLog(page)).toEqual([]);
  await expect(page.locator('.elevator-screen')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the Igloo never shows the Elevator (Town Center -> Igloo) (#52)', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/?asPlayer');
  await waitForBoot(page);
  await installElevatorObserver(page);

  await page.evaluate(() => window.__roomDebug?.changeRoom?.('igloo'));
  await expect
    .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
    .toBe('igloo');

  expect(await elevatorLog(page)).toEqual([]);
  await expect(page.locator('.elevator-screen')).toBeHidden();

  expect(errors).toEqual([]);
});
