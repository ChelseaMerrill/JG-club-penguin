import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Tile } from '../src/contracts';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import { tileToScreen } from '../src/game/rooms/iso';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import type { LocalPenguinDebugInfo, RoomDebugInfo } from './support/room-debug-types';

/**
 * The Player Penguin's body motion: the figure tilts, lifts and (idle
 * WADDLE only) sways side to side between its poses, instead of snapping
 * between two baked frames. Evidence (sample logs, screenshots and one video)
 * goes under `test-results/penguin-tween-*` and `test-results/penguin-waddle-tween/`,
 * one directory per test, replaced on every run and never committed.
 */

const BOOT_TIMEOUT = 15_000;
const LONG_WALK_TIMEOUT = 15_000;
/** Samples start this long after the idle Penguin appears, past the body motion's lead-in. */
const LEAD_IN_MS = 700;
/** Slightly more than one 2.4 s WADDLE cycle. */
const WADDLE_SAMPLE_MS = 2_600;
const SAMPLE_EVERY_MS = 80;
/** WADDLE's sideways sway at Room scale: the design's 26 px x (120 / 340) x 0.58. */
const MAX_SWAY_PX = 5.322;
/** WADDLE's lift at Room scale: the design's 6 px x (120 / 340) x 0.58. */
const MAX_LIFT_PX = 1.228;
/** WALK's blend-in from the idle pose: one 300 ms WALK segment. */
const WALK_BLEND_MS = 300;
/**
 * The most the figure may tilt (deg) or sway (px) between two consecutive
 * per-frame samples across the walk-start and arrival transitions: a snap
 * to or from neutral jumps several degrees at once.
 */
const MAX_TRANSITION_STEP = 1.5;
/** How long after the walk starts, and around the arrival, the transition checks look. */
const TRANSITION_WINDOW_MS = 700;
/** A far, reachable Town Center Tile whose path from spawn includes left-facing steps. */
const FAR_TILE: Tile = { col: 2, row: 2 };

test.use({ viewport: { width: 1600, height: 900 } });

function proofDir(name: string): string {
  const dir = `test-results/${name}`;
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

async function clickTile(page: Page, tile: Tile): Promise<void> {
  const point = tileToScreen(tile, townCenter.grid.origin);
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  await page.mouse.click(
    box.x + (point.x * box.width) / GAME_WIDTH,
    box.y + (point.y * box.height) / GAME_HEIGHT,
  );
}

/** Boots Town Center signed out (DEFAULT_LOOK: WADDLE, facing right) and waits for a decoded frame. */
async function bootTownCenter(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.textureKey, { timeout: BOOT_TIMEOUT })
    .toMatch(/^penguin:/);
  return errors;
}

type Sample = Pick<
  LocalPenguinDebugInfo,
  | 'tile'
  | 'anim'
  | 'moving'
  | 'flipX'
  | 'textureKey'
  | 'spriteAngle'
  | 'spriteX'
  | 'spriteY'
  | 'bodyTweenCount'
  | 'containerX'
  | 'containerY'
  | 'nameTagY'
> & { t: number };

/**
 * Samples `__roomDebug.localPenguin` inside the page every `everyMs` (or, with
 * `'frame'`, on every animation frame) for `durationMs`, or, with
 * `untilArrived`, until the Penguin has started moving and then stopped for
 * `settleMs`.
 */
async function sampleLocalPenguin(
  page: Page,
  options: {
    durationMs: number;
    everyMs: number | 'frame';
    untilArrived?: boolean;
    settleMs?: number;
  },
): Promise<Sample[]> {
  return page.evaluate(
    ({ durationMs, everyMs, untilArrived, settleMs }) =>
      new Promise<Sample[]>((resolve) => {
        const samples: Sample[] = [];
        const start = performance.now();
        let sawMoving = false;
        let stoppedAt: number | null = null;
        let finished = false;
        const sample = (): void => {
          const p = window.__roomDebug?.localPenguin;
          const t = performance.now() - start;
          if (p) {
            samples.push({
              t,
              tile: p.tile,
              anim: p.anim,
              moving: p.moving,
              flipX: p.flipX,
              textureKey: p.textureKey,
              spriteAngle: p.spriteAngle,
              spriteX: p.spriteX,
              spriteY: p.spriteY,
              bodyTweenCount: p.bodyTweenCount,
              containerX: p.containerX,
              containerY: p.containerY,
              nameTagY: p.nameTagY,
            });
            if (p.moving) sawMoving = true;
            if (untilArrived && sawMoving && !p.moving && stoppedAt === null) stoppedAt = t;
          }
          const done = untilArrived
            ? stoppedAt !== null && t - stoppedAt >= (settleMs ?? 0)
            : t >= durationMs;
          if (done || t >= durationMs) {
            finished = true;
            if (timer !== undefined) clearInterval(timer);
            resolve(samples);
          }
        };
        const onFrame = (): void => {
          sample();
          if (!finished) requestAnimationFrame(onFrame);
        };
        const timer = everyMs === 'frame' ? undefined : setInterval(sample, everyMs);
        if (everyMs === 'frame') requestAnimationFrame(onFrame);
      }),
    options,
  );
}

test('WADDLE glides through intermediate tilts and sways side to side, on its Tile', async ({
  page,
}) => {
  const dir = proofDir('penguin-tween-waddle');
  const errors = await bootTownCenter(page);
  expect((await debugInfo(page))?.localPenguin?.anim).toBe('WADDLE');
  await page.waitForTimeout(LEAD_IN_MS);

  const samples = await sampleLocalPenguin(page, {
    durationMs: WADDLE_SAMPLE_MS,
    everyMs: SAMPLE_EVERY_MS,
  });
  writeFileSync(`${dir}/samples.json`, JSON.stringify(samples, null, 2));
  await page.screenshot({ path: `${dir}/idle.png` });

  expect(samples.length).toBeGreaterThan(20);
  const spawn = samples[0].tile;
  const { containerX, containerY, nameTagY } = samples[0];
  expect(typeof containerX).toBe('number');
  expect(typeof containerY).toBe('number');
  expect(typeof nameTagY).toBe('number');
  for (const s of samples) {
    expect(s.bodyTweenCount).toBe(1);
    expect(s.tile).toEqual(spawn);
    expect(s.textureKey).toMatch(/:neutral$/);
    // Only the figure moves: the Penguin's position and its name tag stay put.
    expect(s.containerX).toBe(containerX);
    expect(s.containerY).toBe(containerY);
    expect(s.nameTagY).toBe(nameTagY);
  }
  // Normalised for the left-facing mirror, so the ranges read as facing right.
  const angles = samples.map((s) => (s.flipX ? -1 : 1) * s.spriteAngle!);
  const xs = samples.map((s) => (s.flipX ? -1 : 1) * s.spriteX!);
  const ys = samples.map((s) => s.spriteY!);
  for (const a of angles) {
    expect(a).toBeGreaterThanOrEqual(-5.01);
    expect(a).toBeLessThanOrEqual(5.01);
  }
  const intermediate = new Set(angles.filter((a) => a > -4.9 && a < 4.9).map((a) => a.toFixed(2)));
  expect(intermediate.size).toBeGreaterThanOrEqual(3);
  expect(Math.min(...angles)).toBeLessThanOrEqual(-4);
  expect(Math.max(...angles)).toBeGreaterThanOrEqual(4);
  for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(MAX_SWAY_PX + 0.01);
  expect(Math.min(...xs)).toBeLessThanOrEqual(-4.5);
  expect(Math.max(...xs)).toBeGreaterThanOrEqual(4.5);
  for (const y of ys) {
    expect(y).toBeGreaterThanOrEqual(-MAX_LIFT_PX - 0.01);
    expect(y).toBeLessThanOrEqual(0.01);
  }
  expect(errors).toEqual([]);
});

test('WALK tilts step to step with no sideways drift, and settles back into WADDLE without a pop', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dir = proofDir('penguin-tween-walk');
  const errors = await bootTownCenter(page);
  await page.waitForTimeout(LEAD_IN_MS);

  // Every frame, so the transition checks below see each step the figure takes.
  const sampling = sampleLocalPenguin(page, {
    durationMs: LONG_WALK_TIMEOUT,
    everyMs: 'frame',
    untilArrived: true,
    settleMs: TRANSITION_WINDOW_MS,
  });
  await clickTile(page, FAR_TILE);
  const samples = await sampling;

  const startIndex = samples.findIndex((s) => s.moving);
  expect(startIndex).toBeGreaterThan(0);
  const startedAt = samples[startIndex].t;
  const stopIndex = samples.findIndex((s, i) => i > 0 && samples[i - 1].moving && !s.moving);
  expect(stopIndex).toBeGreaterThan(0);
  const stoppedAt = samples[stopIndex].t;

  // No snap into or out of the walk: the figure blends from wherever the
  // waddle left it into WALK, and from the last WALK pose back into WADDLE.
  // A facing change mirrors the figure on purpose, so a pair of samples
  // either side of a flip is skipped.
  function maxSteps(from: number, to: number): { angle: number; x: number; pairs: number } {
    let angle = 0;
    let x = 0;
    let pairs = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.t < from || a.t > to || a.flipX !== b.flipX) continue;
      angle = Math.max(angle, Math.abs(b.spriteAngle! - a.spriteAngle!));
      x = Math.max(x, Math.abs(b.spriteX! - a.spriteX!));
      pairs += 1;
    }
    return { angle, x, pairs };
  }
  const walkStart = maxSteps(samples[startIndex - 1].t, startedAt + TRANSITION_WINDOW_MS);
  const arrival = maxSteps(stoppedAt - TRANSITION_WINDOW_MS, stoppedAt + TRANSITION_WINDOW_MS);
  writeFileSync(`${dir}/samples.json`, JSON.stringify(samples, null, 2));
  writeFileSync(
    `${dir}/transitions.json`,
    JSON.stringify({ maxStep: MAX_TRANSITION_STEP, walkStart, arrival }, null, 2),
  );
  // The idle pose just before the walk is mid-sway, so blending from it is a real test.
  expect(Math.abs(samples[startIndex - 1].spriteAngle!)).toBeGreaterThan(0);
  for (const transition of [walkStart, arrival]) {
    expect(transition.pairs).toBeGreaterThan(10);
    expect(transition.angle).toBeLessThanOrEqual(MAX_TRANSITION_STEP);
    expect(transition.x).toBeLessThanOrEqual(MAX_TRANSITION_STEP);
  }

  const walking = samples.filter((s) => s.moving);
  expect(walking.length).toBeGreaterThan(10);
  for (const s of walking) {
    expect(s.anim).toBe('WALK');
    expect(s.bodyTweenCount).toBe(1);
    // The waddle's sway fades out over WALK's blend-in; WALK itself never sways.
    expect(Math.abs(s.spriteX!)).toBeLessThanOrEqual(MAX_SWAY_PX + 0.01);
    expect(Math.abs(s.spriteAngle!)).toBeLessThanOrEqual(5.01);
  }
  const blended = walking.filter((s) => s.t >= startedAt + WALK_BLEND_MS + 50);
  expect(blended.length).toBeGreaterThan(10);
  for (const s of blended) {
    expect(s.spriteX).toBe(0);
    expect(s.spriteAngle!).toBeGreaterThanOrEqual(-3.01);
    expect(s.spriteAngle!).toBeLessThanOrEqual(3.01);
  }
  const tilts = new Set(
    walking
      .map((s) => s.spriteAngle!)
      .filter((a) => a > -2.9 && a < 2.9 && a !== 0)
      .map((a) => a.toFixed(2)),
  );
  expect(tilts.size).toBeGreaterThanOrEqual(2);
  // The walk covered left-facing steps, and both WALK frames showed.
  expect(walking.some((s) => s.flipX)).toBe(true);
  expect(walking.some((s) => /:WALK:0(:left)?:neutral$/.test(s.textureKey ?? ''))).toBe(true);
  expect(walking.some((s) => /:WALK:1(:left)?:neutral$/.test(s.textureKey ?? ''))).toBe(true);

  const justArrived = samples.filter((s) => s.t >= stoppedAt && s.t <= stoppedAt + 100);
  expect(justArrived.length).toBeGreaterThan(0);
  for (const s of justArrived) {
    expect(s.anim).toBe('WADDLE');
    expect(s.bodyTweenCount).toBe(1);
    expect(Math.abs(s.spriteX!)).toBeLessThanOrEqual(1);
  }
  expect(samples.at(-1)?.tile).toEqual(FAR_TILE);
  expect(errors).toEqual([]);
});

test('reduced motion keeps the baked two-frame swap and no tween', async ({ page }) => {
  const dir = proofDir('penguin-tween-reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await bootTownCenter(page);

  const samples = await sampleLocalPenguin(page, {
    durationMs: WADDLE_SAMPLE_MS,
    everyMs: SAMPLE_EVERY_MS,
  });
  writeFileSync(`${dir}/samples.json`, JSON.stringify(samples, null, 2));
  await page.screenshot({ path: `${dir}/still.png` });

  for (const s of samples) {
    expect(s.spriteAngle).toBe(0);
    expect(s.spriteX).toBe(0);
    expect(s.spriteY).toBe(0);
    expect(s.bodyTweenCount).toBe(0);
    expect(s.textureKey).not.toMatch(/:neutral$/);
  }
  expect(samples.some((s) => /:WADDLE:0$/.test(s.textureKey ?? ''))).toBe(true);
  expect(samples.some((s) => /:WADDLE:1$/.test(s.textureKey ?? ''))).toBe(true);
  expect(errors).toEqual([]);
});

test('a Room restart or an anim switch never leaves a stray body tween', async ({ page }) => {
  test.setTimeout(60_000);
  const dir = proofDir('penguin-tween-restart');
  const errors = await bootTownCenter(page);
  const spawn = townCenter.spawnTile;

  const baselineListenerCount = (await debugInfo(page))?.textureListenerCount;
  expect(typeof baselineListenerCount).toBe('number');
  expect((await debugInfo(page))?.localPenguin?.bodyTweenCount).toBe(1);

  const afterRestarts: { restartCount?: number; bodyTweenCount?: number; penguinCount?: number }[] =
    [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = (await debugInfo(page))?.restartCount ?? 0;
    await page.evaluate(() => window.__roomDebug?.restartRoom?.());
    await expect
      .poll(async () => (await debugInfo(page))?.restartCount, { timeout: LONG_WALK_TIMEOUT })
      .toBeGreaterThan(before);
    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: LONG_WALK_TIMEOUT })
      .toEqual(spawn);
    const info = await debugInfo(page);
    afterRestarts.push({
      restartCount: info?.restartCount,
      bodyTweenCount: info?.localPenguin?.bodyTweenCount,
      penguinCount: info?.penguinCount,
    });
    expect(info?.localPenguin?.bodyTweenCount).toBe(1);
    expect(info?.penguinCount).toBe(1);
    expect(info?.textureListenerCount).toBe(baselineListenerCount);
  }

  // A short walk (WADDLE -> WALK -> WADDLE) keeps exactly one tween throughout.
  const target: Tile = { col: spawn.col, row: 5 };
  const sampling = sampleLocalPenguin(page, {
    durationMs: LONG_WALK_TIMEOUT,
    everyMs: 40,
    untilArrived: true,
    settleMs: 300,
  });
  await clickTile(page, target);
  const walk = await sampling;
  expect(walk.some((s) => s.moving)).toBe(true);
  for (const s of walk) expect(s.bodyTweenCount).toBe(1);

  writeFileSync(
    `${dir}/result.json`,
    JSON.stringify({ baselineListenerCount, afterRestarts, walkSamples: walk.length }, null, 2),
  );
  expect(errors).toEqual([]);
});

test('records a video of the waddle and a walk at Room scale', async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const dir = proofDir('penguin-waddle-tween');
  const size = { width: 1600, height: 900 };
  const context = await browser.newContext({ baseURL, viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  const errors = await bootTownCenter(page);
  await page.waitForTimeout(5_000);
  await clickTile(page, FAR_TILE);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { timeout: LONG_WALK_TIMEOUT })
    .toEqual(FAR_TILE);
  await page.waitForTimeout(2_000);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await video?.saveAs(`${dir}/waddle-walk.webm`);
  await video?.delete();
});
