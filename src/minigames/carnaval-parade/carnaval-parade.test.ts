// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameStatsMap } from '../../contracts';
import type { MinigameContext } from '../minigame';
import { createCarnavalParade } from './carnaval-parade';
import { createCarnavalParadeEngine, TICK_MS } from './carnaval-parade-engine';

/** `carnaval-parade.ts`'s own seam: the `Minigame` interface plus the DOM and
 *  keys it renders into the shell's play area. Drives a real engine (the
 *  default or an injected, seeded one) through faked timers, the same 16 ms
 *  tick the design uses; the engine's own rule values are
 *  `carnaval-parade-engine.test.ts`'s job. */
interface FakeContext extends MinigameContext<'carnaval-parade'> {
  scores: number[];
  stats: Array<Partial<MinigameStatsMap['carnaval-parade']>>;
  finishCalls: number;
}

function createFakeContext(): FakeContext {
  const ctx: FakeContext = {
    scores: [],
    stats: [],
    finishCalls: 0,
    setScore(score) {
      ctx.scores.push(score);
    },
    setStats(stats) {
      ctx.stats.push(stats);
    },
    finish() {
      ctx.finishCalls += 1;
    },
  };
  return ctx;
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function setup(engine = createCarnavalParadeEngine()) {
  const container = document.createElement('div');
  document.body.append(container);
  const ctx = createFakeContext();
  const game = createCarnavalParade({ engine });
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
  const qAll = (selector: string) => container.querySelectorAll(selector);
  return { container, ctx, game, engine, q, qAll };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCarnavalParade: the Minigame the shell drives', () => {
  it('is registered as carnaval-parade, 45 s, with the design’s own how-to copy', () => {
    const { game } = setup();

    expect(game.id).toBe('carnaval-parade');
    expect(game.title).toBe('CARNAVAL PARADE');
    expect(game.durationSec).toBe(45);
    expect(game.howToSubtitle).toBe('CARNAVAL PARADE · 45 SECONDS · SOLO');
    expect(game.howToPlay).toHaveLength(3);
    expect(game.howToPlay.join(' ')).toContain('multiplier up to x4');
    expect(game.statLabels).toEqual({
      feathers: 'FEATHERS',
      stars: 'STARS',
      barriersHit: 'BARRIERS',
    });
  });

  it('starts with 3 lit lives, streak 0 and multiplier x1, and reports the initial score/stats', () => {
    const { game, container, ctx } = setup();

    game.start(container, ctx);

    expect(container.querySelectorAll('.carnaval-parade__life--lit')).toHaveLength(3);
    expect(container.querySelector('.carnaval-parade__streak-value')?.textContent).toBe('0');
    expect(container.querySelector('.carnaval-parade__mult-value')?.textContent).toBe('x1');
    expect(ctx.scores.at(-1)).toBe(0);
    expect(ctx.stats.at(-1)).toMatchObject({ feathers: 0, stars: 0, barriersHit: 0 });
  });

  it('Up/Down and W/S move a lane; the on-screen buttons do too', () => {
    const engine = createCarnavalParadeEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);
    expect(engine.view.lane).toBe(1);

    press('ArrowUp');
    expect(engine.view.lane).toBe(0);
    press('ArrowDown');
    press('ArrowDown');
    expect(engine.view.lane).toBe(2);
    press('w');
    expect(engine.view.lane).toBe(1);
    press('S');
    expect(engine.view.lane).toBe(2);

    container.querySelector<HTMLButtonElement>('.carnaval-parade__lane-button--up')!.click();
    expect(engine.view.lane).toBe(1);
    container.querySelector<HTMLButtonElement>('.carnaval-parade__lane-button--down')!.click();
    container.querySelector<HTMLButtonElement>('.carnaval-parade__lane-button--down')!.click();
    expect(engine.view.lane).toBe(2);
  });

  it('ticks the engine every 16 ms while running, rendering a spawned item and reporting stats', () => {
    // jitter=0, lane=1 (the Penguin's own lane), r=0.6: a single feather.
    let i = 0;
    const script = [0, 0.5, 0.6];
    const engine = createCarnavalParadeEngine({ rng: () => script[i++ % script.length] });
    const { game, container, ctx } = setup(engine);

    game.start(container, ctx);
    // Enough ticks for the first spawn (~44) and its collision (~235 more).
    vi.advanceTimersByTime(400 * TICK_MS);

    expect(engine.view.score).toBeGreaterThan(0);
    expect(ctx.scores.at(-1)).toBe(engine.view.score);
    expect((ctx.stats.at(-1) as { feathers: number }).feathers).toBeGreaterThanOrEqual(1);
  });

  it('pause() stops ticking and resume() restarts it', () => {
    const engine = createCarnavalParadeEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);

    game.pause();
    const elapsedAtPause = engine.view.elapsedMs;
    vi.advanceTimersByTime(500);
    expect(engine.view.elapsedMs).toBe(elapsedAtPause);

    game.resume();
    vi.advanceTimersByTime(TICK_MS);
    expect(engine.view.elapsedMs).toBeGreaterThan(elapsedAtPause);
  });

  it('end() stops ticking, removes the keydown listener and returns the score/stats', () => {
    const engine = createCarnavalParadeEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);
    engine.debugSetScore(130, 13, 0);

    const ended = game.end();

    expect(ended).toEqual({
      score: 130,
      stats: { feathers: 13, stars: 0, barriersHit: 0, bestStreak: 0 },
    });
    const laneBefore = engine.view.lane;
    press('ArrowDown');
    expect(engine.view.lane).toBe(laneBefore); // the listener is gone.
    const elapsedAtEnd = engine.view.elapsedMs;
    vi.advanceTimersByTime(1_000);
    expect(engine.view.elapsedMs).toBe(elapsedAtEnd); // ticking stopped too.
  });

  it('debugFinishNow() calls the shell’s context.finish()', () => {
    const { game, container, ctx } = setup();
    game.start(container, ctx);

    game.debugFinishNow();

    expect(ctx.finishCalls).toBe(1);
  });

  describe('doneSummary()', () => {
    function doneSummaryAt(score: number, ended: 'time' | 'lives' = 'time') {
      const engine = createCarnavalParadeEngine();
      engine.debugSetScore(score, 0, 0);
      if (ended === 'lives') {
        // Drive 3 barrier hits (the Penguin's own lane) to reach ended: 'lives'
        // honestly, since `ended` has no debug setter of its own.
        let i = 0;
        const script = [0, 0.5, 0.1, 0.9];
        const hitEngine = createCarnavalParadeEngine({ rng: () => script[i++ % script.length] });
        for (let t = 0; t < 3000 && hitEngine.view.lives > 0; t++) hitEngine.tick();
        hitEngine.debugSetScore(score, 0, 0);
        return createCarnavalParade({ engine: hitEngine }).doneSummary!();
      }
      // A fresh engine's `ended` is null; run it to the natural time-out
      // (lane 2, where this rng never spawns, so lives stay full).
      let i = 0;
      const script = [0, 0.91, 0.6];
      const timeEngine = createCarnavalParadeEngine({ rng: () => script[i++ % script.length] });
      const totalTicks = Math.ceil(45_000 / TICK_MS) + 5;
      for (let t = 0; t < totalTicks && timeEngine.view.phase === 'play'; t++) timeEngine.tick();
      timeEngine.debugSetScore(score, 0, 0);
      return createCarnavalParade({ engine: timeEngine }).doneSummary!();
    }

    it('APRENDIZ under 200, FOLIÃO from 200, PASSISTA from 400, each with Hector’s own line', () => {
      const aprendiz = doneSummaryAt(150);
      expect(aprendiz.title).toBe('APRENDIZ');
      expect(aprendiz.kicker).toBe('FIM DO DESFILE');
      expect(aprendiz.quote).toBe('Hector: "Devagar. Watch the barriers and try again."');

      const foliao = doneSummaryAt(200);
      expect(foliao.title).toBe('FOLIÃO');
      expect(foliao.quote).toBe('Hector: "Boa. You kept the rhythm. Go again for 400."');

      const passista = doneSummaryAt(400);
      expect(passista.title).toBe('PASSISTA');
      expect(passista.quote).toBe('Hector: "Que desfile! The whole avenue is on its feet."');
    });

    it('shows OUT OF LIVES as the kicker when the round ended on the 3rd barrier', () => {
      const summary = doneSummaryAt(50, 'lives');
      expect(summary.kicker).toBe('OUT OF LIVES');
    });

    it('includes the best streak as an extra row', () => {
      // Bank a streak of 3 for real, so bestStreak is nonzero and genuine.
      let i = 0;
      const script = [0, 0.5, 0.6];
      const streakEngine = createCarnavalParadeEngine({ rng: () => script[i++ % script.length] });
      for (let t = 0; t < 3000 && streakEngine.stats().feathers < 3; t++) streakEngine.tick();
      const game = createCarnavalParade({ engine: streakEngine });

      const summary = game.doneSummary!();

      expect(summary.rows).toEqual([{ key: 'bestStreak', label: 'BEST STREAK', value: '3' }]);
    });
  });
});
