import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../contracts/penguin';
import { LEADERBOARD_SCORE_CEILINGS } from './leaderboard-rules';
import { createInMemoryProgressStore } from './in-memory-progress-store';
import { ProgressStoreError } from './progress-store';

const NAMED_LOOK = { ...DEFAULT_LOOK, name: 'CALLER ONE' };

describe('createInMemoryProgressStore().leaderboard', () => {
  it('rejects unknown_minigame', async () => {
    const store = createInMemoryProgressStore();

    await expect(
      // @ts-expect-error deliberately not a MinigameId, mirroring an unknown runtime value
      store.leaderboard('not-a-real-minigame'),
    ).rejects.toMatchObject({ code: 'unknown_minigame' });
  });

  it('ranks rivals by bestScore desc, then reachedAtMs asc on a tie', async () => {
    const store = createInMemoryProgressStore({
      leaderboardRivals: [
        { penguinName: 'ALPHA', minigameId: 'bug-squash', bestScore: 300, reachedAtMs: 10 },
        { penguinName: 'BRAVO', minigameId: 'bug-squash', bestScore: 200, reachedAtMs: 20 },
        { penguinName: 'CHARLIE', minigameId: 'bug-squash', bestScore: 200, reachedAtMs: 5 },
      ],
    });

    const rows = await store.leaderboard('bug-squash');

    expect(rows).toEqual([
      { rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false },
      { rank: 2, penguinName: 'CHARLIE', bestScore: 200, isMe: false },
      { rank: 3, penguinName: 'BRAVO', bestScore: 200, isMe: false },
    ]);
  });

  it("is_me is true on the caller's own row, wherever it ranks", async () => {
    const store = createInMemoryProgressStore({
      completedLook: NAMED_LOOK,
      leaderboardRivals: [
        { penguinName: 'ALPHA', minigameId: 'bug-squash', bestScore: 300, reachedAtMs: 10 },
      ],
    });
    await store.recordRound('bug-squash', 250, {
      score: 250,
      squashed: 25,
      bestCombo: 1,
      escaped: 0,
    });

    const rows = await store.leaderboard('bug-squash');

    expect(rows).toEqual([
      { rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false },
      { rank: 2, penguinName: 'CALLER ONE', bestScore: 250, isMe: true },
    ]);
  });

  it("appends the caller's own row outside max_rows, without duplicating it", async () => {
    const rivals = Array.from({ length: 10 }, (_, i) => ({
      penguinName: `RIVAL ${i}`,
      minigameId: 'bug-squash' as const,
      bestScore: 1000 - i * 10,
      reachedAtMs: i,
    }));
    const store = createInMemoryProgressStore({
      completedLook: NAMED_LOOK,
      leaderboardRivals: rivals,
    });
    await store.recordRound('bug-squash', 1, { score: 1, squashed: 1, bestCombo: 1, escaped: 0 });

    const rows = await store.leaderboard('bug-squash', 10);

    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 10).every((row) => !row.isMe)).toBe(true);
    expect(rows[10]).toEqual({ rank: 11, penguinName: 'CALLER ONE', bestScore: 1, isMe: true });
  });

  it('R5: a named caller with no best sees the top N only, with no own row', async () => {
    const store = createInMemoryProgressStore({
      completedLook: NAMED_LOOK,
      leaderboardRivals: [
        { penguinName: 'ALPHA', minigameId: 'bug-squash', bestScore: 300, reachedAtMs: 10 },
      ],
    });

    const rows = await store.leaderboard('bug-squash');

    expect(rows).toEqual([{ rank: 1, penguinName: 'ALPHA', bestScore: 300, isMe: false }]);
  });

  it('R1: a rival with a blank (invisible-only) name never appears', async () => {
    const store = createInMemoryProgressStore({
      leaderboardRivals: [
        { penguinName: 'VISIBLE', minigameId: 'bug-squash', bestScore: 100, reachedAtMs: 1 },
        {
          penguinName: '​­‏',
          minigameId: 'bug-squash',
          bestScore: 999,
          reachedAtMs: 1,
        },
      ],
    });

    const rows = await store.leaderboard('bug-squash');

    expect(rows).toEqual([{ rank: 1, penguinName: 'VISIBLE', bestScore: 100, isMe: false }]);
  });

  it("R1: the caller's own row is also excluded when its name is blank", async () => {
    const store = createInMemoryProgressStore({
      completedLook: { ...DEFAULT_LOOK, name: '' },
      leaderboardRivals: [
        { penguinName: 'VISIBLE', minigameId: 'bug-squash', bestScore: 1, reachedAtMs: 1 },
      ],
    });
    // The fake tracks `bests`/`bestReachedAtMs` independent of `look.name`,
    // so a high score is reachable even with a blank name (mirroring a
    // Player who has played a Minigame before finishing the Creator).
    await store.recordRound('bug-squash', 999, {
      score: 999,
      squashed: 99,
      bestCombo: 1,
      escaped: 0,
    });

    const rows = await store.leaderboard('bug-squash', 1);

    expect(rows).toEqual([{ rank: 1, penguinName: 'VISIBLE', bestScore: 1, isMe: false }]);
  });

  it("R2: a rival above the Minigame's plausibility ceiling never appears", async () => {
    const ceiling = LEADERBOARD_SCORE_CEILINGS['bug-squash'] as number;
    const store = createInMemoryProgressStore({
      leaderboardRivals: [
        { penguinName: 'AT CEILING', minigameId: 'bug-squash', bestScore: ceiling, reachedAtMs: 1 },
        {
          penguinName: 'OVER CEILING',
          minigameId: 'bug-squash',
          bestScore: ceiling + 1,
          reachedAtMs: 1,
        },
      ],
    });

    const rows = await store.leaderboard('bug-squash');

    expect(rows).toEqual([{ rank: 1, penguinName: 'AT CEILING', bestScore: ceiling, isMe: false }]);
  });

  it('a Minigame with no ceiling (coffee-rush) excludes nothing on that basis', async () => {
    const store = createInMemoryProgressStore({
      leaderboardRivals: [
        {
          penguinName: 'HUGE SCORE',
          minigameId: 'coffee-rush',
          bestScore: 5_000_000,
          reachedAtMs: 1,
        },
      ],
    });

    const rows = await store.leaderboard('coffee-rush');

    expect(rows).toEqual([
      { rank: 1, penguinName: 'HUGE SCORE', bestScore: 5_000_000, isMe: false },
    ]);
  });

  it('clamps maxRows the same way the SQL store does: 0/-5 -> 1, null/undefined -> 10, huge -> 50', async () => {
    const rivals = Array.from({ length: 55 }, (_, i) => ({
      penguinName: `RIVAL ${i}`,
      minigameId: 'bug-squash' as const,
      bestScore: 10_000 - i,
      reachedAtMs: i,
    }));
    const store = createInMemoryProgressStore({ leaderboardRivals: rivals });

    await expect(store.leaderboard('bug-squash', 0)).resolves.toHaveLength(1);
    await expect(store.leaderboard('bug-squash', -5)).resolves.toHaveLength(1);
    await expect(store.leaderboard('bug-squash')).resolves.toHaveLength(10);
    await expect(store.leaderboard('bug-squash', 100_000)).resolves.toHaveLength(50);
  });

  it('a rival for a different Minigame never appears', async () => {
    const store = createInMemoryProgressStore({
      leaderboardRivals: [
        {
          penguinName: 'PANCAKE PLAYER',
          minigameId: 'pancake-flip',
          bestScore: 50,
          reachedAtMs: 1,
        },
      ],
    });

    await expect(store.leaderboard('bug-squash')).resolves.toEqual([]);
  });

  it('never rejects with a plain error for a known MinigameId (mirrors ProgressStoreError only)', async () => {
    const store = createInMemoryProgressStore();

    await expect(store.leaderboard('bug-squash')).resolves.toEqual([]);
  });

  it('an empty board resolves to []', async () => {
    const store = createInMemoryProgressStore();

    await expect(store.leaderboard('bug-squash')).resolves.toEqual([]);
    // Sanity: ProgressStoreError stays importable/usable alongside this store.
    expect(new ProgressStoreError('unknown_minigame').code).toBe('unknown_minigame');
  });
});
