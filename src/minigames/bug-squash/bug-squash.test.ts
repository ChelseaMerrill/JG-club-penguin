// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameContext } from '../minigame';
import { createBugSquashMinigame } from './bug-squash';
import {
  CELL_COUNT,
  MAX_LIGHTS,
  type BugSquashEngine,
  type BugSquashHitResult,
  type BugSquashState,
  type BugSquashStats,
} from './bug-squash-engine';

/**
 * A scriptable fake matching `BugSquashEngine`'s shape, so `bug-squash.ts`'s
 * DOM wiring -- clicks, Ian's line, the done-screen result line, and the
 * tick loop -- can be tested at its own seam without the real engine's
 * timing or randomness. The real engine's own rules (lights, bug-count ramp,
 * lifetime, scoring) are `bug-squash-engine.test.ts`'s job.
 */
interface FakeEngine extends BugSquashEngine {
  state: BugSquashState;
  stats: BugSquashStats;
  /** What the next `hit()` call returns. */
  nextHitResult: BugSquashHitResult;
  /** How many escapes the next `tick()` call applies to `state.escaped`. */
  escapesThisTick: number;
  hitCalls: number[];
  tickCalls: number[];
}

function emptyCells(): BugSquashState['cells'] {
  return Array.from({ length: CELL_COUNT }, () => ({ bug: null }));
}

function createFakeEngine(): FakeEngine {
  const fake: FakeEngine = {
    state: {
      elapsedSec: 0,
      score: 0,
      squashed: 0,
      comboCount: 0,
      comboMultiplier: 1,
      bestComboMultiplier: 1,
      lights: MAX_LIGHTS,
      escaped: 0,
      ended: false,
      cells: emptyCells(),
    },
    stats: { score: 0, squashed: 0, bestCombo: 1, escaped: 0 },
    nextHitResult: { kind: 'miss' },
    escapesThisTick: 0,
    hitCalls: [],
    tickCalls: [],

    getState() {
      return fake.state;
    },
    getStats() {
      return fake.stats;
    },
    tick(dtSec) {
      fake.tickCalls.push(dtSec);
      if (fake.escapesThisTick > 0) {
        fake.state = { ...fake.state, escaped: fake.state.escaped + fake.escapesThisTick };
        fake.escapesThisTick = 0;
      }
    },
    hit(index) {
      fake.hitCalls.push(index);
      return fake.nextHitResult;
    },
    debugSetScore(score) {
      fake.state = { ...fake.state, score };
      fake.stats = { ...fake.stats, score };
    },
  };
  return fake;
}

function createFakeContext(): MinigameContext<'bug-squash'> {
  return {
    setScore() {
      /* unused directly by these tests */
    },
    setStats() {
      /* unused directly by these tests */
    },
    finish() {
      /* unused directly by these tests */
    },
  };
}

function ianLine(container: HTMLElement): string | null | undefined {
  return container.querySelector('.bug-squash__ian-line')?.textContent;
}

function clickCell(container: HTMLElement, index: number): void {
  container.querySelectorAll('.bug-squash__cell')[index].dispatchEvent(new MouseEvent('click'));
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

describe('createBugSquashMinigame: five build lights (#181)', () => {
  it('renders five lights, all lit at the start of a round', () => {
    const minigame = createBugSquashMinigame({ engine: createFakeEngine() });
    minigame.start(container, createFakeContext());

    expect(container.querySelectorAll('.bug-squash__light')).toHaveLength(5);
    expect(container.querySelectorAll('.bug-squash__light--lit')).toHaveLength(5);
  });
});

describe('createBugSquashMinigame: help text (#181)', () => {
  it("says 'Lose all five and CI fails.'", () => {
    const minigame = createBugSquashMinigame();
    expect(minigame.howToPlay.join(' ')).toContain('Lose all five and CI fails.');
  });
});

describe("createBugSquashMinigame: Ian's line under the grid (#181)", () => {
  it('shows the round-start line as soon as the round starts', () => {
    const minigame = createBugSquashMinigame({ engine: createFakeEngine() });
    minigame.start(container, createFakeContext());

    expect(ianLine(container)).toBe('Ian: "Tests running. Squash."');
  });

  it('rotates through the squash lines in order on consecutive squashes', () => {
    const engine = createFakeEngine();
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    engine.nextHitResult = { kind: 'squashed', points: 10, multiplier: 1 };
    clickCell(container, 0);
    expect(ianLine(container)).toBe('Ian: "Squashed."');

    clickCell(container, 1);
    expect(ianLine(container)).toBe('Ian: "Clean."');

    clickCell(container, 2);
    expect(ianLine(container)).toBe('Ian: "Green."');

    clickCell(container, 3);
    expect(ianLine(container)).toBe('Ian: "Ship it."');

    clickCell(container, 4);
    expect(ianLine(container)).toBe('Ian: "Squashed."');
  });

  it('shows the flaky-hit line on a partial hit', () => {
    const engine = createFakeEngine();
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    engine.nextHitResult = { kind: 'partial' };
    clickCell(container, 0);

    expect(ianLine(container)).toBe('Ian: "Flaky. Again!"');
  });

  it('shows the empty-click line on a miss', () => {
    const engine = createFakeEngine();
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    engine.nextHitResult = { kind: 'miss' };
    clickCell(container, 0);

    expect(ianLine(container)).toBe('Ian: "That was a feature."');
  });

  it('rotates through the escape lines in order as escapes happen', () => {
    const engine = createFakeEngine();
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    engine.escapesThisTick = 1;
    vi.advanceTimersByTime(100);
    expect(ianLine(container)).toBe('Ian: "That one got into prod."');

    engine.escapesThisTick = 1;
    vi.advanceTimersByTime(100);
    expect(ianLine(container)).toBe('Ian: "Build light down."');

    engine.escapesThisTick = 1;
    vi.advanceTimersByTime(100);
    expect(ianLine(container)).toBe('Ian: "It is in the logs now."');

    engine.escapesThisTick = 1;
    vi.advanceTimersByTime(100);
    expect(ianLine(container)).toBe('Ian: "That one got into prod."');
  });
});

describe('createBugSquashMinigame: done-screen result line (#181)', () => {
  it('shows the failed line once all five lights are lost, regardless of score', () => {
    const engine = createFakeEngine();
    engine.state = { ...engine.state, lights: 0 };
    engine.stats = { ...engine.stats, score: 400 };
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    expect(minigame.doneSummary?.().quote).toBe('Ian: "Five escaped. Roll it back."');
  });

  it('shows the wall-of-fame line at 500+', () => {
    const engine = createFakeEngine();
    engine.stats = { ...engine.stats, score: 520 };
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    expect(minigame.doneSummary?.().quote).toBe(
      'Ian: "Wall of fame. Do not let it go to your head."',
    );
  });

  it('shows the passable line from 250 to 499', () => {
    const engine = createFakeEngine();
    engine.stats = { ...engine.stats, score: 300 };
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    expect(minigame.doneSummary?.().quote).toBe('Ian: "Passable. Squash faster next sprint."');
  });

  it('shows the lots-of-bugs-in-prod line under 250', () => {
    const engine = createFakeEngine();
    engine.stats = { ...engine.stats, score: 50 };
    const minigame = createBugSquashMinigame({ engine });
    minigame.start(container, createFakeContext());

    expect(minigame.doneSummary?.().quote).toBe('Ian: "That is a lot of bugs in prod."');
  });
});
