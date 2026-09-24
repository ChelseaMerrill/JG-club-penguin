// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gameEvents,
  type MinigameCompleted,
  type MinigameStatsMap,
} from '../contracts/game-events';
import { DEFAULT_LOOK } from '../contracts/penguin';
import {
  emptySlots,
  ProgressStoreError,
  type ProgressSnapshot,
  type ProgressStore,
} from '../persistence/progress-store';
import { createOverlayManager } from '../ui/hud/overlay-manager';
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

function createFakeGame(durationSec = 5): FakeGameHandle {
  let ctx: MinigameContext<'bug-squash'> | undefined;
  let score = 0;
  let stats: MinigameStatsMap['bug-squash'] = { squashed: 0 };

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
    ...overrides,
  } as ProgressStore;
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
  (layer.querySelector('.minigame__howto-start') as HTMLButtonElement).click();
}

/** `querySelector(selector)?.hidden`, typed: `hidden` is an `HTMLElement`
 *  property, not `Element`'s. */
function isHidden(root: HTMLElement, selector: string): boolean {
  return (root.querySelector(selector) as HTMLElement | null)?.hidden ?? false;
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

    gameHandle.setScoreAndStats(80, { squashed: 8 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(store.recordRound).toHaveBeenCalledTimes(1));
    expect(store.recordRound).toHaveBeenCalledWith('bug-squash', 80, { squashed: 8 });

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

  it('emits minigame:completed on finish and not on quit', async () => {
    const completedSpy = vi.fn();
    const unsubscribe = gameEvents.on('minigame:completed', completedSpy);

    const finishRun = setup();
    startPlaying(finishRun.layer, finishRun.launcher);
    finishRun.gameHandle.setScoreAndStats(50, { squashed: 5 });
    finishRun.gameHandle.finishNow();
    await vi.waitFor(() => expect(finishRun.store.recordRound).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(completedSpy).toHaveBeenCalledTimes(1));
    const payload = completedSpy.mock.calls[0][0] as MinigameCompleted;
    expect(payload).toEqual({ minigameId: 'bug-squash', score: 50, stats: { squashed: 5 } });

    const quitRun = setup();
    startPlaying(quitRun.layer, quitRun.launcher);
    quitRun.overlays.close(MINIGAME_OVERLAY_ID);
    await Promise.resolve();

    expect(completedSpy).toHaveBeenCalledTimes(1); // still just the finish above

    unsubscribe();
  });
});

describe('minigame shell: pause', () => {
  it('stops the timer while paused, and P toggles pause/resume', () => {
    vi.useFakeTimers();
    try {
      const { layer, gameHandle, launcher } = setup();
      startPlaying(layer, launcher);

      const timeValue = () => layer.querySelector('[data-counter="time"]')!.textContent;
      const initial = timeValue();

      vi.advanceTimersByTime(1000);
      expect(timeValue()).not.toBe(initial);

      (layer.querySelector('.minigame__pause') as HTMLButtonElement).click();
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
});

describe('minigame shell: done screen', () => {
  it('shows the Badge panel only when badgeEarned is true', async () => {
    const withBadge = setup({
      store: createFakeStore({
        recordRound: vi.fn(async () => ({
          tokensAwarded: 250,
          balance: 350,
          newBest: true,
          badgeEarned: true,
        })),
      }),
    });
    startPlaying(withBadge.layer, withBadge.launcher);
    withBadge.gameHandle.setScoreAndStats(500, { squashed: 50 });
    withBadge.gameHandle.finishNow();
    await vi.waitFor(() => expect(isHidden(withBadge.layer, '.minigame__done-badge')).toBe(false));
    expect(withBadge.layer.querySelector('.minigame__done-badge-name')?.textContent).toContain(
      'Exterminator',
    );

    const withoutBadge = setup();
    startPlaying(withoutBadge.layer, withoutBadge.launcher);
    withoutBadge.gameHandle.setScoreAndStats(10, { squashed: 1 });
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
    gameHandle.setScoreAndStats(999, { squashed: 99 }); // deliberately not 77/10
    gameHandle.finishNow();

    await vi.waitFor(() =>
      expect(layer.querySelector('.minigame__done-stat-value')?.textContent).toBeTruthy(),
    );
    const tokensValue = layer.querySelectorAll('.minigame__done-stat-value')[1];
    expect(tokensValue.textContent).toBe('+77');
  });

  it('shows the NEW BEST marker only when newBest is true', async () => {
    const { layer, gameHandle, launcher } = setup({
      store: createFakeStore({
        recordRound: vi.fn(async () => ({
          tokensAwarded: 10,
          balance: 110,
          newBest: true,
          badgeEarned: false,
        })),
      }),
    });
    startPlaying(layer, launcher);
    gameHandle.setScoreAndStats(300, { squashed: 30 });
    gameHandle.finishNow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-newbest')).toBe(false));

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
    notBest.gameHandle.setScoreAndStats(300, { squashed: 30 });
    notBest.gameHandle.finishNow();

    await vi.waitFor(() => expect(notBest.store.recordRound).toHaveBeenCalledTimes(1));
    expect(isHidden(notBest.layer, '.minigame__done-newbest')).toBe(true);
    const bestValue = notBest.layer.querySelectorAll('.minigame__done-stat-value')[2];
    expect(bestValue.textContent).toBe('900');
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
    gameHandle.setScoreAndStats(60, { squashed: 6 });

    expect(() => gameHandle.finishNow()).not.toThrow();

    await vi.waitFor(() => expect(isHidden(layer, '.minigame__done-error')).toBe(false));
    expect(layer.querySelector('.minigame__done-stat-value')?.textContent).toBe('60');
    const rows = layer.querySelectorAll('.minigame__done-stat');
    expect((rows[1] as HTMLElement).hidden).toBe(true); // tokens row: no payout shown
    expect((rows[2] as HTMLElement).hidden).toBe(true); // personal best row: not shown either
    expect((layer.querySelector('.minigame__done-error') as HTMLElement).textContent).toBeTruthy();
  });
});
