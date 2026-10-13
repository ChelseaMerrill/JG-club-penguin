/**
 * The pure, DOM-free Pão de Queijo Memory engine: a solo, three-round memory
 * match, ported rule for rule from `design/Minigame Pao de Queijo
 * Memory.dc.html`'s `class Component extends DCLogic` block. No timers and
 * no `Math.random`: the DOM layer (`pao-de-queijo.ts`) calls `tick()` once
 * per `TICK_MS`, so a test drives a whole game deterministically by calling
 * `tick()` itself, and an injectable `rng` stands in for the design's
 * `Math.random()` (the ticket's "seeded shuffle"), the same shape as
 * `carnaval-parade-engine.ts`'s own `rng` option.
 *
 * The design times everything -- the round's own face-up preview, a match's
 * 450ms reveal pause, a miss's 800ms flip-back, the 1.5s pause between
 * rounds and the 1.3s pause before the final result -- with independent
 * `setTimeout`s, and ticks only the round's own clock on a 100ms
 * `setInterval`. This port instead counts every one of those waits in whole
 * `TICK_MS` ticks, all advanced by the same `tick()` call (the same choice
 * `beystadium-engine.ts`'s own doc comment explains): `TICK_MS` is 50, not
 * the clock's own 100ms, because 50 evenly divides every one of those
 * waits (450, 800, 1500, 1300, and each round's own face-up preview --
 * 2200/2000/1800ms) as well as the clock's 100ms-per-0.1s rate (0.05 per
 * 50ms tick is the same rate). The round's own clock keeps counting down
 * during a match/miss reveal pause, exactly like the design's own
 * `tick()` (which only skips the clock while `preview` or between rounds);
 * it stops during the face-up preview and the between-round/final pause.
 */

/** Chosen so every one of this file's own waits (see the header comment)
 *  divides evenly into it. */
export const TICK_MS = 50;
const TICK_SEC = TICK_MS / 1000;

/** The design's own `after(450, ...)`: how long a matched pair stays
 *  revealed (locked) before the next flip is allowed. */
const MATCH_REVEAL_TICKS = 450 / TICK_MS;
/** The design's own `after(800, ...)`: how long a mismatched pair stays
 *  face up before flipping back. */
const MISS_FLIP_BACK_TICKS = 800 / TICK_MS;
/** The design's own `after(1500, ...)`: the pause between a cleared round
 *  (not the last) and the next one's setup. */
const NEXT_ROUND_PAUSE_TICKS = 1500 / TICK_MS;
/** The design's own `after(1300, ...)`: the pause after the third round
 *  clears, before the result screen. */
const FINAL_PAUSE_TICKS = 1300 / TICK_MS;

/** The design's own `BASE` match score, before the streak multiplier. */
const BASE_MATCH_POINTS = 100;
/** The design's own streak thresholds: x2 at a 3-match streak, x3 at 6. */
const DOUBLE_AT_STREAK = 3;
const TRIPLE_AT_STREAK = 6;

/** The design's own `KEYS`, in its own order. */
export const TREAT_KEYS = [
  'pao',
  'briga',
  'coxinha',
  'guarana',
  'cafe',
  'acai',
  'pastel',
  'beijinho',
  'quindim',
  'tapioca',
] as const;

export type TreatKey = (typeof TREAT_KEYS)[number];

export interface PaoDeQueijoRoundConfig {
  readonly cols: number;
  readonly rows: number;
  readonly timerSeconds: number;
  /** The round's own face-up preview, before the deal flips down. */
  readonly previewMs: number;
}

/** The design's own `ROUNDS`. */
export const ROUNDS: readonly PaoDeQueijoRoundConfig[] = [
  { cols: 4, rows: 3, timerSeconds: 60, previewMs: 2200 },
  { cols: 4, rows: 4, timerSeconds: 55, previewMs: 2000 },
  { cols: 5, rows: 4, timerSeconds: 50, previewMs: 1800 },
];

/** Every round's `cols * rows / 2` pairs, summed: the most pairs a whole
 *  game could ever match (`minigame-rules.ts`'s payout bound cites this). */
export const TOTAL_PAIRS = ROUNDS.reduce((sum, round) => sum + (round.cols * round.rows) / 2, 0);

/** Every round's own timer, summed: the design's total play time, and the
 *  anti-farm round duration (`minigame-rules.ts`). */
export const TOTAL_DURATION_SECONDS = ROUNDS.reduce((sum, round) => sum + round.timerSeconds, 0);

export interface PaoDeQueijoCard {
  readonly key: TreatKey;
  /** Visually face up: the preview, a selected-but-unresolved card, or a
   *  matched one (design: `c.face || c.done`). */
  readonly faceUp: boolean;
  readonly matched: boolean;
}

/** Exactly `MinigameStatsMap['pao-de-queijo']`. */
export interface PaoDeQueijoStats {
  roundsCleared: number;
  matches: number;
  bestStreak: number;
}

export type PaoDeQueijoEndReason = 'cleared' | 'timeout';

export interface PaoDeQueijoView {
  phase: 'play' | 'done';
  /** 0-based index into `ROUNDS`. */
  round: number;
  cards: readonly PaoDeQueijoCard[];
  /** True during the round's own face-up preview (every card dealt face up,
   *  no flips accepted yet). */
  preview: boolean;
  /** True while a flipped pair's match/miss outcome is being revealed, and
   *  while a cleared round's pause is playing out -- no flips accepted. */
  locked: boolean;
  secondsLeft: number;
  score: number;
  streak: number;
  bestStreak: number;
  /** Rounds cleared so far (0-3). */
  cleared: number;
  /** The design's own banner text ("ROUND 2", "CLEAR! +180"); `null` for none. */
  toast: string | null;
  /** `null` while playing; set once `phase` becomes `'done'`. */
  ended: PaoDeQueijoEndReason | null;
}

export interface PaoDeQueijoEngineOptions {
  /** Returns a float in `[0, 1)`, called in the design's own `shuffle()`
   *  order (Fisher-Yates, from the last index down to 1). Defaults to
   *  `Math.random`; tests inject a deterministic sequence instead. */
  rng?: () => number;
}

export interface PaoDeQueijoEngine {
  readonly view: Readonly<PaoDeQueijoView>;
  /** Advances the game by one `TICK_MS` step. A no-op once `phase` is `'done'`. */
  tick(): void;
  /** Flips card `index`. A no-op outside a flippable moment (preview,
   *  locked, already face up or matched, or the game already done). */
  flip(index: number): void;
  /** The `MinigameStatsMap['pao-de-queijo']` shape, off the live state. */
  stats(): PaoDeQueijoStats;
  /** Test-only (and the real e2e test hook, `pao-de-queijo.ts`'s
   *  `debugMatchAllPairs`): matches every remaining pair in the current
   *  round at once, in the same streak/multiplier order a perfect real
   *  play-through would, bypassing the preview flip and the match/miss
   *  reveal delays. Then runs the same round-clear logic a real last match
   *  would (the time bonus, and the pause before the next round or the
   *  result). A no-op once `phase` is `'done'`. */
  debugMatchAllPairs(): void;
}

/** The multiplier the *next* match scores at, given the streak of matches
 *  already strung together (design: `streak>=6?3:(streak>=3?2:1)`). */
export function multiplierForStreak(streak: number): number {
  if (streak >= TRIPLE_AT_STREAK) return 3;
  if (streak >= DOUBLE_AT_STREAK) return 2;
  return 1;
}

/** `DELICIOSO!` on a full clear, `QUASE LÁ` on a partial one, `TENTE DE
 *  NOVO` on none (design: `s.cleared>0?...`). */
export function resultTitle(roundsCleared: number): 'DELICIOSO!' | 'QUASE LÁ' | 'TENTE DE NOVO' {
  if (roundsCleared >= ROUNDS.length) return 'DELICIOSO!';
  if (roundsCleared > 0) return 'QUASE LÁ';
  return 'TENTE DE NOVO';
}

/** The design's own Fisher-Yates `shuffle`, with an injectable `rng`. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createPaoDeQueijoEngine(options: PaoDeQueijoEngineOptions = {}): PaoDeQueijoEngine {
  const rng = options.rng ?? Math.random;

  let cards: PaoDeQueijoCard[] = [];
  let selected: number[] = [];
  let totalMatches = 0;
  let previewTicksLeft: number | null = null;
  let resolveTicksLeft: number | null = null;
  let pendingResolution: 'match' | 'miss' | null = null;
  let transitionTicksLeft: number | null = null;
  let pendingWin = false;
  // The current round's own timer length and elapsed clock ticks, kept
  // separate so `secondsLeft` is always derived by one multiplication
  // (`timerSeconds - clockTicksElapsed * TICK_SEC`) rather than by repeated
  // subtraction, which would drift under floating-point rounding error over
  // a round's ~1000+ ticks.
  let roundTimerSeconds = ROUNDS[0].timerSeconds;
  let clockTicksElapsed = 0;

  const view: PaoDeQueijoView = {
    phase: 'play',
    round: 0,
    cards: [],
    preview: true,
    locked: true,
    secondsLeft: ROUNDS[0].timerSeconds,
    score: 0,
    streak: 0,
    bestStreak: 0,
    cleared: 0,
    toast: null,
    ended: null,
  };

  function syncCards(): void {
    view.cards = cards.map((card) => ({ ...card }));
  }

  function setupRound(roundIndex: number): void {
    const config = ROUNDS[roundIndex];
    const pairs = (config.cols * config.rows) / 2;
    const keys = shuffle(TREAT_KEYS, rng).slice(0, pairs);
    const deck = shuffle([...keys, ...keys], rng);
    cards = deck.map((key) => ({ key, faceUp: true, matched: false }));
    selected = [];
    pendingResolution = null;
    resolveTicksLeft = null;
    previewTicksLeft = Math.round(config.previewMs / TICK_MS);

    roundTimerSeconds = config.timerSeconds;
    clockTicksElapsed = 0;
    view.round = roundIndex;
    view.secondsLeft = config.timerSeconds;
    view.preview = true;
    view.locked = true;
    view.toast = roundIndex > 0 ? `ROUND ${roundIndex + 1}` : null;
    syncCards();
  }

  function endPreview(): void {
    cards = cards.map((card) => (card.matched ? card : { ...card, faceUp: false }));
    view.preview = false;
    view.locked = false;
    view.toast = null;
    syncCards();
  }

  function applyMatch(a: number, b: number): void {
    const multiplier = multiplierForStreak(view.streak);
    cards[a] = { ...cards[a], matched: true };
    cards[b] = { ...cards[b], matched: true };
    view.score += BASE_MATCH_POINTS * multiplier;
    view.streak += 1;
    view.bestStreak = Math.max(view.bestStreak, view.streak);
    totalMatches += 1;
  }

  function roundDone(): void {
    const bonus = Math.round(view.secondsLeft * 3);
    view.score += bonus;
    view.cleared += 1;
    view.toast = `CLEAR! +${bonus}`;
    pendingWin = view.round >= ROUNDS.length - 1;
    transitionTicksLeft = pendingWin ? FINAL_PAUSE_TICKS : NEXT_ROUND_PAUSE_TICKS;
  }

  function finishGame(win: boolean): void {
    view.phase = 'done';
    view.toast = null;
    view.locked = true;
    view.ended = win ? 'cleared' : 'timeout';
  }

  function checkRoundComplete(): void {
    if (cards.every((card) => card.matched)) {
      view.locked = true;
      roundDone();
    } else {
      view.locked = false;
    }
  }

  function resolvePending(): void {
    const [a, b] = selected;
    selected = [];
    if (pendingResolution === 'match') {
      applyMatch(a, b);
    } else {
      cards[a] = { ...cards[a], faceUp: false };
      cards[b] = { ...cards[b], faceUp: false };
      view.streak = 0;
    }
    pendingResolution = null;
    syncCards();
    checkRoundComplete();
  }

  function tick(): void {
    if (view.phase !== 'play') return;

    // Captured before either counter moves this tick: the clock below reads
    // these, not the post-decrement values, so the exact tick a preview or
    // between-round pause ends still counts as "paused" for the clock --
    // the clock only starts moving again on the *next* tick, once `preview`
    // (or the pause) has genuinely ended.
    const previewActive = previewTicksLeft !== null;
    const transitionActive = transitionTicksLeft !== null;

    if (previewTicksLeft !== null) {
      previewTicksLeft -= 1;
      if (previewTicksLeft <= 0) {
        previewTicksLeft = null;
        endPreview();
      }
    }

    if (resolveTicksLeft !== null) {
      resolveTicksLeft -= 1;
      if (resolveTicksLeft <= 0) {
        resolveTicksLeft = null;
        resolvePending();
      }
    }

    // The clock: skipped during the face-up preview and the between-round
    // pause, exactly like the design's own `tick()`; kept running during a
    // match/miss reveal, also like the design's.
    if (!previewActive && !transitionActive && view.phase === 'play') {
      clockTicksElapsed += 1;
      view.secondsLeft = Math.max(0, roundTimerSeconds - clockTicksElapsed * TICK_SEC);
      if (view.secondsLeft <= 0) {
        finishGame(false);
      }
    }

    if (transitionTicksLeft !== null && view.phase === 'play') {
      transitionTicksLeft -= 1;
      if (transitionTicksLeft <= 0) {
        transitionTicksLeft = null;
        const win = pendingWin;
        pendingWin = false;
        if (win) finishGame(true);
        else setupRound(view.round + 1);
      }
    }
  }

  function flip(index: number): void {
    if (view.phase !== 'play' || view.preview || view.locked) return;
    const card = cards[index];
    if (!card || card.faceUp || card.matched) return;

    cards[index] = { ...card, faceUp: true };
    selected.push(index);
    syncCards();

    if (selected.length < 2) return;
    view.locked = true;
    const [a, b] = selected;
    if (cards[a].key === cards[b].key) {
      pendingResolution = 'match';
      resolveTicksLeft = MATCH_REVEAL_TICKS;
    } else {
      pendingResolution = 'miss';
      resolveTicksLeft = MISS_FLIP_BACK_TICKS;
    }
  }

  function debugMatchAllPairs(): void {
    if (view.phase !== 'play') return;

    previewTicksLeft = null;
    resolveTicksLeft = null;
    pendingResolution = null;
    selected = [];
    view.preview = false;
    view.toast = null;

    const byKey = new Map<TreatKey, number[]>();
    cards.forEach((card, index) => {
      if (card.matched) return;
      const indices = byKey.get(card.key) ?? [];
      indices.push(index);
      byKey.set(card.key, indices);
    });
    for (const indices of byKey.values()) {
      if (indices.length >= 2) applyMatch(indices[0], indices[1]);
    }
    syncCards();
    checkRoundComplete();
  }

  setupRound(0);

  return {
    view,
    tick,
    flip,
    stats() {
      return { roundsCleared: view.cleared, matches: totalMatches, bestStreak: view.bestStreak };
    },
    debugMatchAllPairs,
  };
}
