// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOOK,
  gameEvents,
  type MinigameCompleted,
  type MinigameStatsMap,
} from '../contracts';
import {
  emptySlots,
  ProgressStoreError,
  type ProgressSnapshot,
  type ProgressStore,
  type RoundResult,
} from '../persistence/progress-store';
import { createOverlayManager } from '../ui/hud/overlay-manager';
import { isMinigameOpen } from './is-minigame-open';
import { createMinigameLauncher, type MinigameLauncher } from './minigame-launcher';
import { MINIGAME_OVERLAY_ID } from './minigame-shell';
import type { Minigame, MinigameContext, MinigameFactory } from './minigame';

interface FakeGameHandle {
  factory: MinigameFactory<'bug-squash'>;
  finishNow: () => void;
  setScoreAndStats: (score: number, stats: MinigameStatsMap['bug-squash']) => void;
  pauseCalls: number;
  resumeCalls: number;
  endCalls: number;
}

function createFakeGame(durationSec = 5, opts: { endThrows?: boolean } = {}): FakeGameHandle {
  let ctx: MinigameContext<'bug-squash'> | undefined;
  let score = 0;
  let stats: MinigameStatsMap['bug-squash'] = { squashed: 0, score: 0, bestCombo: 0, escaped: 0 };

  const handle: FakeGameHandle = {
    pauseCalls: 0,
    resumeCalls: 0,
    endCalls: 0,
    finishNow: () => ctx?.finish(),
    setScoreAndStats: (s, st) => {
      score = s;
      stats = st;
      ctx?.setScore(s);
      ctx?.setStats(st);
    },
    factory: () => {
      const game: Minigame<'bug-squash'> = {
        id: 'bug-squash',
        title: 'FAKE GAME',
        durationSec,
        howToPlay: ['Click the thing.'],
        statLabels: { squashed: 'SQUASHED' },
        start(_container, context) {
          ctx = context;
        },
        pause() {
          handle.pauseCalls += 1;
        },
        resume() {
          handle.resumeCalls += 1;
        },
        end() {
          handle.endCalls += 1;
          if (opts.endThrows) throw new Error('boom');
          return { score, stats };
        },
      };
      return game;
    },
  };
  return handle;
}

function baseSnapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    look: DEFAULT_LOOK,
    profileCreatedAt: null,
    tokens: 100,
    badges: [],
    bests: {},
    ownedItems: [],
    slots: emptySlots(),
    catalog: [],
    ...overrides,
  };
}

function createFakeStore(overrides: Partial<ProgressStore> = {}): ProgressStore {
  return {
    loadAll: vi.fn(async () => baseSnapshot()),
    saveLook: vi.fn(async () => {}),
    recordRound: vi.fn(async () => ({
      tokensAwarded: 25,
      balance: 125,
      newBest: true,
      badgeEarned: false,
    })),
    purchase: vi.fn(async () => ({ balance: 100 })),
    setSlot: vi.fn(async () => {}),
    leaderboard: vi.fn(async () => []),
    ...overrides,
  } as ProgressStore;
}

/** A promise plus its own `resolve`/`reject`, for tests that need to hold
 *  `recordRound` open across assertions. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let cleanupFns: Array<() => void> = [];

function setup(opts: { store?: ProgressStore; game?: FakeGameHandle } = {}) {
  const layer = document.createElement('div');
  document.body.append(layer);
  const overlays = createOverlayManager();
  const gameHandle = opts.game ?? createFakeGame();
  const store = opts.store ?? createFakeStore();
  const launcher: MinigameLauncher = createMinigameLauncher({
    layer,
    store,
    overlays,
    resolveRoomTitle: () => ({ title: 'DEV PIT', subtitle: 'x' }),
    registry: { 'bug-squash': gameHandle.factory },
  });

  cleanupFns.push(() => overlays.close(MINIGAME_OVERLAY_ID));
  cleanupFns.push(() => overlays.destroy());

  return { layer, overlays, store, gameHandle, launcher };
}

function startPlaying(layer: HTMLElement, launcher: MinigameLauncher): void {
  launcher.launch('bug-squash');
  (layer.querySelector('.minigame__button--start') as HTMLButtonElement).click();
}

/** `querySelector(selector)?.hidden`, typed: `hidden` is an `HTMLElement`
 *  property, not `Element`'s. */
function isHidden(root: HTMLElement, selector: string): boolean {
  return (root.querySelector(selector) as HTMLElement | null)?.hidden ?? false;
}

function fakeTimerConfig(): Parameters<typeof vi.useFakeTimers>[0] {
  return {
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
});

describe('minigame shell: finish vs quit', () => {
  it('calls recordRound exactly once when the round finishes', async () => {
    const { layer, store, gameHandle, launcher } = setup();
    startPlaying(layer, launcher);

    gameHandle.setScoreAndStats(80, { squashed: 8, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(store.recordRound).toHaveBeenCalledTimes(1));
    expect(store.recordRound).toHaveBeenCalledWith('bug-squash', 80, {
      squashed: 8,
      score: 0,
      bestCombo: 0,
      escaped: 0,
    });

    // Settles; still exactly once.
    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done')).toBe(false));
    expect(store.recordRound).toHaveBeenCalledTimes(1);
  });

  it('never calls recordRound when the Player quits', async () => {
    const { layer, store, launcher, overlays } = setup();
    startPlaying(layer, launcher);

    overlays.close(MINIGAME_OVERLAY_ID);

    // Give any stray microtask a chance to run before asserting the negative.
    await Promise.resolve();
    await Promise.resolve();

    expect(store.recordRound).not.toHaveBeenCalled();
    expect(layer.querySelector('.minigame')).toBeNull();
  });

  it('quitting from the how-to-play screen (before START) never calls end()', () => {
    const { layer, gameHandle, launcher, overlays } = setup();
    launcher.launch('bug-squash');
    expect(layer.querySelector('.minigame__howto')).toBeTruthy();

    overlays.close(MINIGAME_OVERLAY_ID);

    expect(gameHandle.endCalls).toBe(0);
    expect(layer.querySelector('.minigame')).toBeNull();
  });

  it('a real Escape keydown quits without recording', async () => {
    const { layer, store, launcher } = setup();
    startPlaying(layer, launcher);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(store.recordRound).not.toHaveBeenCalled();
    expect(layer.querySelector('.minigame')).toBeNull();
  });

  it('quitting while recordRound is still pending settles safely with exactly one call', async () => {
    const gate = deferred<RoundResult>();
    const recordRound = vi.fn(() => gate.promise);
    const { layer, gameHandle, launcher, overlays } = setup({
      store: createFakeStore({ recordRound }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(20, { squashed: 2, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    expect(recordRound).toHaveBeenCalledTimes(1);

    expect(() => overlays.close(MINIGAME_OVERLAY_ID)).not.toThrow();
    expect(layer.querySelector('.minigame')).toBeNull();

    gate.resolve({ tokensAwarded: 2, balance: 102, newBest: false, badgeEarned: false });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(recordRound).toHaveBeenCalledTimes(1);
  });

  it('calling finish() twice (or a timer racing finish) still records exactly once', async () => {
    const { layer, store, gameHandle, launcher } = setup();
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(15, { squashed: 1, score: 0, bestCombo: 0, escaped: 0 });

    gameHandle.finishNow();
    gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done')).toBe(false));
    expect(store.recordRound).toHaveBeenCalledTimes(1);
    expect(gameHandle.endCalls).toBe(1);
  });

  it('emits minigame:completed right after end() on finish, and never on quit', async () => {
    const completedSpy = vi.fn();
    const unsubscribe = gameEvents.on('minigame:completed', completedSpy);

    const finishRun = setup();
    startPlaying(finishRun.layer, finishRun.launcher);
    finishRun.gameHandle.setScoreAndStats(50, { squashed: 5, score: 0, bestCombo: 0, escaped: 0 });
    finishRun.gameHandle.finishNow();
    await vi.waitFor(() => expect(finishRun.store.recordRound).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(completedSpy).toHaveBeenCalledTimes(1));
    const payload = completedSpy.mock.calls[0][0] as MinigameCompleted;
    expect(payload).toEqual({
      minigameId: 'bug-squash',
      score: 50,
      stats: { squashed: 5, score: 0, bestCombo: 0, escaped: 0 },
    });

    const quitRun = setup();
    startPlaying(quitRun.layer, quitRun.launcher);
    quitRun.overlays.close(MINIGAME_OVERLAY_ID);
    await Promise.resolve();

    expect(completedSpy).toHaveBeenCalledTimes(1); // still just the finish above

    unsubscribe();
  });

  it('still emits minigame:completed when recordRound rejects', async () => {
    const completedSpy = vi.fn();
    const unsubscribe = gameEvents.on('minigame:completed', completedSpy);

    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        recordRound: vi.fn(async () => {
          throw new ProgressStoreError('round_too_soon');
        }),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(33, { squashed: 3, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(completedSpy).toHaveBeenCalledTimes(1));
    expect(completedSpy.mock.calls[0][0]).toEqual({
      minigameId: 'bug-squash',
      score: 33,
      stats: { squashed: 3, score: 0, bestCombo: 0, escaped: 0 },
    });

    unsubscribe();
  });

  it('shows an error on the done screen and skips recordRound and the event when end() throws', async () => {
    const throwingGame = createFakeGame(5, { endThrows: true });
    const completedSpy = vi.fn();
    const unsubscribe = gameEvents.on('minigame:completed', completedSpy);

    const { layer, store, launcher } = setup({ game: throwingGame });
    startPlaying(layer, launcher);
    throwingGame.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done')).toBe(false));
    expect(isHidden(layer, '.minigame__done-error')).toBe(false);
    expect(store.recordRound).not.toHaveBeenCalled();
    expect(completedSpy).not.toHaveBeenCalled();

    unsubscribe();
  });
});

describe('minigame shell: pending state', () => {
  it('shows the score immediately and hides tokens/best behind a SAVING state until recordRound settles', async () => {
    const gate = deferred<RoundResult>();
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({ recordRound: vi.fn(() => gate.promise) }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(40, { squashed: 4, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    expect(isHidden(layer, '.minigame__done')).toBe(false);
    expect(
      layer.querySelector('[data-done-stat="score"] .minigame__done-stat-value')?.textContent,
    ).toBe('40');
    expect(isHidden(layer, '.minigame__done-saving')).toBe(false);
    expect(isHidden(layer, '[data-done-stat="tokens"]')).toBe(true);
    expect(isHidden(layer, '[data-done-stat="best"]')).toBe(true);

    gate.resolve({ tokensAwarded: 5, balance: 105, newBest: false, badgeEarned: false });
    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-saving')).toBe(true));
    expect(isHidden(layer, '[data-done-stat="tokens"]')).toBe(false);
  });
});

describe('minigame shell: relaunch', () => {
  it('launch() while a Minigame overlay is already open is a no-op that returns the open instance', () => {
    const { layer, launcher, overlays } = setup();
    const first = launcher.launch('bug-squash');
    const second = launcher.launch('bug-squash');

    expect(second).toBe(first);
    expect(layer.querySelectorAll('.minigame').length).toBe(1);

    overlays.close(MINIGAME_OVERLAY_ID);
    expect(isMinigameOpen()).toBe(false);
    expect(layer.querySelector('.minigame')).toBeNull();
  });
});

describe('minigame shell: isMinigameOpen', () => {
  it('is true only while a shell is mounted', () => {
    const { layer, launcher, overlays } = setup();
    expect(isMinigameOpen()).toBe(false);

    launcher.launch('bug-squash');
    expect(isMinigameOpen()).toBe(true);

    overlays.close(MINIGAME_OVERLAY_ID);
    expect(isMinigameOpen()).toBe(false);
    expect(layer.querySelector('.minigame')).toBeNull();
  });
});

describe('minigame shell: pause', () => {
  it('stops the countdown while paused and resumes without losing elapsed time', () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, gameHandle, launcher } = setup({ game: createFakeGame(10) });
      startPlaying(layer, launcher);

      const timeValue = () => layer.querySelector('[data-counter="time"]')!.textContent;
      const initial = timeValue();

      vi.advanceTimersByTime(1000);
      expect(timeValue()).not.toBe(initial);

      (layer.querySelector('.minigame__button--pause') as HTMLButtonElement).click();
      expect(gameHandle.pauseCalls).toBe(1);
      const frozenAt = timeValue();

      vi.advanceTimersByTime(3000);
      expect(timeValue()).toBe(frozenAt);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
      expect(gameHandle.resumeCalls).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(timeValue()).not.toBe(frozenAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('P pauses directly, not just resumes', () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, gameHandle, launcher } = setup({ game: createFakeGame(10) });
      startPlaying(layer, launcher);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
      expect(gameHandle.pauseCalls).toBe(1);
      expect(
        (layer.querySelector('.minigame__button--pause') as HTMLButtonElement).textContent,
      ).toBe('RESUME');

      const frozenAt = layer.querySelector('[data-counter="time"]')!.textContent;
      vi.advanceTimersByTime(2000);
      expect(layer.querySelector('[data-counter="time"]')!.textContent).toBe(frozenAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores P with a modifier key, a repeat, or focus on an editable element', () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, gameHandle, launcher } = setup({ game: createFakeGame(10) });
      startPlaying(layer, launcher);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true }));
      expect(gameHandle.pauseCalls).toBe(0);

      const input = document.createElement('input');
      document.body.append(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      expect(gameHandle.pauseCalls).toBe(0);
      input.remove();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
      expect(gameHandle.pauseCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('running a round to 0 across a pause/resume still finishes exactly once', () => {
    vi.useFakeTimers(fakeTimerConfig());
    try {
      const { layer, store, launcher } = setup({ game: createFakeGame(2) });
      startPlaying(layer, launcher);

      vi.advanceTimersByTime(1000);
      (layer.querySelector('.minigame__button--pause') as HTMLButtonElement).click();
      vi.advanceTimersByTime(5000); // a long pause must not count toward the round
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' })); // resume
      vi.advanceTimersByTime(1000); // the remaining second elapses

      expect(isHidden(layer, '.minigame__done')).toBe(false);
      expect(store.recordRound).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('minigame shell: done screen', () => {
  it('shows the Badge panel only when badgeEarned is true', async () => {
    const withBadge = setup({
      store: createFakeStore({
        loadAll: vi.fn(async () => baseSnapshot({ bests: { 'bug-squash': 500 } })),
        recordRound: vi.fn(async () => ({
          tokensAwarded: 250,
          balance: 350,
          newBest: true,
          badgeEarned: true,
        })),
      }),
    });
    startPlaying(withBadge.layer, withBadge.launcher);
    withBadge.gameHandle.setScoreAndStats(500, {
      squashed: 50,
      score: 0,
      bestCombo: 0,
      escaped: 0,
    });
    withBadge.gameHandle.finishNow();
    await vi.waitFor(() => expect(isHidden(withBadge.layer, '.minigame__done-badge')).toBe(false));
    expect(withBadge.layer.querySelector('.minigame__done-badge-name')?.textContent).toContain(
      'Exterminator',
    );

    const withoutBadge = setup();
    startPlaying(withoutBadge.layer, withoutBadge.launcher);
    withoutBadge.gameHandle.setScoreAndStats(10, {
      squashed: 1,
      score: 0,
      bestCombo: 0,
      escaped: 0,
    });
    withoutBadge.gameHandle.finishNow();
    await vi.waitFor(() => expect(withoutBadge.store.recordRound).toHaveBeenCalledTimes(1));
    expect(isHidden(withoutBadge.layer, '.minigame__done-badge')).toBe(true);
  });

  it('shows tokensAwarded as the Tokens earned, never a client-computed payout', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        recordRound: vi.fn(async () => ({
          tokensAwarded: 77,
          balance: 177,
          newBest: false,
          badgeEarned: false,
        })),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(999, { squashed: 99, score: 0, bestCombo: 0, escaped: 0 }); // deliberately not 77/10

    gameHandle.finishNow();

    await vi.waitFor(() =>
      expect(
        layer.querySelector('[data-done-stat="tokens"] .minigame__done-stat-value')?.textContent,
      ).toBeTruthy(),
    );
    const tokensValue = layer.querySelector('[data-done-stat="tokens"] .minigame__done-stat-value');
    expect(tokensValue?.textContent).toBe('+77');
  });

  it('shows the NEW BEST marker and the post-save best from loadAll, never a client-side rawBest', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        loadAll: vi.fn(async () => baseSnapshot({ bests: { 'bug-squash': 300 } })),
        recordRound: vi.fn(async () => ({
          tokensAwarded: 10,
          balance: 110,
          newBest: true,
          badgeEarned: false,
        })),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(300, { squashed: 30, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-newbest')).toBe(false));
    expect(
      layer.querySelector('[data-done-stat="best"] .minigame__done-stat-value')?.textContent,
    ).toBe('300');

    const notBest = setup({
      store: createFakeStore({
        loadAll: vi.fn(async () => baseSnapshot({ bests: { 'bug-squash': 900 } })),
        recordRound: vi.fn(async () => ({
          tokensAwarded: 5,
          balance: 105,
          newBest: false,
          badgeEarned: false,
        })),
      }),
    });
    startPlaying(notBest.layer, notBest.launcher);
    notBest.gameHandle.setScoreAndStats(300, { squashed: 30, score: 0, bestCombo: 0, escaped: 0 });
    notBest.gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(notBest.layer, '.minigame__done-saving')).toBe(true));
    expect(isHidden(notBest.layer, '.minigame__done-newbest')).toBe(true);
    const bestValue = notBest.layer.querySelector(
      '[data-done-stat="best"] .minigame__done-stat-value',
    );
    expect(bestValue?.textContent).toBe('900');
  });

  it('hides the PERSONAL BEST row (never falls back to 0) when the post-save loadAll fails', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        loadAll: vi.fn(async () => {
          throw new ProgressStoreError('not_authenticated');
        }),
        recordRound: vi.fn(async () => ({
          tokensAwarded: 15,
          balance: 115,
          newBest: true,
          badgeEarned: false,
        })),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(200, { squashed: 20, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '[data-done-stat="tokens"]')).toBe(false));
    expect(isHidden(layer, '[data-done-stat="best"]')).toBe(true);
    expect(isHidden(layer, '.minigame__done-newbest')).toBe(true);
  });

  it('renders the score with no payout and a short message when recordRound rejects', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        recordRound: vi.fn(async () => {
          throw new ProgressStoreError('round_too_soon');
        }),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(60, { squashed: 6, score: 0, bestCombo: 0, escaped: 0 });

    expect(() => gameHandle.finishNow()).not.toThrow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-error')).toBe(false));
    expect(
      layer.querySelector('[data-done-stat="score"] .minigame__done-stat-value')?.textContent,
    ).toBe('60');
    expect(isHidden(layer, '[data-done-stat="tokens"]')).toBe(true); // no payout shown
    expect(isHidden(layer, '[data-done-stat="best"]')).toBe(true); // personal best not shown either
    expect((layer.querySelector('.minigame__done-error') as HTMLElement).textContent).toBeTruthy();
  });
});

describe('minigame shell: leaderboard panel (R4)', () => {
  it('mounts the panel once the done screen appears, after a successful save', async () => {
    const leaderboard = vi.fn(async () => []);
    const { layer, gameHandle, launcher } = setup({ store: createFakeStore({ leaderboard }) });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(80, { squashed: 8, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(leaderboard).toHaveBeenCalledTimes(1));
    expect(leaderboard).toHaveBeenCalledWith('bug-squash', expect.any(Number));
    expect(layer.querySelector('.minigame__done-leaderboard .minigame-leaderboard')).toBeTruthy();
  });

  it('a rejected recordRound still mounts the panel exactly once', async () => {
    const leaderboard = vi.fn(async () => []);
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        leaderboard,
        recordRound: vi.fn(async () => {
          throw new ProgressStoreError('round_too_soon');
        }),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(60, { squashed: 6, score: 0, bestCombo: 0, escaped: 0 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-error')).toBe(false));
    await vi.waitFor(() => expect(leaderboard).toHaveBeenCalledTimes(1));
  });

  it('a synchronous throw from store.leaderboard leaves the save rows intact', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        leaderboard: vi.fn(() => {
          throw new Error('boom, synchronously');
        }),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(80, { squashed: 8, score: 0, bestCombo: 0, escaped: 0 });

    expect(() => gameHandle.finishNow()).not.toThrow();

    await vi.waitFor(() => expect(isHidden(layer, '[data-done-stat="tokens"]')).toBe(false));
    expect(
      layer.querySelector('[data-done-stat="tokens"] .minigame__done-stat-value')?.textContent,
    ).toBe('+25');
    await vi.waitFor(() =>
      expect(layer.querySelector('.minigame-leaderboard')?.getAttribute('data-state')).toBe(
        'error',
      ),
    );
  });

  it('a throwing minigame.end() shows no panel', async () => {
    const throwingGame = createFakeGame(5, { endThrows: true });
    const leaderboard = vi.fn(async () => []);
    const { layer, launcher } = setup({
      game: throwingGame,
      store: createFakeStore({ leaderboard }),
    });
    startPlaying(layer, launcher);
    throwingGame.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done')).toBe(false));
    expect(layer.querySelector('.minigame-leaderboard')).toBeNull();
    expect(leaderboard).not.toHaveBeenCalled();
  });
});
