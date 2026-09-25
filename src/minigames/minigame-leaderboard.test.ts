// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardEntry, ProgressStore } from '../persistence/progress-store';
import { mountMinigameLeaderboard } from './minigame-leaderboard';

function createFakeStore(overrides: Partial<ProgressStore> = {}): ProgressStore {
  return {
    loadAll: vi.fn(),
    saveLook: vi.fn(),
    recordRound: vi.fn(),
    purchase: vi.fn(),
    setSlot: vi.fn(),
    leaderboard: vi.fn(async () => []),
    ...overrides,
  } as ProgressStore;
}

function root(container: HTMLElement): HTMLElement {
  return container.querySelector('.minigame-leaderboard') as HTMLElement;
}

const ORIGINAL_URL = window.location.href;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', ORIGINAL_URL);
});

describe('mountMinigameLeaderboard', () => {
  it('shows loading synchronously, then ready once the read resolves', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    let resolve!: (entries: LeaderboardEntry[]) => void;
    const promise = new Promise<LeaderboardEntry[]>((res) => {
      resolve = res;
    });
    const store = createFakeStore({ leaderboard: vi.fn(() => promise) });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });

    expect(root(container).dataset.state).toBe('loading');
    expect(root(container).querySelector('.minigame-leaderboard__body')?.textContent).toBe(
      'LOADING…',
    );

    resolve([{ rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false }]);
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    const row = root(container).querySelector('.minigame-leaderboard__row') as HTMLElement;
    expect(row.dataset.rank).toBe('1');
    expect(row.dataset.me).toBeUndefined();
    expect(row.querySelector('.minigame-leaderboard__name')?.textContent).toBe('ALPHA');
    expect(row.querySelector('.minigame-leaderboard__score')?.textContent).toBe('300');
  });

  it('calls store.leaderboard exactly once, with the given minigameId and maxRows', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const leaderboard = vi.fn(async () => []);
    const store = createFakeStore({ leaderboard });

    mountMinigameLeaderboard(container, { store, minigameId: 'pancake-flip', maxRows: 5 });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('empty'));

    expect(leaderboard).toHaveBeenCalledTimes(1);
    expect(leaderboard).toHaveBeenCalledWith('pancake-flip', 5);
  });

  it('shows the empty state with no rows', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const store = createFakeStore({ leaderboard: vi.fn(async () => []) });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });

    await vi.waitFor(() => expect(root(container).dataset.state).toBe('empty'));
    expect(root(container).querySelector('.minigame-leaderboard__body')?.textContent).toBe(
      'No scores yet',
    );
    expect(root(container).querySelectorAll('.minigame-leaderboard__row')).toHaveLength(0);
  });

  it('shows the error state when the store rejects', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const store = createFakeStore({
      leaderboard: vi.fn(async () => {
        throw new Error('network down');
      }),
    });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });

    await vi.waitFor(() => expect(root(container).dataset.state).toBe('error'));
    expect(root(container).querySelector('.minigame-leaderboard__body')?.textContent).toBe(
      'Leaderboard unavailable',
    );
  });

  it('R4: a synchronous throw from store.leaderboard still resolves to the error state, never an uncaught throw', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const store = createFakeStore({
      leaderboard: vi.fn(() => {
        throw new Error('boom, synchronously');
      }),
    });

    expect(() =>
      mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' }),
    ).not.toThrow();

    await vi.waitFor(() => expect(root(container).dataset.state).toBe('error'));
  });

  it('round 2: a throw while rendering the resolved entries still shows the error state', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // Not a real array: triggers a genuine throw inside renderReady's own
    // rendering logic (`entries.length`), rather than faking one via a
    // store-level rejection -- this is what `.then(render).catch(...)`
    // (not `.then(render, renderError)`) exists to catch.
    const malformed = null as unknown as LeaderboardEntry[];
    const store = createFakeStore({ leaderboard: vi.fn(async () => malformed) });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });

    await vi.waitFor(() => expect(root(container).dataset.state).toBe('error'));
    expect(root(container).querySelector('.minigame-leaderboard__body')?.textContent).toBe(
      'Leaderboard unavailable',
    );
  });

  it("R5: a gap separates the top rows from the caller's own row only when its rank jumps", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const entries: LeaderboardEntry[] = [
      { rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false },
      { rank: 2, penguinName: 'BRAVO', bestScore: 200, isMe: false },
      { rank: 13, penguinName: 'ME', bestScore: 10, isMe: true },
    ];
    const store = createFakeStore({ leaderboard: vi.fn(async () => entries) });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    const children = Array.from(
      root(container).querySelector('.minigame-leaderboard__body')!.children,
    );
    expect(children.map((el) => el.className)).toEqual([
      'minigame-leaderboard__row',
      'minigame-leaderboard__row',
      'minigame-leaderboard__gap',
      'minigame-leaderboard__row',
    ]);
    const ownRow = root(container).querySelector('[data-me="true"]') as HTMLElement;
    expect(ownRow.dataset.rank).toBe('13');
  });

  it('R5: no gap when every row is contiguous (a caller inside the top rows, or none at all)', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const entries: LeaderboardEntry[] = [
      { rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false },
      { rank: 2, penguinName: 'ME', bestScore: 200, isMe: true },
    ];
    const store = createFakeStore({ leaderboard: vi.fn(async () => entries) });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    expect(root(container).querySelectorAll('.minigame-leaderboard__gap')).toHaveLength(0);
  });

  it('renders a hostile penguinName as inert text, never as markup', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const hostile = '<img src=x onerror="window.__pwned = true">';
    const store = createFakeStore({
      leaderboard: vi.fn(async () => [
        { rank: 1, penguinName: hostile, bestScore: 1, isMe: false },
      ]),
    });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    const nameEl = root(container).querySelector('.minigame-leaderboard__name') as HTMLElement;
    expect(nameEl.textContent).toBe(hostile);
    expect(nameEl.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('sets dir="auto" on every name cell for bidi safety', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const store = createFakeStore({
      leaderboard: vi.fn(async () => [
        { rank: 1, penguinName: 'ALPHA', bestScore: 1, isMe: false },
      ]),
    });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    const nameEl = root(container).querySelector('.minigame-leaderboard__name') as HTMLElement;
    expect(nameEl.getAttribute('dir')).toBe('auto');
  });

  it('R6: ?masknames masks every row name, and leaves them alone without it', async () => {
    window.history.pushState({}, '', '/?masknames');
    const container = document.createElement('div');
    document.body.append(container);
    const store = createFakeStore({
      leaderboard: vi.fn(async () => [
        { rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false },
        { rank: 2, penguinName: 'BRAVO', bestScore: 200, isMe: true },
      ]),
    });

    mountMinigameLeaderboard(container, { store, minigameId: 'bug-squash' });
    await vi.waitFor(() => expect(root(container).dataset.state).toBe('ready'));

    const names = Array.from(root(container).querySelectorAll('.minigame-leaderboard__name')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['•••', '•••']);
  });
});
