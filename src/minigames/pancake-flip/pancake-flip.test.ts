// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameContext } from '../minigame';
import { createPancakeFlip } from './pancake-flip';
import type { FlipOutcome, PancakeFlipStats, PanIndex, PanView } from './pancake-flip-engine';

/**
 * A scriptable fake matching `PancakeFlipEngine`'s shape, so
 * `pancake-flip.ts`'s DOM wiring (clicks, keys, rendering, and the tick
 * loop) can be tested at its own seam without depending on the real
 * engine's timing. Deliberately mutable (unlike the real, readonly
 * `PancakeFlipEngine`) so tests can script score/stats/selection changes
 * directly; still structurally assignable wherever `PancakeFlipEngine` is
 * expected. The real engine's own rules (stages, payout, cadence) are
 * `pancake-flip-engine.test.ts`'s job.
 */
interface FakeEngine {
  stats: PancakeFlipStats;
  score: number;
  selected: PanIndex;
  streak: number;
  panStates: Array<PanView | null>;
  nextFlipOutcome: FlipOutcome;
  tickCalls: number[];
  selectCalls: PanIndex[];
  selectDeltaCalls: Array<-1 | 1>;
  flipCalls: number;
  panAt(index: PanIndex): PanView | null;
  tick(dtSec: number): { burnedOff: PanIndex[] };
  select(index: PanIndex): void;
  selectDelta(delta: -1 | 1): void;
  flip(): FlipOutcome;
}

function createFakeEngine(): FakeEngine {
  const stats: PancakeFlipStats = {
    golden: 0,
    flipNow: 0,
    raw: 0,
    burnt: 0,
    stacked: 0,
    bestStreak: 0,
  };
  const panStates: Array<PanView | null> = [
    { stage: 'raw', cookFraction: 0 },
    null,
    { stage: 'raw', cookFraction: 0.2 },
    null,
  ];

  const fake = {
    stats,
    score: 0,
    selected: 1 as PanIndex,
    streak: 0,
    panStates,
    nextFlipOutcome: 'empty' as FlipOutcome,
    tickCalls: [] as number[],
    selectCalls: [] as PanIndex[],
    selectDeltaCalls: [] as Array<-1 | 1>,
    flipCalls: 0,

    panAt(index: PanIndex): PanView | null {
      return fake.panStates[index];
    },
    tick(dtSec: number) {
      fake.tickCalls.push(dtSec);
      return { burnedOff: [] as PanIndex[] };
    },
    select(index: PanIndex) {
      fake.selectCalls.push(index);
      fake.selected = index;
    },
    selectDelta(delta: -1 | 1) {
      fake.selectDeltaCalls.push(delta);
      fake.selected = Math.max(0, Math.min(3, fake.selected + delta)) as PanIndex;
    },
    flip(): FlipOutcome {
      fake.flipCalls += 1;
      return fake.nextFlipOutcome;
    },
  };
  return fake;
}

function createFakeContext(): MinigameContext<'pancake-flip'> & {
  scoreCalls: number[];
  statsCalls: Array<Partial<PancakeFlipStats>>;
} {
  const ctx = {
    scoreCalls: [] as number[],
    statsCalls: [] as Array<Partial<PancakeFlipStats>>,
    setScore(score: number) {
      ctx.scoreCalls.push(score);
    },
    setStats(stats: Partial<PancakeFlipStats>) {
      ctx.statsCalls.push(stats);
    },
    finish() {
      /* unused by Pancake Flip */
    },
  };
  return ctx;
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  container.remove();
});

describe('createPancakeFlip: shape', () => {
  it('declares the id, duration, and the stat keys shown in the shell header', () => {
    const minigame = createPancakeFlip({ engine: createFakeEngine() });
    expect(minigame.id).toBe('pancake-flip');
    expect(minigame.durationSec).toBe(90);
    expect(Object.keys(minigame.statLabels)).toEqual(['stacked', 'golden', 'burnt']);
  });
});

describe('createPancakeFlip: rendering', () => {
  it('renders one element per pan, reflecting the engine state', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    const pans = container.querySelectorAll('.pancake-flip__pan');
    expect(pans).toHaveLength(4);
    expect(pans[0].getAttribute('data-stage')).toBe('raw');
    expect(pans[1].classList.contains('pancake-flip__pan--filled')).toBe(false);
    // Pan 1 is selected by the fake engine's initial state.
    expect(pans[1].classList.contains('pancake-flip__pan--selected')).toBe(true);
  });

  it('reports the initial score and stats to the context on start', () => {
    const engine = createFakeEngine();
    engine.score = 15;
    const context = createFakeContext();
    createPancakeFlip({ engine }).start(container, context);

    expect(context.scoreCalls).toEqual([15]);
    expect(context.statsCalls).toEqual([engine.stats]);
  });
});

describe('createPancakeFlip: pan selection', () => {
  it('clicking a pan surface selects it', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    const secondPan = container.querySelectorAll(
      '.pancake-flip__pan-surface',
    )[2] as HTMLButtonElement;
    secondPan.click();

    expect(engine.selectCalls).toEqual([2]);
  });

  it('ArrowLeft/ArrowRight and A/D move the selection', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D' }));

    expect(engine.selectDeltaCalls).toEqual([-1, 1, -1, 1]);
  });
});

describe('createPancakeFlip: flipping', () => {
  it('SPACE and ENTER flip the selected pan', () => {
    const engine = createFakeEngine();
    engine.nextFlipOutcome = 'golden';
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(engine.flipCalls).toBe(2);
  });

  it('the flip button also flips the selected pan', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    (container.querySelector('.pancake-flip__flip-button') as HTMLButtonElement).click();

    expect(engine.flipCalls).toBe(1);
  });

  it('reports the updated score/stats and shows a toast after a scoring flip', () => {
    const engine = createFakeEngine();
    engine.nextFlipOutcome = 'golden';
    const context = createFakeContext();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, context);

    engine.score = 10;
    engine.stats.golden = 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(context.scoreCalls.at(-1)).toBe(10);
    expect(context.statsCalls.at(-1)).toEqual(engine.stats);
    const toast = container.querySelector('.pancake-flip__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('GOLDEN +10');
  });

  it('flipping an empty pan does not report or toast again', () => {
    const engine = createFakeEngine();
    engine.nextFlipOutcome = 'empty';
    const context = createFakeContext();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, context);

    const callsAfterStart = context.scoreCalls.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(engine.flipCalls).toBe(1);
    expect(context.scoreCalls.length).toBe(callsAfterStart);
    const toast = container.querySelector('.pancake-flip__toast') as HTMLElement;
    expect(toast.hidden).toBe(true);
  });
});

describe('createPancakeFlip: pause/resume/end own their own ticking and listeners', () => {
  it('ticks the engine on an interval while playing, and stops on pause', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    vi.advanceTimersByTime(300);
    expect(engine.tickCalls.length).toBeGreaterThan(0);
    const countAtPause = engine.tickCalls.length;

    minigame.pause();
    vi.advanceTimersByTime(1000);
    expect(engine.tickCalls.length).toBe(countAtPause);
  });

  it('resumes ticking after resume()', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());
    minigame.pause();
    const countAtResume = engine.tickCalls.length;

    minigame.resume();
    vi.advanceTimersByTime(300);
    expect(engine.tickCalls.length).toBeGreaterThan(countAtResume);
  });

  it('end() stops ticking and removes the keydown listener', () => {
    const engine = createFakeEngine();
    const minigame = createPancakeFlip({ engine });
    minigame.start(container, createFakeContext());

    const result = minigame.end();
    expect(result).toEqual({ score: engine.score, stats: engine.stats });

    const countAfterEnd = engine.tickCalls.length;
    vi.advanceTimersByTime(1000);
    expect(engine.tickCalls.length).toBe(countAfterEnd);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(engine.flipCalls).toBe(0);
  });
});
