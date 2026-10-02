import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_LOOK } from '../src/contracts';
import { penguinLookHash } from '../src/game/penguin/look-hash';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { freezeRideAt, rideFloors, waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 15_000;
/**
 * The Elevator's own real ride length for one floor crossed (1200ms,
 * `MS_PER_FLOOR` in `floors.ts`) minus generous CI-jitter slack -- not a fixed wait, just the threshold the
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
  // ride length could elapse between confirming the click point resolves
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

  // ~300ms into the 1.2s ride: the bar must still be filling, not
  // already full (the MAJOR bug: a `width` transition never runs while the
  // overlay is `display: none`, so it used to jump straight to 100%).
  await page.waitForTimeout(300);
  const midRide = await progressBarMetrics(page);
  expect(midRide.barWidth).toBeLessThan(midRide.trackWidth * 0.75);
  await page.screenshot({ path: 'test-results/elevator-transition/mid-ride.png' });

  // ~1150ms in, near the end of the 1.2s ride: the bar is (near) full.
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

// ---------------------------------------------------------------------------
// #163: the design's scenery, the ride length and the one-clock ride display.
// ---------------------------------------------------------------------------

/** 1618x918 gives the Stage its exact 1600x900 (the ring sits outside it), so evidence is 1:1 with the design. */
const STAGE_VIEWPORT = { width: GAME_WIDTH + 18, height: GAME_HEIGHT + 18 };
const EVIDENCE_DIR = 'test-results/elevator-transition';
/** The design's own mid-ride sample: 3.84s into L -> 5 (`PASSING FLOOR 3 ... 64%`). */
const MID_RIDE_MS = 3840;

/** The `.elevator-screen`'s box must be the Stage's own 1600x900 for 1:1 evidence. */
async function expectStageSized(page: Page): Promise<void> {
  const box = await page.locator('.elevator-screen').boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(GAME_WIDTH);
  expect(Math.round(box?.height ?? 0)).toBe(GAME_HEIGHT);
}

async function chipBackground(page: Page, floor: string): Promise<string> {
  return page.evaluate((id) => {
    const chip = [...document.querySelectorAll<HTMLElement>('.elevator-screen__floor')].find(
      (node) => node.textContent === id,
    );
    if (!chip) throw new Error(`floor chip ${id} not found`);
    return getComputedStyle(chip).backgroundColor;
  }, floor);
}

/** Loads the faces the Elevator draws with (the fonts are lazy), resolving true once every one is in. */
async function loadElevatorFonts(): Promise<boolean> {
  const faces = ['400 22px "Anton"', '700 15px "Libre Franklin"', '44px "Bumbastika"'];
  const loaded = await Promise.all(faces.map((face) => document.fonts.load(face)));
  await document.fonts.ready;
  return loaded.every((list) => list.length > 0);
}

async function bootAsPlayer(page: Page, query = '?asPlayer'): Promise<void> {
  await page.goto(`/${query}`);
  await waitForBoot(page);
  await expect.poll(async () => (await debugInfo(page))?.roomId).toBe('town-center');
}

test.describe('ride length (#163)', () => {
  test('an L -> 5 ride lasts about 6s (1.2s for each of five floors)', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    await installElevatorObserver(page);
    await rideFloors(page, 'L', '5');
    await expect(page.locator('.elevator-screen')).toBeVisible();
    await waitForElevatorHidden(page);

    const log = await elevatorLog(page);
    expect(log.map((entry) => entry.type)).toEqual(['show', 'hide']);
    const duration = log[1]!.at - log[0]!.at;
    expect(duration).toBeGreaterThanOrEqual(5950);
    expect(duration).toBeLessThan(9000);

    expect(errors).toEqual([]);
  });

  test('the real Town Center -> Roof Deck door ride still lasts 1.2s, not longer', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    await installElevatorObserver(page);
    await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
    await waitForElevatorHidden(page);

    const log = await elevatorLog(page);
    expect(log.map((entry) => entry.type)).toEqual(['show', 'hide']);
    const duration = log[1]!.at - log[0]!.at;
    expect(duration).toBeGreaterThanOrEqual(MIN_ELEVATOR_DURATION_MS);
    expect(duration).toBeLessThan(3000);

    expect(errors).toEqual([]);
  });
});

test.describe('the ride display (#163)', () => {
  test.use({ viewport: STAGE_VIEWPORT });

  test('floors 1-4 flash in turn as the car passes them (L -> 5)', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    await rideFloors(page, 'L', '5');
    await expect(page.locator('.elevator-screen')).toBeVisible();

    for (let k = 0; k < 4; k++) {
      await freezeRideAt(page, k * 1200 + 660);
      for (let floor = 1; floor <= 4; floor++) {
        expect(await chipBackground(page, String(floor))).toBe(
          floor === k + 1 ? 'rgb(242, 193, 46)' : 'rgba(0, 0, 0, 0)',
        );
      }
    }

    expect(errors).toEqual([]);
  });

  test('the indicator, status and bar read one clock mid-ride (the design sample, 3.84s)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    await rideFloors(page, 'L', '5');
    await freezeRideAt(page, MID_RIDE_MS);

    const screen = page.locator('.elevator-screen');
    await expect(screen.locator('.elevator-screen__going')).toHaveText('GOING UP');
    await expect(screen.locator('.elevator-screen__arrow')).toHaveText('▲ 3');
    await expect(screen.locator('.elevator-screen__next')).toHaveText('NEXT · 5');
    await expect(screen.locator('.elevator-screen__status')).toHaveText(
      'PASSING FLOOR 3 · POLISHING THE ICE… 64%',
    );
    const { barWidth, trackWidth } = await progressBarMetrics(page);
    expect(Math.abs((barWidth / trackWidth) * 100 - 64)).toBeLessThanOrEqual(1.5);
    await expect(screen.locator('.elevator-screen__hex--lit')).toHaveText('3');

    await freezeRideAt(page, 6000);
    await expect(screen.locator('.elevator-screen__arrow')).toHaveText('▲ 5');
    await expect(screen.locator('.elevator-screen__status')).toHaveText(
      'PASSING FLOOR 5 · POLISHING THE ICE… 100%',
    );
    const end = await progressBarMetrics(page);
    expect(end.barWidth).toBeGreaterThanOrEqual(end.trackWidth * 0.99);
    await page.screenshot({ path: `${EVIDENCE_DIR}/arrival.png` });

    expect(errors).toEqual([]);
  });

  test('going down reverses the arrow, the GOING text and the shaft lights (real Roof Deck -> The Melt)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    const shaftDirection = (): Promise<string> =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.elevator-screen__shaft-lights')!)
            .animationDirection,
      );

    await page.evaluate(() => window.__roomDebug?.changeRoom?.('roof-deck'));
    await expect(page.locator('.elevator-screen')).toBeVisible();
    await expect(page.locator('.elevator-screen__going')).toHaveText('GOING UP');
    expect(await shaftDirection()).toBe('normal');
    await waitForElevatorHidden(page);

    await page.evaluate(() => window.__roomDebug?.changeRoom?.('the-melt'));
    await expect(page.locator('.elevator-screen')).toBeVisible();
    await expect(page.locator('.elevator-screen__going')).toHaveText('GOING DOWN');
    await expect(page.locator('.elevator-screen__arrow')).toHaveText('▼ R');
    expect(await shaftDirection()).toBe('reverse');
    await page.screenshot({ path: `${EVIDENCE_DIR}/going-down.png` });
    await waitForElevatorHidden(page);

    expect(errors).toEqual([]);
  });

  test('the Penguin shows the Player Look and Penguin Creator name, never "You" (?asPlayer=Pebble)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await bootAsPlayer(page, '?asPlayer=Pebble');
    await rideFloors(page, 'L', '5');
    await freezeRideAt(page, MID_RIDE_MS);

    const screen = page.locator('.elevator-screen');
    await expect(screen.locator('.elevator-screen__name-tag')).toHaveText('Pebble');
    await expect(screen.getByText('You', { exact: true })).toHaveCount(0);
    await expect(screen.locator('.elevator-screen__penguin-art')).toHaveAttribute(
      'data-look-hash',
      penguinLookHash({ ...DEFAULT_LOOK, name: 'Pebble' }),
    );
    await screen.locator('.elevator-screen__penguin').screenshot({
      path: `${EVIDENCE_DIR}/name-tag.png`,
    });

    expect(errors).toEqual([]);
  });

  test('a bare ?asPlayer Penguin is unnamed, so no tag shows', async ({ page }) => {
    const errors = collectErrors(page);

    await bootAsPlayer(page);
    await rideFloors(page, 'L', '5');
    await freezeRideAt(page, MID_RIDE_MS);

    await expect(page.locator('.elevator-screen__name-tag')).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('reduced motion shows the arrival state at once, with no animations, for the full ride', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootAsPlayer(page, '?asPlayer=Pebble');
    await page.evaluate(() => {
      (window as Window & { __rideStart?: number }).__rideStart = performance.now();
    });
    await rideFloors(page, 'L', '5');

    const screen = page.locator('.elevator-screen');
    await expect(screen).toBeVisible();
    await expect(screen.locator('.elevator-screen__arrow')).toHaveText('▲ 5');
    await expect(screen.locator('.elevator-screen__status')).toHaveText(
      'PASSING FLOOR 5 · POLISHING THE ICE… 100%',
    );
    const { barWidth, trackWidth } = await progressBarMetrics(page);
    expect(barWidth).toBeGreaterThanOrEqual(trackWidth * 0.99);
    expect(
      await page.evaluate(
        () => document.querySelector('.elevator-screen')!.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await page.screenshot({ path: `${EVIDENCE_DIR}/reduced-motion.png` });

    // The ride's length is unchanged: still up at ~5s, gone by ~6.5s.
    await page.waitForFunction(
      () => performance.now() - (window as Window & { __rideStart?: number }).__rideStart! > 5000,
    );
    await expect(screen).toBeVisible();
    await expect(screen).toBeHidden({ timeout: 3000 });
    const elapsed = await page.evaluate(
      () => performance.now() - (window as Window & { __rideStart?: number }).__rideStart!,
    );
    expect(elapsed).toBeLessThan(8000);

    expect(errors).toEqual([]);
  });
});

test.describe('evidence (#163, local only, never committed)', () => {
  test.use({ viewport: STAGE_VIEWPORT });

  test('side by side with the design, mid-ride going up to 5 (3.84s)', async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);

    // The game, frozen at the design's own sample instant.
    await bootAsPlayer(page, '?asPlayer=Pebble');
    await rideFloors(page, 'L', '5');
    await freezeRideAt(page, MID_RIDE_MS);
    await expectStageSized(page);
    await page.evaluate(loadElevatorFonts);
    const game = await page
      .locator('.elevator-screen')
      .screenshot({ path: `${EVIDENCE_DIR}/game-mid-ride-up-to-5.png` });

    // The design file, with every animation seeked to the same instant.
    const designPage = await browser.newPage({ viewport: STAGE_VIEWPORT });
    try {
      await designPage.goto(pathToFileURL(path.resolve('design/Elevator.dc.html')).href);
      const label = designPage.locator('[data-screen-label="ELEVATOR (LOADING SCREEN)"]');
      await label.waitFor();
      const fontsLoaded = await designPage.evaluate(loadElevatorFonts);
      test.skip(
        !fontsLoaded,
        'BLOCKED: the design page needs Anton and Libre Franklin from Google Fonts (network blocked?)',
      );
      await designPage.evaluate((ms) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = ms;
        }
      }, MID_RIDE_MS);
      const design = await label.screenshot({
        path: `${EVIDENCE_DIR}/design-mid-ride-up-to-5.png`,
      });

      const composer = await browser.newPage({
        viewport: { width: GAME_WIDTH * 2, height: GAME_HEIGHT },
      });
      try {
        const src = (buffer: Buffer): string =>
          `data:image/png;base64,${buffer.toString('base64')}`;
        await composer.setContent(
          `<body style="margin:0;background:#000;display:flex"><img src="${src(design)}" width="1600" height="900"><img src="${src(game)}" width="1600" height="900"></body>`,
        );
        await composer.screenshot({ path: `${EVIDENCE_DIR}/side-by-side-mid-ride-up-to-5.png` });
      } finally {
        await composer.close();
      }
    } finally {
      await designPage.close();
    }

    expect(errors).toEqual([]);
  });

  test('records a multi-floor ride there and back (video)', async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      viewport: STAGE_VIEWPORT,
      recordVideo: { dir: testInfo.outputPath('video'), size: STAGE_VIEWPORT },
    });
    const page = await context.newPage();
    const video = page.video();
    try {
      await bootAsPlayer(page, '?asPlayer=Pebble');
      await rideFloors(page, 'L', '5');
      await expect(page.locator('.elevator-screen')).toBeVisible();
      await waitForElevatorHidden(page);
      await rideFloors(page, '5', 'L');
      await expect(page.locator('.elevator-screen')).toBeVisible();
      await waitForElevatorHidden(page);
    } finally {
      await context.close();
    }
    await video?.saveAs(`${EVIDENCE_DIR}/ride-l-to-5-and-back.webm`);
  });
});
