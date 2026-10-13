// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameStatsMap } from '../../contracts';
import type { MinigameContext } from '../minigame';
import { createPenaltyKick } from './penalty-kick';
import { KICK_DURATION_MS, RESULT_PAUSE_MS, TICK_MS } from './penalty-kick-engine';

/** A `setInterval(TICK_MS)` clock only fires on whole multiples of `TICK_MS`;
 *  this rounds a duration up to the next one so a faked-timer advance always
 *  covers it (e.g. 700 ms of kick flight needs 704 ms of ticks at 16 ms each). */
function ticksFor(durationMs: number): number {
  return Math.ceil(durationMs / TICK_MS) * TICK_MS;
}

const KICK_MS = ticksFor(KICK_DURATION_MS);
const RESULT_MS = ticksFor(RESULT_PAUSE_MS);

/**
 * `penalty-kick.ts`'s own seam: the `Minigame` interface plus the DOM and
 * keys it renders into the shell's play area. Drives the engine through its
 * `debugForceShot` test hook (the engine's own seeded-keeper unit tests in
 * `penalty-kick-engine.test.ts` already cover the aim/keeper rules); this
 * file is about the DOM reacting correctly to the engine's `view`.
 */
interface FakeContext extends MinigameContext<'penalty-kick'> {
  scores: number[];
  stats: Array<Partial<MinigameStatsMap['penalty-kick']>>;
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

function setup() {
  const container = document.createElement('div');
  document.body.append(container);
  const ctx = createFakeContext();
  const game = createPenaltyKick();
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
  const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
  return { container, ctx, game, q, text };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPenaltyKick: the Minigame the shell drives', () => {
  it('is registered as penalty-kick with a 5-shot how-to subtitle', () => {
    const { game } = setup();

    expect(game.id).toBe('penalty-kick');
    expect(game.title).toBe('PENALTY KICK');
    expect(game.howToSubtitle).toBe('PENALTY KICK · 5 SHOTS · SOLO');
    expect(game.howToPlay.join(' ')).toContain('Pick a corner and mean it');
    expect(game.statLabels).toEqual({ goals: 'GOALS', golazos: 'GOLAZOS', saved: 'SAVED' });
  });
});

describe('aiming and shooting', () => {
  it('SPACE locks the aim side, then the aim height, showing the subline each step', () => {
    const { container, ctx, game, text } = setup();
    game.start(container, ctx);

    expect(text('.penalty-kick__subline')).toBe('SPACE LOCKS THE SIDE');
    press(' ');
    expect(text('.penalty-kick__subline')).toBe('SPACE LOCKS THE HEIGHT AND SHOOTS');
  });

  it('a click does the same as SPACE', () => {
    const { container, ctx, game, q, text } = setup();
    game.start(container, ctx);

    q('.penalty-kick').click();

    expect(text('.penalty-kick__subline')).toBe('SPACE LOCKS THE HEIGHT AND SHOOTS');
  });
});

describe('a forced shot', () => {
  it('shows the toast and the Coach-style line (prefixed with the host’s name) once the kick lands', () => {
    const { container, ctx, game, text, q } = setup();
    game.start(container, ctx);

    game.debugForceShot('golazo');
    expect(q('.penalty-kick__toast').hidden).toBe(true);

    vi.advanceTimersByTime(KICK_MS); // the ball's flight

    expect(q('.penalty-kick__toast').hidden).toBe(false);
    expect(text('.penalty-kick__toast')).toBe('GOLAÇO! +50');
    expect(text('.penalty-kick__footer')).toBe('Chrystian: Top bins. Frame that one.');
    expect(q('.penalty-kick__dot--scored')).not.toBeNull();
  });

  it('reports score (goals + golazos) and stats through the context as shots land', () => {
    const { container, ctx, game } = setup();
    game.start(container, ctx);

    game.debugForceShot('goal');
    vi.advanceTimersByTime(KICK_MS);

    expect(ctx.stats.at(-1)).toMatchObject({ goals: 1, golazos: 0, saved: 0, wide: 0, over: 0 });
    expect(ctx.scores.at(-1)).toBe(1);
  });
});

describe('a full round of 5 forced shots', () => {
  it('finishes the round (context.finish) once the 5th shot’s result clears', () => {
    const { container, ctx, game } = setup();
    game.start(container, ctx);

    for (const outcome of ['goal', 'golazo', 'save', 'wide', 'over'] as const) {
      game.debugForceShot(outcome);
      vi.advanceTimersByTime(KICK_MS + RESULT_MS);
    }

    expect(ctx.finishCalls).toBe(1);
    const result = game.end();
    expect(result.stats).toEqual({ goals: 1, golazos: 1, saved: 1, wide: 1, over: 1 });
    expect(result.score).toBe(2);
  });

  it('doneSummary shows FULL TIME, the result title, SAVED/MISSED/TIPS and the host’s quote', () => {
    const { container, ctx, game } = setup();
    game.start(container, ctx);

    for (const outcome of ['goal', 'goal', 'goal', 'goal', 'save'] as const) {
      game.debugForceShot(outcome);
      vi.advanceTimersByTime(KICK_MS + RESULT_MS);
    }
    game.end();

    const summary = game.doneSummary!();
    expect(summary.kicker).toBe('FULL TIME');
    expect(summary.title).toBe('GOLEADOR');
    expect(summary.scoreLabel).toBe('GOALS');
    expect(summary.rows).toEqual([
      { key: 'saved', label: 'SAVED', value: '1' },
      { key: 'missed', label: 'MISSED', value: '0' },
      { key: 'tips', label: 'TIPS', value: '+120' },
    ]);
    expect(summary.quote).toBe(
      'Chrystian: "Cinco estrelas. The keeper is still looking for the ball."',
    );
  });
});

describe('pause/resume', () => {
  it('pause stops the engine ticking; resume continues it', () => {
    const { container, ctx, game } = setup();
    game.start(container, ctx);
    game.debugForceShot('goal');

    game.pause();
    const statsCountWhilePaused = ctx.stats.length;
    vi.advanceTimersByTime(KICK_MS);
    expect(ctx.finishCalls).toBe(0);
    // Still mid-flight: no further stats reported from a tick that never ran.
    expect(ctx.stats.length).toBe(statsCountWhilePaused);

    game.resume();
    vi.advanceTimersByTime(KICK_MS);
    expect(ctx.stats.at(-1)).toMatchObject({ goals: 1 });
  });
});
