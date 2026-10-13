import { describe, expect, it } from 'vitest';
import {
  createPaoDeQueijoEngine,
  multiplierForStreak,
  resultTitle,
  ROUNDS,
  TICK_MS,
  TOTAL_DURATION_SECONDS,
  TOTAL_PAIRS,
  TREAT_KEYS,
  type PaoDeQueijoEngine,
} from './pao-de-queijo-engine';

/** A small deterministic PRNG (mulberry32), test-only: reproducible across
 *  runs and across two engines seeded the same way, unlike `Math.random`. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ticks `engine` until `predicate()` is true, or throws after `maxTicks`. */
function tickUntil(engine: PaoDeQueijoEngine, predicate: () => boolean, maxTicks = 5000): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    engine.tick();
  }
  throw new Error(`tickUntil: predicate still false after ${maxTicks} ticks`);
}

/** Ticks past round 0's own face-up preview (2200ms). */
function endPreview(engine: PaoDeQueijoEngine): void {
  tickUntil(engine, () => !engine.view.preview);
}

describe('multiplierForStreak', () => {
  it('is x1 under a 3-match streak, x2 from 3, x3 from 6 (design: streak>=6?3:(streak>=3?2:1))', () => {
    expect(multiplierForStreak(0)).toBe(1);
    expect(multiplierForStreak(2)).toBe(1);
    expect(multiplierForStreak(3)).toBe(2);
    expect(multiplierForStreak(5)).toBe(2);
    expect(multiplierForStreak(6)).toBe(3);
    expect(multiplierForStreak(100)).toBe(3);
  });
});

describe('resultTitle', () => {
  it('is DELICIOSO! on a full clear, QUASE LÁ on 1-2 rounds, TENTE DE NOVO on none', () => {
    expect(resultTitle(0)).toBe('TENTE DE NOVO');
    expect(resultTitle(1)).toBe('QUASE LÁ');
    expect(resultTitle(2)).toBe('QUASE LÁ');
    expect(resultTitle(3)).toBe('DELICIOSO!');
  });
});

describe('ROUNDS', () => {
  it('matches the design: 4x3/60s, 4x4/55s, 5x4/50s, 24 pairs and 165s total', () => {
    expect(ROUNDS).toEqual([
      { cols: 4, rows: 3, timerSeconds: 60, previewMs: 2200 },
      { cols: 4, rows: 4, timerSeconds: 55, previewMs: 2000 },
      { cols: 5, rows: 4, timerSeconds: 50, previewMs: 1800 },
    ]);
    expect(TOTAL_PAIRS).toBe(24);
    expect(TOTAL_DURATION_SECONDS).toBe(165);
  });
});

describe('createPaoDeQueijoEngine: deal', () => {
  it("deals round 1's own 4x3 grid, 6 pairs from the 10 treats, every card face up and locked", () => {
    const engine = createPaoDeQueijoEngine();

    expect(engine.view.phase).toBe('play');
    expect(engine.view.round).toBe(0);
    expect(engine.view.preview).toBe(true);
    expect(engine.view.locked).toBe(true);
    expect(engine.view.secondsLeft).toBe(60);
    expect(engine.view.cards).toHaveLength(12);
    expect(engine.view.cards.every((card) => card.faceUp && !card.matched)).toBe(true);

    const counts = new Map<string, number>();
    for (const card of engine.view.cards) {
      expect(TREAT_KEYS).toContain(card.key);
      counts.set(card.key, (counts.get(card.key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    expect([...counts.values()]).toEqual(Array(6).fill(2));
  });

  it('the same seed deals the same deck twice (a reproducible "seeded shuffle")', () => {
    const a = createPaoDeQueijoEngine({ rng: seededRng(42) });
    const b = createPaoDeQueijoEngine({ rng: seededRng(42) });

    expect(a.view.cards.map((c) => c.key)).toEqual(b.view.cards.map((c) => c.key));
  });

  it('a different seed can deal a different deck', () => {
    const a = createPaoDeQueijoEngine({ rng: seededRng(1) });
    const b = createPaoDeQueijoEngine({ rng: seededRng(2) });

    expect(a.view.cards.map((c) => c.key)).not.toEqual(b.view.cards.map((c) => c.key));
  });
});

describe('createPaoDeQueijoEngine: preview', () => {
  it('flips every card down once the 2.2s preview ends, unlocking the board', () => {
    const engine = createPaoDeQueijoEngine();

    tickUntil(engine, () => !engine.view.preview, 2200 / TICK_MS + 1);

    expect(engine.view.preview).toBe(false);
    expect(engine.view.locked).toBe(false);
    expect(engine.view.cards.every((card) => !card.faceUp)).toBe(true);
  });

  it("the clock doesn't move during the preview", () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    expect(engine.view.secondsLeft).toBe(60);
  });
});

describe('createPaoDeQueijoEngine: match and miss', () => {
  function firstPairIndices(engine: PaoDeQueijoEngine): [number, number] {
    const key = engine.view.cards[0].key;
    const indices = engine.view.cards
      .map((card, index) => ({ card, index }))
      .filter((entry) => entry.card.key === key)
      .map((entry) => entry.index);
    return [indices[0], indices[1]];
  }

  function mismatchedIndices(engine: PaoDeQueijoEngine): [number, number] {
    // Skips any already-matched card (a prior test step may have matched
    // index 0's own pair already).
    const a = engine.view.cards.findIndex((card) => !card.matched);
    const aKey = engine.view.cards[a].key;
    const b = engine.view.cards.findIndex(
      (card, i) => i !== a && !card.matched && card.key !== aKey,
    );
    return [a, b];
  }

  it('a match locks the board for 450ms, then scores 100 (x1) and stays face up', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    const [a, b] = firstPairIndices(engine);

    engine.flip(a);
    engine.flip(b);
    expect(engine.view.locked).toBe(true);
    expect(engine.view.score).toBe(0);

    tickUntil(engine, () => engine.view.cards[a].matched, 450 / TICK_MS + 1);

    expect(engine.view.cards[a].matched).toBe(true);
    expect(engine.view.cards[b].matched).toBe(true);
    expect(engine.view.score).toBe(100);
    expect(engine.view.streak).toBe(1);
    expect(engine.view.bestStreak).toBe(1);
    expect(engine.view.locked).toBe(false);
    expect(engine.stats()).toEqual({ roundsCleared: 0, matches: 1, bestStreak: 1 });
  });

  it('a miss flips both back after 800ms, resets the streak, and scores nothing', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    const [a, b] = firstPairIndices(engine);
    engine.flip(a);
    engine.flip(b);
    tickUntil(engine, () => engine.view.cards[a].matched, 450 / TICK_MS + 1);
    expect(engine.view.streak).toBe(1);

    const [c, d] = mismatchedIndices(engine);
    engine.flip(c);
    engine.flip(d);
    expect(engine.view.locked).toBe(true);

    tickUntil(engine, () => !engine.view.cards[c].faceUp, 800 / TICK_MS + 1);

    expect(engine.view.cards[c].faceUp).toBe(false);
    expect(engine.view.cards[d].faceUp).toBe(false);
    expect(engine.view.cards[c].matched).toBe(false);
    expect(engine.view.score).toBe(100); // unchanged from the earlier match
    expect(engine.view.streak).toBe(0);
    expect(engine.view.locked).toBe(false);
  });

  it('the clock keeps running during a match/miss reveal', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    const [a, b] = firstPairIndices(engine);
    engine.flip(a);
    engine.flip(b);
    tickUntil(engine, () => engine.view.cards[a].matched, 450 / TICK_MS + 1);
    expect(engine.view.secondsLeft).toBeLessThan(60);
  });

  it('a card already matched or mid-reveal ignores a flip', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    const [a] = firstPairIndices(engine);
    engine.flip(a);
    expect(engine.view.cards[a].faceUp).toBe(true);
    engine.flip(a); // already face up: ignored, not treated as the pair's second pick
    expect(engine.view.cards.filter((c) => c.faceUp)).toHaveLength(1);
  });
});

describe('createPaoDeQueijoEngine: multiplier ramps across a round', () => {
  it('scores x1 for matches 1-3, x2 for 4-6 of an unbroken streak', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);

    const byKey = new Map<string, number[]>();
    engine.view.cards.forEach((card, index) => {
      const list = byKey.get(card.key) ?? [];
      list.push(index);
      byKey.set(card.key, list);
    });
    const pairs = [...byKey.values()]; // round 1 has exactly 6 pairs

    const scoresAfterEachMatch: number[] = [];
    for (const [a, b] of pairs) {
      engine.flip(a);
      engine.flip(b);
      // Checks the pair's own resolution, not `locked`: the 6th (round-
      // clearing) match never un-locks -- it stays locked through the
      // between-round pause into round 2's own preview.
      tickUntil(engine, () => engine.view.cards[a].matched);
      scoresAfterEachMatch.push(engine.view.score);
    }

    // Matches 1-3 at x1 (100 each), 4-6 at x2 (200 each): running totals
    // 100, 200, 300, 500, 700, 900, plus whatever the 6th (round-clearing)
    // match's own time bonus adds on top.
    expect(scoresAfterEachMatch.slice(0, 5)).toEqual([100, 200, 300, 500, 700]);
    expect(scoresAfterEachMatch[5]).toBeGreaterThanOrEqual(900); // 900 + the round-clear bonus
    expect(engine.view.cleared).toBe(1);
  });
});

describe('createPaoDeQueijoEngine: round clear time bonus', () => {
  it('adds round(secondsLeft * 3) when the round clears, matching real play', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    const secondsLeftBeforeClear = engine.view.secondsLeft;

    engine.debugMatchAllPairs();

    const expectedBonus = Math.round(secondsLeftBeforeClear * 3);
    // 6 matches, multiplier x1 for the first 3 and x2 for the next 3 (100*3 + 200*3 = 900).
    expect(engine.view.score).toBe(900 + expectedBonus);
    expect(engine.view.toast).toBe(`CLEAR! +${expectedBonus}`);
    expect(engine.view.cleared).toBe(1);
  });
});

describe('createPaoDeQueijoEngine: timeout', () => {
  it("ends the game once the round's own clock reaches 0, without clearing it", () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);

    tickUntil(engine, () => engine.view.phase === 'done', 60_000 / TICK_MS + 5);

    expect(engine.view.phase).toBe('done');
    expect(engine.view.ended).toBe('timeout');
    expect(engine.view.cleared).toBe(0);
    expect(engine.stats()).toEqual({ roundsCleared: 0, matches: 0, bestStreak: 0 });
  });

  it('tick() is a no-op once the game is done', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    tickUntil(engine, () => engine.view.phase === 'done', 60_000 / TICK_MS + 5);
    const before = { ...engine.view };

    engine.tick();
    engine.flip(0);

    expect(engine.view).toMatchObject({ phase: 'done', score: before.score });
  });
});

describe('createPaoDeQueijoEngine: all three rounds (DELICIOSO!)', () => {
  it('clears every round via debugMatchAllPairs, ending cleared with the exact worked-example score', () => {
    const engine = createPaoDeQueijoEngine();

    // Round 1: cleared at full time (60s), from a cold start -- no ticks spent.
    engine.debugMatchAllPairs();
    expect(engine.view.cleared).toBe(1);
    tickUntil(engine, () => engine.view.round === 1 && engine.view.preview);
    expect(engine.view.secondsLeft).toBe(55);

    // Round 2: cleared at full time (55s) too -- debugMatchAllPairs fires
    // the instant round 2 is dealt, before any clock tick.
    engine.debugMatchAllPairs();
    expect(engine.view.cleared).toBe(2);
    tickUntil(engine, () => engine.view.round === 2 && engine.view.preview);
    expect(engine.view.secondsLeft).toBe(50);

    // Round 3: same, at full time (50s), ending the game.
    engine.debugMatchAllPairs();
    tickUntil(engine, () => engine.view.phase === 'done');

    expect(engine.view.ended).toBe('cleared');
    expect(engine.view.cleared).toBe(3);
    expect(engine.stats()).toEqual({ roundsCleared: 3, matches: 24, bestStreak: 24 });
    // Worked example: 24 unbroken matches score x1 for the first 3, x2 for
    // the next 3, x3 for the remaining 18 (100*3 + 200*3 + 300*18 = 6300),
    // plus the three rounds' own full-time bonuses (round(60*3) + round(55*3)
    // + round(50*3) = 180 + 165 + 150 = 495).
    expect(engine.view.score).toBe(6300 + 495);
  });
});

describe('createPaoDeQueijoEngine: debugMatchAllPairs', () => {
  it('is a no-op once the game is done', () => {
    const engine = createPaoDeQueijoEngine();
    endPreview(engine);
    tickUntil(engine, () => engine.view.phase === 'done', 60_000 / TICK_MS + 5);
    const before = engine.view.score;

    engine.debugMatchAllPairs();

    expect(engine.view.score).toBe(before);
    expect(engine.view.phase).toBe('done');
  });

  it('works mid-preview too (bypasses it), for a test that never waits one out', () => {
    const engine = createPaoDeQueijoEngine();
    expect(engine.view.preview).toBe(true);

    engine.debugMatchAllPairs();

    expect(engine.view.preview).toBe(false);
    expect(engine.view.cleared).toBe(1);
  });
});
