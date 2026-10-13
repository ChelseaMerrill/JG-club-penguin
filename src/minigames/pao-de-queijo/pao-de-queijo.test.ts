// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameStatsMap } from '../../contracts';
import type { MinigameContext } from '../minigame';
import { createPaoDeQueijoEngine, ROUNDS, TICK_MS } from './pao-de-queijo-engine';
import { createPaoDeQueijo, paoDeQueijoCardLayout, paoDeQueijoStageScale } from './pao-de-queijo';

/** `pao-de-queijo.ts`'s own seam: the `Minigame` interface plus the DOM it
 *  renders into the shell's play area. Drives a real engine (the default or
 *  an injected one) through faked timers; the engine's own rule values are
 *  `pao-de-queijo-engine.test.ts`'s job. */
interface FakeContext extends MinigameContext<'pao-de-queijo'> {
  scores: number[];
  stats: Array<Partial<MinigameStatsMap['pao-de-queijo']>>;
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

function setup(engine = createPaoDeQueijoEngine()) {
  const container = document.createElement('div');
  document.body.append(container);
  const ctx = createFakeContext();
  const game = createPaoDeQueijo({ engine });
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
  const qAll = (selector: string) => container.querySelectorAll(selector);
  return { container, ctx, game, engine, q, qAll };
}

/** `NEXT_ROUND_PAUSE_TICKS`/`FINAL_PAUSE_TICKS`'s own ms, from the engine's
 *  doc comment (1500ms / 1300ms), plus a little slack. */
const NEXT_ROUND_PAUSE_MS = 1500;
const FINAL_PAUSE_MS = 1300;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPaoDeQueijo: the Minigame the shell drives', () => {
  it('is registered as pao-de-queijo, 165 s, with the design’s own how-to copy', () => {
    const { game } = setup();

    expect(game.id).toBe('pao-de-queijo');
    expect(game.title).toBe('PÃO DE QUEIJO MEMORY');
    expect(game.durationSec).toBe(165);
    expect(game.howToSubtitle).toBe('PÃO DE QUEIJO MEMORY · 3 ROUNDS · SOLO');
    expect(game.howToPlay).toHaveLength(3);
    expect(game.howToPlay.join(' ')).toContain('3 matches in a row doubles points');
    expect(game.statLabels).toEqual({ roundsCleared: 'ROUNDS', matches: 'MATCHES' });
  });

  it('deals round 1 face up (12 cards) and reports the initial score/stats', () => {
    const { game, container, ctx } = setup();

    game.start(container, ctx);

    const cards = container.querySelectorAll('.pao-de-queijo__card');
    expect(cards).toHaveLength(12);
    expect(
      [...cards].every((card) => card.classList.contains('pao-de-queijo__card--flipped')),
    ).toBe(true);
    expect(ctx.scores.at(-1)).toBe(0);
    expect(ctx.stats.at(-1)).toMatchObject({ roundsCleared: 0, matches: 0 });
  });

  it('flips down after the preview, flips back up and locks the board on a click, and scores a match', () => {
    const engine = createPaoDeQueijoEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);

    vi.advanceTimersByTime(2200); // round 1's own preview.
    const cards = container.querySelectorAll<HTMLButtonElement>('.pao-de-queijo__card');
    expect(
      [...cards].every((card) => !card.classList.contains('pao-de-queijo__card--flipped')),
    ).toBe(true);

    const key = engine.view.cards[0].key;
    const partnerIndex = engine.view.cards.findIndex((c, i) => i !== 0 && c.key === key);
    cards[0].click();
    cards[partnerIndex].click();
    expect(cards[0].classList.contains('pao-de-queijo__card--flipped')).toBe(true);

    vi.advanceTimersByTime(450); // the match reveal delay.

    expect(cards[0].classList.contains('pao-de-queijo__card--matched')).toBe(true);
    expect(cards[0].disabled).toBe(true);
    expect(engine.view.score).toBe(100);
    expect(ctx.scores.at(-1)).toBe(100);
    expect((ctx.stats.at(-1) as { matches: number }).matches).toBe(1);
  });

  it('pause() stops ticking and resume() restarts it', () => {
    const engine = createPaoDeQueijoEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);
    vi.advanceTimersByTime(2200); // clear the preview first.

    game.pause();
    const secondsAtPause = engine.view.secondsLeft;
    vi.advanceTimersByTime(1000);
    expect(engine.view.secondsLeft).toBe(secondsAtPause);

    game.resume();
    vi.advanceTimersByTime(TICK_MS);
    expect(engine.view.secondsLeft).toBeLessThan(secondsAtPause);
  });

  it('end() stops ticking and returns the score/stats', () => {
    const engine = createPaoDeQueijoEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);
    engine.debugMatchAllPairs();

    const ended = game.end();

    // Round 1 cleared at full time, cold start: 6 matches at x1/x1/x1/x2/x2/x2
    // (100*3 + 200*3 = 900) plus the full-time bonus (round(60*3) = 180).
    expect(ended).toEqual({
      score: 1080,
      stats: { roundsCleared: 1, matches: 6, bestStreak: 6 },
    });
    const scoreAtEnd = engine.view.score;
    vi.advanceTimersByTime(5_000);
    expect(engine.view.score).toBe(scoreAtEnd); // ticking stopped.
  });

  it('debugMatchAllPairs() clears all 3 rounds and calls context.finish() exactly once', () => {
    const { game, container, ctx } = setup();
    game.start(container, ctx);

    game.debugMatchAllPairs();
    vi.advanceTimersByTime(NEXT_ROUND_PAUSE_MS);
    expect(container.querySelectorAll('.pao-de-queijo__card')).toHaveLength(16); // round 2's 4x4.

    game.debugMatchAllPairs();
    vi.advanceTimersByTime(NEXT_ROUND_PAUSE_MS);
    expect(container.querySelectorAll('.pao-de-queijo__card')).toHaveLength(20); // round 3's 5x4.

    game.debugMatchAllPairs();
    vi.advanceTimersByTime(FINAL_PAUSE_MS);

    expect(ctx.finishCalls).toBe(1);
  });

  it('never throws once the shell already ended the round', () => {
    const { game, container, ctx } = setup();
    game.start(container, ctx);
    game.end();

    expect(() => game.debugMatchAllPairs()).not.toThrow();
  });
});

describe('paoDeQueijoCardLayout: the design’s own card-grid centring formula', () => {
  // Hand-worked from the design's `renderVals()` (`W=130,H=140,G=14`,
  // `x0=800-tw/2`, `y0=500-th/2+30`), independently of the implementation.
  it('round 1 (4x3): centres a 562x448 grid at x0=519, y0=306', () => {
    expect(paoDeQueijoCardLayout(0, ROUNDS[0])).toEqual({ x: 519, y: 306 });
    expect(paoDeQueijoCardLayout(1, ROUNDS[0])).toEqual({ x: 663, y: 306 }); // col 1, row 0.
    expect(paoDeQueijoCardLayout(4, ROUNDS[0])).toEqual({ x: 519, y: 460 }); // col 0, row 1.
  });

  it('round 2 (4x4): the same 562-wide grid, now 602 tall, centres at x0=519, y0=229', () => {
    expect(paoDeQueijoCardLayout(0, ROUNDS[1])).toEqual({ x: 519, y: 229 });
  });

  it('round 3 (5x4): a wider 706x602 grid centres at x0=447, y0=229', () => {
    expect(paoDeQueijoCardLayout(0, ROUNDS[2])).toEqual({ x: 447, y: 229 });
    expect(paoDeQueijoCardLayout(2, ROUNDS[2])).toEqual({ x: 735, y: 229 }); // col 2, row 0.
    expect(paoDeQueijoCardLayout(7, ROUNDS[2])).toEqual({ x: 735, y: 383 }); // col 2, row 1.
  });
});

describe('paoDeQueijoStageScale: the contain-fit scale for the 1600x900 stage', () => {
  it('is the smaller of the two axis ratios (a letterboxed field)', () => {
    expect(paoDeQueijoStageScale(1600, 900)).toBe(1); // exact fit.
    expect(paoDeQueijoStageScale(800, 450)).toBe(0.5); // uniform half scale.
    expect(paoDeQueijoStageScale(3200, 900)).toBe(1); // wider field: height-bound.
    expect(paoDeQueijoStageScale(1600, 1800)).toBe(1); // taller field: width-bound.
  });

  it('is 0 for a not-yet-laid-out field (jsdom, or a 0-size box) rather than Infinity/NaN', () => {
    expect(paoDeQueijoStageScale(0, 0)).toBe(0);
    expect(paoDeQueijoStageScale(0, 500)).toBe(0);
  });
});

describe('createPaoDeQueijo: the rendered board positions cards at the design’s own layout', () => {
  it('positions round 1’s cards at paoDeQueijoCardLayout’s own coordinates, and repositions on round 2', () => {
    const { game, container, ctx } = setup();
    game.start(container, ctx);

    const cardsRound1 = container.querySelectorAll<HTMLButtonElement>('.pao-de-queijo__card');
    const expectedFirst = paoDeQueijoCardLayout(0, ROUNDS[0]);
    expect(cardsRound1[0].style.left).toBe(`${expectedFirst.x}px`);
    expect(cardsRound1[0].style.top).toBe(`${expectedFirst.y}px`);
    const expectedLast = paoDeQueijoCardLayout(cardsRound1.length - 1, ROUNDS[0]);
    expect(cardsRound1[cardsRound1.length - 1].style.left).toBe(`${expectedLast.x}px`);
    expect(cardsRound1[cardsRound1.length - 1].style.top).toBe(`${expectedLast.y}px`);

    game.debugMatchAllPairs();
    vi.advanceTimersByTime(1500); // the between-round pause.

    const cardsRound2 = container.querySelectorAll<HTMLButtonElement>('.pao-de-queijo__card');
    const expectedRound2First = paoDeQueijoCardLayout(0, ROUNDS[1]);
    expect(cardsRound2[0].style.left).toBe(`${expectedRound2First.x}px`);
    expect(cardsRound2[0].style.top).toBe(`${expectedRound2First.y}px`);
  });

  it('every card has both a back face (the JG mark) and a front face (icon + label)', () => {
    const { game, container, ctx } = setup();
    game.start(container, ctx);

    const card = container.querySelector<HTMLButtonElement>('.pao-de-queijo__card')!;
    const back = card.querySelector('.pao-de-queijo__card-face--back')!;
    const front = card.querySelector('.pao-de-queijo__card-face--front')!;
    expect(back.querySelector('.pao-de-queijo__card-mark')?.textContent).toBe('JG');
    expect(front.querySelector('.pao-de-queijo__card-icon')).not.toBeNull();
    expect(front.querySelector('.pao-de-queijo__card-label')?.textContent).toMatch(/\S/);
  });

  it('a matched pair carries --matched (the design’s own matched front-face styling hook) and stays disabled', () => {
    const engine = createPaoDeQueijoEngine();
    const { game, container, ctx } = setup(engine);
    game.start(container, ctx);
    vi.advanceTimersByTime(2200); // round 1's own preview.

    const cards = container.querySelectorAll<HTMLButtonElement>('.pao-de-queijo__card');
    const key = engine.view.cards[0].key;
    const partnerIndex = engine.view.cards.findIndex((c, i) => i !== 0 && c.key === key);
    cards[0].click();
    cards[partnerIndex].click();
    vi.advanceTimersByTime(450); // the match reveal delay.

    expect(cards[0].classList.contains('pao-de-queijo__card--matched')).toBe(true);
    expect(cards[0].querySelector('.pao-de-queijo__card-face--front')).not.toBeNull();
    expect(cards[0].disabled).toBe(true);

    // An unselected, still face-down card never picks up --matched or
    // --flipped on its own.
    const untouched = [...cards].find((_c, i) => i !== 0 && i !== partnerIndex)!;
    expect(untouched.classList.contains('pao-de-queijo__card--matched')).toBe(false);
    expect(untouched.classList.contains('pao-de-queijo__card--flipped')).toBe(false);
  });
});

describe('createPaoDeQueijo: doneSummary()', () => {
  function summaryAfterRounds(roundsCleared: 0 | 1 | 2 | 3) {
    const engine = createPaoDeQueijoEngine();
    if (roundsCleared === 0) {
      // Run the clock out on round 1 without matching anything.
      for (let t = 0; t < 2000 && engine.view.phase === 'play'; t++) engine.tick();
      return createPaoDeQueijo({ engine }).doneSummary!();
    }
    for (let i = 0; i < roundsCleared; i++) {
      engine.debugMatchAllPairs();
      // Past the between-round pause (30 ticks) or, on the last round, the
      // final pause (26 ticks) -- either way, 32 is enough; `tick()` is a
      // no-op once the game is already done.
      for (let t = 0; t < 32; t++) engine.tick();
    }
    return createPaoDeQueijo({ engine }).doneSummary!();
  }

  it('DELICIOSO! on a full clear, with TODAS AS RODADAS and Sander’s win line', () => {
    const summary = summaryAfterRounds(3);

    expect(summary.title).toBe('DELICIOSO!');
    expect(summary.kicker).toBe('TODAS AS RODADAS');
    expect(summary.quote).toBe('Sander: "Que delícia! You cleaned out the whole case."');
    expect(summary.rows).toEqual([
      { key: 'cleared', label: 'ROUNDS', value: '3 / 3' },
      { key: 'bestStreak', label: 'BEST STREAK', value: '24' },
    ]);
  });

  it('QUASE LÁ on a partial clear, with Sander’s almost-there line', () => {
    const summary = summaryAfterRounds(1);

    expect(summary.title).toBe('QUASE LÁ');
    expect(summary.quote).toBe('Sander: "Quase! One more round and the badge is yours."');
  });

  it('TENTE DE NOVO and TIME RAN OUT on no rounds cleared, with Sander’s try-again line', () => {
    const summary = summaryAfterRounds(0);

    expect(summary.title).toBe('TENTE DE NOVO');
    expect(summary.kicker).toBe('TIME RAN OUT');
    expect(summary.quote).toBe('Sander: "Calma. Look for the pairs, one corner at a time."');
  });
});
