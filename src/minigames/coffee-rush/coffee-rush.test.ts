// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameContext } from '../minigame';
import { createCoffeeRush } from './coffee-rush';
import type {
  CoffeeRushStats,
  CupIndex,
  CupView,
  OrderView,
  PourOutcome,
} from './coffee-rush-engine';

/**
 * A scriptable fake matching `CoffeeRushEngine`'s shape, so `coffee-rush.ts`'s
 * DOM wiring (clicks, keys, rendering, and the tick loop) can be tested at
 * its own seam without depending on the real engine's timing. Deliberately
 * mutable (unlike the real, readonly `CoffeeRushEngine`) so tests can script
 * score/stats/selection changes directly; still structurally assignable
 * wherever `CoffeeRushEngine` is expected. The real engine's own rules
 * (tolerance, payout, patience) are `coffee-rush-engine.test.ts`'s job.
 */
interface FakeEngine {
  stats: CoffeeRushStats;
  score: number;
  selected: CupIndex;
  pouring: boolean;
  streak: number;
  bestStreak: number;
  orderStates: OrderView[];
  cupStates: CupView[];
  nextReleaseOutcome: PourOutcome;
  tickCalls: number[];
  selectCalls: CupIndex[];
  selectDeltaCalls: Array<-1 | 1>;
  startPourCalls: number;
  releasePourCalls: number;
  orders(): readonly OrderView[];
  cupAt(index: CupIndex): CupView;
  tick(dtSec: number): { walkedOut: boolean; forceSpilled: boolean };
  select(index: CupIndex): void;
  selectDelta(delta: -1 | 1): void;
  startPour(): void;
  releasePour(): PourOutcome;
}

function createFakeEngine(): FakeEngine {
  const stats: CoffeeRushStats = {
    small: 0,
    medium: 0,
    large: 0,
    perfect: 0,
    spilled: 0,
    lost: 0,
  };
  const orderStates: OrderView[] = [
    { size: 'small', patiencePct: 100 },
    { size: 'medium', patiencePct: 100 },
    { size: 'large', patiencePct: 100 },
    { size: 'small', patiencePct: 100 },
  ];
  const cupStates: CupView[] = [{ fillPct: 0 }, { fillPct: 0 }, { fillPct: 0 }, { fillPct: 0 }];

  const fake: FakeEngine = {
    stats,
    score: 0,
    selected: 0 as CupIndex,
    pouring: false,
    streak: 0,
    bestStreak: 0,
    orderStates,
    cupStates,
    nextReleaseOutcome: 'none',
    tickCalls: [],
    selectCalls: [],
    selectDeltaCalls: [],
    startPourCalls: 0,
    releasePourCalls: 0,

    orders() {
      return fake.orderStates;
    },
    cupAt(index) {
      return fake.cupStates[index];
    },
    tick(dtSec) {
      fake.tickCalls.push(dtSec);
      return { walkedOut: false, forceSpilled: false };
    },
    select(index) {
      fake.selectCalls.push(index);
      fake.selected = index;
    },
    selectDelta(delta) {
      fake.selectDeltaCalls.push(delta);
      fake.selected = Math.max(0, Math.min(3, fake.selected + delta)) as CupIndex;
    },
    startPour() {
      fake.startPourCalls += 1;
      fake.pouring = true;
    },
    releasePour() {
      fake.releasePourCalls += 1;
      fake.pouring = false;
      return fake.nextReleaseOutcome;
    },
  };
  return fake;
}

function createFakeContext(): MinigameContext<'coffee-rush'> & {
  scoreCalls: number[];
  statsCalls: Array<Partial<CoffeeRushStats>>;
} {
  const ctx = {
    scoreCalls: [] as number[],
    statsCalls: [] as Array<Partial<CoffeeRushStats>>,
    setScore(score: number) {
      ctx.scoreCalls.push(score);
    },
    setStats(stats: Partial<CoffeeRushStats>) {
      ctx.statsCalls.push(stats);
    },
    finish() {
      /* unused directly by Coffee Rush's own render/tick paths */
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

describe('createCoffeeRush: shape', () => {
  it('declares the id, duration, and the stat keys shown in the shell header', () => {
    const minigame = createCoffeeRush({ engine: createFakeEngine() });
    expect(minigame.id).toBe('coffee-rush');
    expect(minigame.durationSec).toBe(90);
    expect(Object.keys(minigame.statLabels)).toEqual(['perfect', 'spilled', 'lost']);
  });
});

describe('createCoffeeRush: rendering', () => {
  it('renders one ticket per order and one button per cup', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    expect(container.querySelectorAll('.coffee-rush__ticket')).toHaveLength(4);
    expect(container.querySelectorAll('.coffee-rush__cup')).toHaveLength(4);
  });

  it('reports the initial score and stats to the context on start', () => {
    const engine = createFakeEngine();
    engine.score = 4;
    const context = createFakeContext();
    createCoffeeRush({ engine }).start(container, context);

    expect(context.scoreCalls).toEqual([4]);
    expect(context.statsCalls).toEqual([engine.stats]);
  });
});

describe('createCoffeeRush: cup selection', () => {
  it('clicking a cup selects it', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    const thirdCup = container.querySelectorAll('.coffee-rush__cup')[2] as HTMLButtonElement;
    thirdCup.click();

    expect(engine.selectCalls).toEqual([2]);
  });

  it('ArrowLeft/ArrowRight and A/D move the selection', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D' }));

    expect(engine.selectDeltaCalls).toEqual([-1, 1, -1, 1]);
  });
});

describe('createCoffeeRush: pouring', () => {
  it('holding SPACE starts the pour and releasing it stops the pour', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(engine.startPourCalls).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    expect(engine.releasePourCalls).toBe(1);
  });

  it('a repeated keydown (held key) does not start the pour again', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    expect(engine.startPourCalls).toBe(1);
  });

  it('the pour button also starts/stops the pour', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    const pourButton = container.querySelector('.coffee-rush__pour-button') as HTMLButtonElement;
    pourButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(engine.startPourCalls).toBe(1);
    pourButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(engine.releasePourCalls).toBe(1);
  });

  it('reports updated score/stats and shows a toast after a perfect pour', () => {
    const engine = createFakeEngine();
    engine.nextReleaseOutcome = 'perfect';
    const context = createFakeContext();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, context);

    engine.score = 1;
    engine.stats.small = 1;
    engine.stats.perfect = 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    expect(context.scoreCalls.at(-1)).toBe(1);
    expect(context.statsCalls.at(-1)).toEqual(engine.stats);
    const toast = container.querySelector('.coffee-rush__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('PERFECT +10'); // head order is 'small' -> 5 + 5 bonus
  });

  it('shows SPILLED for a spilled release and does not report a served cup', () => {
    const engine = createFakeEngine();
    engine.nextReleaseOutcome = 'spilled';
    const context = createFakeContext();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, context);

    const callsAfterStart = context.scoreCalls.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    expect(context.scoreCalls.length).toBeGreaterThan(callsAfterStart);
    const toast = container.querySelector('.coffee-rush__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('SPILLED');
  });

  it('releasing without pouring ("none") does not toast', () => {
    const engine = createFakeEngine();
    engine.nextReleaseOutcome = 'none';
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    const toast = container.querySelector('.coffee-rush__toast') as HTMLElement;
    expect(toast.hidden).toBe(true);
  });
});

describe('createCoffeeRush: pause/resume/end own their own ticking and listeners', () => {
  it('ticks the engine on an interval while playing, and stops on pause', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
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
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());
    minigame.pause();
    const countAtResume = engine.tickCalls.length;

    minigame.resume();
    vi.advanceTimersByTime(300);
    expect(engine.tickCalls.length).toBeGreaterThan(countAtResume);
  });

  it('end() stops ticking and removes the keydown/keyup listeners', () => {
    const engine = createFakeEngine();
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, createFakeContext());

    const result = minigame.end();
    expect(result).toEqual({ score: engine.score, stats: engine.stats });

    const countAfterEnd = engine.tickCalls.length;
    vi.advanceTimersByTime(1000);
    expect(engine.tickCalls.length).toBe(countAfterEnd);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(engine.startPourCalls).toBe(0);
  });

  it('debugFinishNow() calls context.finish()', () => {
    const engine = createFakeEngine();
    const context = createFakeContext();
    const finishSpy = vi.spyOn(context, 'finish');
    const minigame = createCoffeeRush({ engine });
    minigame.start(container, context);

    minigame.debugFinishNow();
    expect(finishSpy).toHaveBeenCalledTimes(1);
  });
});
