// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameContext } from '../minigame';
import { createSnowConeStand } from './snow-cone-stand';
import type {
  Customer,
  FlavorIndex,
  ServeOutcome,
  SnowConeStandStats,
} from './snow-cone-stand-engine';

/**
 * A scriptable fake matching `SnowConeStandEngine`'s shape, so
 * `snow-cone-stand.ts`'s DOM wiring (keys, clicks, rendering, and the tick
 * loop) can be tested at its own seam without depending on the real
 * engine's timing or randomness. Deliberately mutable (unlike the real,
 * readonly-ish `SnowConeStandEngine`) so tests can script state directly;
 * still structurally assignable wherever `SnowConeStandEngine` is expected.
 * The real engine's own rules (order matching, patience, payout) are
 * `snow-cone-stand-engine.test.ts`'s job.
 */
function emptyStats(): SnowConeStandStats {
  return {
    cone5: 0,
    cone10: 0,
    cone15: 0,
    cone25: 0,
    rushCone5: 0,
    rushCone10: 0,
    rushCone15: 0,
    rushCone25: 0,
    served: 0,
    lost: 0,
  };
}

function customer(order: FlavorIndex[], patience = 100): Customer {
  return { id: Math.random(), name: 'Elena', order, patience };
}

interface FakeEngine {
  stats: SnowConeStandStats;
  score: number;
  line: Customer[];
  yourScoops: FlavorIndex[];
  rush: boolean;
  elapsedSec: number;
  nextServeOutcome: ServeOutcome;
  tickCalls: number[];
  addFlavorCalls: FlavorIndex[];
  undoCalls: number;
  serveCalls: number;
  addFlavor(flavor: FlavorIndex): void;
  undo(): void;
  serve(): ServeOutcome;
  tick(dtSec: number): { waddledOff: boolean };
}

function createFakeEngine(): FakeEngine {
  const fake: FakeEngine = {
    stats: emptyStats(),
    score: 0,
    line: [customer([0]), customer([1, 2]), customer([3])],
    yourScoops: [],
    rush: false,
    elapsedSec: 0,
    nextServeOutcome: { result: 'empty' },
    tickCalls: [],
    addFlavorCalls: [],
    undoCalls: 0,
    serveCalls: 0,

    addFlavor(flavor: FlavorIndex) {
      fake.addFlavorCalls.push(flavor);
      fake.yourScoops.push(flavor);
    },
    undo() {
      fake.undoCalls += 1;
      fake.yourScoops.pop();
    },
    serve(): ServeOutcome {
      fake.serveCalls += 1;
      return fake.nextServeOutcome;
    },
    tick(dtSec: number) {
      fake.tickCalls.push(dtSec);
      return { waddledOff: false };
    },
  };
  return fake;
}

function createFakeContext(): MinigameContext<'snow-cone-stand'> & {
  scoreCalls: number[];
  statsCalls: Array<Partial<SnowConeStandStats>>;
} {
  const ctx = {
    scoreCalls: [] as number[],
    statsCalls: [] as Array<Partial<SnowConeStandStats>>,
    setScore(score: number) {
      ctx.scoreCalls.push(score);
    },
    setStats(stats: Partial<SnowConeStandStats>) {
      ctx.statsCalls.push(stats);
    },
    finish() {
      /* unused by Snow Cone Stand's own tests */
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

describe('createSnowConeStand: shape', () => {
  it('declares the id, duration, and the stat keys shown in the shell header', () => {
    const minigame = createSnowConeStand({ engine: createFakeEngine() });
    expect(minigame.id).toBe('snow-cone-stand');
    expect(minigame.durationSec).toBe(120);
    expect(Object.keys(minigame.statLabels)).toEqual(['served', 'lost']);
  });
});

describe('createSnowConeStand: rendering', () => {
  it('renders one customer card per line slot, marking the front customer', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    const cards = container.querySelectorAll('.snow-cone-stand__customer');
    expect(cards).toHaveLength(3);
    expect(cards[0].classList.contains('snow-cone-stand__customer--front')).toBe(true);
    expect(cards[1].classList.contains('snow-cone-stand__customer--front')).toBe(false);
    expect(cards[0].querySelector('.snow-cone-stand__customer-name')?.textContent).toBe('ELENA');
  });

  it('reports the initial score and stats to the context on start', () => {
    const engine = createFakeEngine();
    engine.score = 15;
    const context = createFakeContext();
    createSnowConeStand({ engine }).start(container, context);

    expect(context.scoreCalls).toEqual([15]);
    expect(context.statsCalls).toEqual([engine.stats]);
  });

  it('shows the rush-hour banner only while the engine reports rush', () => {
    const engine = createFakeEngine();
    engine.rush = true;
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    const banner = container.querySelector('.snow-cone-stand__rush-banner') as HTMLElement;
    expect(banner.hidden).toBe(false);
  });
});

describe('createSnowConeStand: building a cone', () => {
  it('keys 1-4 add a flavour', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));

    expect(engine.addFlavorCalls).toEqual([0, 2]);
  });

  it('a flavour menu button click adds that flavour', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.snow-cone-stand__flavor-button',
    );
    expect(buttons).toHaveLength(4);
    buttons[3].click();

    expect(engine.addFlavorCalls).toEqual([3]);
  });

  it('Backspace (or the UNDO button) undoes the last scoop', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    (container.querySelector('.snow-cone-stand__undo-button') as HTMLButtonElement).click();

    expect(engine.undoCalls).toBe(2);
  });
});

describe('createSnowConeStand: serving', () => {
  it('SPACE (or the SERVE button) serves the built cone', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    (container.querySelector('.snow-cone-stand__serve-button') as HTMLButtonElement).click();

    expect(engine.serveCalls).toBe(2);
  });

  it('reports the updated score/stats and shows a Tokens toast on a served cone', () => {
    const engine = createFakeEngine();
    engine.nextServeOutcome = { result: 'served', coneSize: 2, tokensAwarded: 10, rush: false };
    const context = createFakeContext();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, context);

    engine.score = 10;
    engine.stats.cone10 = 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(context.scoreCalls.at(-1)).toBe(10);
    expect(context.statsCalls.at(-1)).toEqual(engine.stats);
    const toast = container.querySelector('.snow-cone-stand__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('+10');
  });

  it('shows a RUSH-tagged toast for a rush-hour cone', () => {
    const engine = createFakeEngine();
    engine.nextServeOutcome = { result: 'served', coneSize: 1, tokensAwarded: 10, rush: true };
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    const toast = container.querySelector('.snow-cone-stand__toast') as HTMLElement;
    expect(toast.textContent).toBe('+10 RUSH');
  });

  it('shows WRONG ORDER on a mismatched serve', () => {
    const engine = createFakeEngine();
    engine.nextServeOutcome = { result: 'wrong-order' };
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    const toast = container.querySelector('.snow-cone-stand__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('WRONG ORDER');
  });
});

describe('createSnowConeStand: pause/resume/end own their own ticking and listeners', () => {
  it('ticks the engine on an interval while playing, and stops on pause', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
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
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());
    minigame.pause();
    const countAtResume = engine.tickCalls.length;

    minigame.resume();
    vi.advanceTimersByTime(300);
    expect(engine.tickCalls.length).toBeGreaterThan(countAtResume);
  });

  it('shows a WADDLED OFF toast when a tick reports a lost customer', () => {
    const engine = createFakeEngine();
    engine.tick = (dtSec: number) => {
      engine.tickCalls.push(dtSec);
      return { waddledOff: true };
    };
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    vi.advanceTimersByTime(100);

    const toast = container.querySelector('.snow-cone-stand__toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('WADDLED OFF');
  });

  it('end() stops ticking and removes the keydown listener', () => {
    const engine = createFakeEngine();
    const minigame = createSnowConeStand({ engine });
    minigame.start(container, createFakeContext());

    const result = minigame.end();
    expect(result).toEqual({ score: engine.score, stats: engine.stats });

    const countAfterEnd = engine.tickCalls.length;
    vi.advanceTimersByTime(1000);
    expect(engine.tickCalls.length).toBe(countAfterEnd);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(engine.serveCalls).toBe(0);
  });
});
